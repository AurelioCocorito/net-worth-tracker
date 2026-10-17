import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset } from '@/types/assets';
import {
  GoalBasedInvestingData,
  GoalAssetAssignment,
  InvestmentGoal,
} from '@/types/goals';
import { calculateAssetValue } from './assetService';
import { assignmentFraction, serializeAssignmentForFirestore, serializeGoalForFirestore } from '@/lib/utils/goalMath';
import { invalidateDashboardOverviewSummary } from './dashboardOverviewInvalidation';

// Goal-Based Investing Service
//
// Manages CRUD operations for investment goals and provides pure calculation
// functions for goal progress, allocation analysis, and validation.
// Data is stored as a single Firestore document per user.
//
// The math the server also needs — calculateGoalProgress and
// deriveTargetAllocationFromGoals — lives in lib/utils/goalMath.ts and is
// re-exported here: this module imports the client Firestore SDK at top level,
// so server-only code can never import it (doc/guide/panoramica.md § Panoramica and Dashboard
// Data Isolation). Client call sites keep importing them from here.
//
// A quota is a percent OR a number of units of its asset (2026-10-17, lib/utils/assetSlice.ts):
// every helper below reads it through `assignmentFraction`, so the two forms are one arithmetic.

export {
  calculateGoalProgress,
  deriveTargetAllocationFromGoals,
} from '@/lib/utils/goalMath';

const GOALS_COLLECTION = 'goalBasedInvesting';

// ==================== Firestore CRUD ====================

/** Fetch all goal data for a user, returns null if no document exists */
export async function getGoalData(
  userId: string
): Promise<GoalBasedInvestingData | null> {
  try {
    const docRef = doc(db, GOALS_COLLECTION, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      goals: (data.goals || []) as InvestmentGoal[],
      assignments: (data.assignments || []) as GoalAssetAssignment[],
    };
  } catch (error) {
    console.error('Error getting goal data:', error);
    throw new Error('Failed to fetch goal data');
  }
}

/** Save all goal data for a user (complete replacement) */
export async function saveGoalData(
  userId: string,
  data: GoalBasedInvestingData
): Promise<void> {
  try {
    const docRef = doc(db, GOALS_COLLECTION, userId);
    // Strip undefined values — Firestore rejects them inside an array element.
    // The allowlists are shared with POST /api/goals via goalMath's serializers.
    const cleanGoals = data.goals.map(serializeGoalForFirestore);
    await setDoc(docRef, {
      goals: cleanGoals,
      assignments: data.assignments.map(serializeAssignmentForFirestore),
      userId,
      updatedAt: new Date(),
    });
    // The Panoramica's Obiettivo tile reads this document.
    await invalidateDashboardOverviewSummary(userId, 'goal_data_saved');
  } catch (error) {
    console.error('Error saving goal data:', error);
    throw error;
  }
}

// ==================== Pure Calculation Functions ====================

/** The fraction of an asset its quotas add up to, across every goal but `excludeGoalId`. */
function assignedFractionOf(asset: Asset, assignments: GoalAssetAssignment[], excludeGoalId?: string): number {
  let total = 0;
  for (const assignment of assignments) {
    if (assignment.assetId === asset.id && assignment.goalId !== excludeGoalId) {
      total += assignmentFraction(assignment, asset);
    }
  }
  return total;
}

/**
 * Calculate total portfolio value not assigned to any goal.
 *
 * For each asset, sums the assigned fractions across all goals,
 * then adds the unassigned portion to the total.
 */
export function getUnassignedValue(
  assets: Asset[],
  assignments: GoalAssetAssignment[]
): number {
  let unassigned = 0;
  for (const asset of assets) {
    const assetValue = calculateAssetValue(asset);
    const unassignedFraction = Math.max(0, 1 - assignedFractionOf(asset, assignments));
    unassigned += assetValue * unassignedFraction;
  }
  return unassigned;
}

/**
 * Validate that no asset is over-assigned (its quotas past the whole of it).
 * Returns array of error messages, empty if valid.
 */
export function validateAssignments(
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): string[] {
  const errors: string[] = [];
  for (const asset of assets) {
    const totalPct = assignedFractionOf(asset, assignments) * 100;
    if (totalPct > 100) {
      errors.push(`${asset.name}: assegnato ${totalPct.toFixed(1)}% (max 100%)`);
    }
  }
  return errors;
}

/**
 * Remove orphaned assignments (references to deleted assets).
 * Returns a cleaned copy of the assignments array.
 */
export function cleanOrphanedAssignments(
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): GoalAssetAssignment[] {
  const assetIds = new Set(assets.map((a) => a.id));
  return assignments.filter((a) => assetIds.has(a.assetId));
}

/**
 * Get the available (unassigned) percentage of an asset, 0-100.
 * Takes into account all existing assignments except those for a specific goal
 * (useful when editing an existing assignment). The asset itself is needed since
 * 2026-10-17: a units quota is a share of ITS quantity.
 */
export function getAvailablePercentage(
  asset: Asset,
  assignments: GoalAssetAssignment[],
  excludeGoalId?: string
): number {
  // Rounded past float noise: «Esaurito» is decided on an exact 0.
  return Math.max(0, Math.round((100 - assignedFractionOf(asset, assignments, excludeGoalId) * 100) * 1e6) / 1e6);
}
