import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import {
  GoalAssetAssignment,
  GoalBasedInvestingData,
  InvestmentGoal,
} from '@/types/goals';
import { pickNextGoalColor, serializeAssignmentForFirestore, serializeGoalForFirestore } from '@/lib/utils/goalMath';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';

/**
 * Goal-Based Investing — the Admin-SDK gateway.
 *
 * `goalService.ts` is the client-SDK twin of this file and can never be imported
 * server-side (it pulls `firebase/firestore` and `db` at top level). Both read and
 * write the SAME single document per user, `goalBasedInvesting/{userId}`, rewritten
 * whole: there is no partial-update path, by design.
 */

const GOALS_COLLECTION = 'goalBasedInvesting';

/**
 * Read a user's goals and assignments with the Admin SDK.
 *
 * Returns null when the user has never opened Goal-Based Investing, which callers
 * must treat as "feature not in use" rather than "empty portfolio of goals".
 */
export async function getGoalDataAdmin(
  userId: string
): Promise<GoalBasedInvestingData | null> {
  const goalDoc = await adminDb.collection(GOALS_COLLECTION).doc(userId).get();

  if (!goalDoc.exists) {
    return null;
  }

  const data = goalDoc.data();

  if (!data) {
    return null;
  }

  return {
    goals: (data.goals ?? []) as InvestmentGoal[],
    assignments: (data.assignments ?? []) as GoalAssetAssignment[],
  };
}

/**
 * Append one goal to the user's document inside a transaction.
 *
 * The document is rewritten in full (the shape the client's `saveGoalData` also
 * writes), so the read-modify-write MUST be transactional: the FIRE page saves the
 * same document, and a plain read-then-set would drop whichever goal lost the race.
 * `assignments` and the goals already stored are carried over verbatim — they came
 * out of Firestore, so re-serialising them could only lose something.
 *
 * The colour is assigned here rather than by the caller so it is picked against the
 * very snapshot the write commits on: choosing it from an earlier read is how two
 * concurrently created goals end up the same colour.
 *
 * @returns the stored goal, colour included
 */
export async function appendInvestmentGoal(
  userId: string,
  goal: Omit<InvestmentGoal, 'color'>,
  // The quotas the proposal names (2026-10-20), percent of the asset; appended beside the goal.
  assignments: Omit<GoalAssetAssignment, 'goalId'>[] = []
): Promise<InvestmentGoal> {
  const docRef = adminDb.collection(GOALS_COLLECTION).doc(userId);

  const stored = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : undefined;
    const storedGoals = (data?.goals ?? []) as InvestmentGoal[];
    const storedAssignments = (data?.assignments ?? []) as GoalAssetAssignment[];

    const created: InvestmentGoal = { ...goal, color: pickNextGoalColor(storedGoals) };
    const createdAssignments = assignments.map((assignment) => ({ ...assignment, goalId: created.id }) as GoalAssetAssignment);

    tx.set(docRef, {
      goals: [...storedGoals, serializeGoalForFirestore(created)],
      assignments: [...storedAssignments, ...createdAssignments.map(serializeAssignmentForFirestore)],
      userId,
      updatedAt: new Date(),
    });

    return created;
  });
  // The Panoramica's Obiettivo tile reads this document.
  await invalidateDashboardOverviewSummaryServer(userId, 'goal_created');
  return stored;
}

/** The goal an update names is not in the document. */
export class GoalNotFoundError extends Error {
  constructor(goalId: string) {
    super(`Obiettivo ${goalId} non trovato`);
    this.name = 'GoalNotFoundError';
  }
}

/**
 * Rewrite one goal in place inside a transaction (the assistant's «Modifica» card, 2026-10-20):
 * the fields the proposal carries replace the goal's, its id, colour and creation date stay;
 * `assignments`, when given, REPLACE that goal's quotas (the other goals' survive the rewrite);
 * undefined leaves them as they are. The same whole-document rewrite as the append, for the
 * same reason: the FIRE page saves the same document.
 */
export async function updateInvestmentGoal(
  userId: string,
  goalId: string,
  fields: Omit<InvestmentGoal, 'id' | 'color' | 'createdAt' | 'updatedAt'>,
  assignments: Omit<GoalAssetAssignment, 'goalId'>[] | undefined
): Promise<InvestmentGoal> {
  const docRef = adminDb.collection(GOALS_COLLECTION).doc(userId);

  const updated = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : undefined;
    const storedGoals = (data?.goals ?? []) as InvestmentGoal[];
    const storedAssignments = (data?.assignments ?? []) as GoalAssetAssignment[];
    const current = storedGoals.find((goal) => goal.id === goalId);
    if (!current) throw new GoalNotFoundError(goalId);

    // The optional fields are REPLACED, not merged: a proposal that drops the deadline removes it.
    const next: InvestmentGoal = {
      id: current.id,
      color: current.color,
      createdAt: current.createdAt,
      updatedAt: new Date(),
      ...fields,
    };
    const nextAssignments =
      assignments === undefined
        ? storedAssignments
        : [...storedAssignments.filter((assignment) => assignment.goalId !== goalId), ...assignments.map((assignment) => ({ ...assignment, goalId }) as GoalAssetAssignment)];

    tx.set(docRef, {
      goals: storedGoals.map((goal) => serializeGoalForFirestore(goal.id === goalId ? next : goal)),
      assignments: nextAssignments.map(serializeAssignmentForFirestore),
      userId,
      updatedAt: new Date(),
    });

    return next;
  });
  await invalidateDashboardOverviewSummaryServer(userId, 'goal_updated');
  return updated;
}
