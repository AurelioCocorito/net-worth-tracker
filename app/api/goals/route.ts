import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { goalProposalSchema, parseOr400 } from '@/lib/server/validation';
import { goalWriteAssignmentsSchema, type GoalProposal } from '@/lib/utils/goalProposal';
import { GoalNotFoundError, appendInvestmentGoal, updateInvestmentGoal } from '@/lib/server/goalData';
import { InvestmentGoal } from '@/types/goals';

/**
 * POST /api/goals
 *
 * Create one Goal-Based Investing goal. Body: { userId, goal: GoalProposal }.
 *
 * This is the confirmation half of the assistant's ```goal-proposal protocol: the model
 * proposes, the user presses Conferma, and only then does anything get written. The route
 * exists because the goal document is rewritten whole and the FIRE page writes the same
 * document — the append has to be transactional, which needs the Admin SDK.
 *
 * The write itself (id, colour, transaction) lives in lib/server/goalData.ts; the handler
 * only authenticates, validates and delegates. Since 2026-10-20 the body may carry
 * `assignments` — quotas already resolved to asset ids by the card — and PATCH below rewrites an
 * existing goal (`goalId`) the same way.
 */

/** The goal's own fields out of a validated proposal; `goalId` and `assignments` are the route's. */
function goalFieldsOf(proposal: GoalProposal): Omit<InvestmentGoal, 'id' | 'color' | 'createdAt' | 'updatedAt'> {
  return {
    name: proposal.name,
    priority: proposal.priority,
    ...(proposal.targetAmount != null ? { targetAmount: proposal.targetAmount } : {}),
    ...(proposal.targetDateIso != null ? { targetDate: proposal.targetDateIso } : {}),
    ...(proposal.monthlyContribution != null ? { monthlyContribution: proposal.monthlyContribution } : {}),
    ...(proposal.recommendedAllocation != null ? { recommendedAllocation: proposal.recommendedAllocation } : {}),
    ...(proposal.notes != null ? { notes: proposal.notes } : {}),
  };
}

/** Over 100% on one asset across the body's own quotas is refused here; across goals the page declares it. */
function assignmentsSumPastWhole(assignments: { assetId: string; percentage: number }[]): boolean {
  const byAsset = new Map<string, number>();
  for (const assignment of assignments) byAsset.set(assignment.assetId, (byAsset.get(assignment.assetId) ?? 0) + assignment.percentage);
  return [...byAsset.values()].some((total) => total > 100.0001);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    // Empty/invalid JSON must not throw before the auth and validation checks run.
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; goal?: unknown; assignments?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;

    // Delegation-aware: a shared-account member can create goals for the owner.
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(goalProposalSchema, body.goal);
    if (!parsed.ok) return parsed.response;
    const quotas = parseOr400(goalWriteAssignmentsSchema, body.assignments ?? []);
    if (!quotas.ok) return quotas.response;
    if (assignmentsSumPastWhole(quotas.data)) {
      return NextResponse.json({ error: 'Le quote di uno strumento superano il 100%.' }, { status: 400 });
    }

    const now = new Date();
    const goal: Omit<InvestmentGoal, 'color'> = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...goalFieldsOf(parsed.data),
    };

    const created = await appendInvestmentGoal(ownerId as string, goal, quotas.data);

    return NextResponse.json({ goal: created });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /goals] POST error:', error);
    return NextResponse.json({ error: "Impossibile creare l'obiettivo" }, { status: 500 });
  }
}

/**
 * PATCH /api/goals — rewrite one existing goal (the assistant's «Modifica» card, 2026-10-20).
 *
 * Body: { userId, goalId, goal: GoalProposal, assignments?: { assetId, percentage }[] }. The
 * goal's fields are REPLACED by the proposal's (the card shows before → after); `assignments`
 * present replaces that goal's quotas, absent leaves them. 404 when the goal is not there.
 */
export async function PATCH(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; goalId?: unknown; goal?: unknown; assignments?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const goalId = typeof body.goalId === 'string' ? body.goalId.trim() : '';
    if (!goalId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const parsed = parseOr400(goalProposalSchema, body.goal);
    if (!parsed.ok) return parsed.response;
    const quotas = body.assignments === undefined ? null : parseOr400(goalWriteAssignmentsSchema, body.assignments);
    if (quotas && !quotas.ok) return quotas.response;
    if (quotas && assignmentsSumPastWhole(quotas.data)) {
      return NextResponse.json({ error: 'Le quote di uno strumento superano il 100%.' }, { status: 400 });
    }

    const updated = await updateInvestmentGoal(ownerId as string, goalId, goalFieldsOf(parsed.data), quotas ? quotas.data : undefined);

    return NextResponse.json({ goal: updated });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: 'Obiettivo non trovato: forse è stato eliminato.' }, { status: 404 });
    }

    console.error('[API /goals] PATCH error:', error);
    return NextResponse.json({ error: "Impossibile aggiornare l'obiettivo" }, { status: 500 });
  }
}
