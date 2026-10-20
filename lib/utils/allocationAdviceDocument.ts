/**
 * The Consulente's document as it comes out of Firestore, mapped ONCE for both SDKs
 * (2026-10-20): the Admin store (`lib/server/allocationAdvice/store.ts`) and the client reader
 * (`lib/services/allocationAdviceService.ts`) read the same fields and convert the same dates,
 * so a field the run writes can never be read differently by the page. Pure: `toDate` handles
 * both SDKs' Timestamps.
 */

import { toDate } from '@/lib/utils/dateHelpers';
import type { AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';
import type { AllocationAdviceDocument, AllocationAdvicePriorPlan } from '@/types/allocationAdvice';

type Data = Record<string, unknown>;

function dateOrNull(value: unknown): Date | null {
  return value ? toDate(value as Date) : null;
}

function withFinishedAt<T extends { finishedAt: unknown }>(value: unknown): (Omit<T, 'finishedAt'> & { finishedAt: Date }) | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as T;
  return { ...record, finishedAt: toDate(record.finishedAt as Date) };
}

/** The plan in force a new run must read, or null when the last document has no finished report. */
export function priorPlanOf(document: AllocationAdviceDocument | null | undefined): AllocationAdvicePriorPlan | null {
  if (!document?.report) return null;
  return {
    reportMarkdown: document.report.markdown,
    revisions: (document.revisions ?? []).map((row) => row.request),
    finishedAt: document.report.finishedAt,
    appliedAt: document.applied?.at ?? null,
    reviewByIso: document.report.proposal?.reviewByIso ?? null,
    reviewReason: document.report.proposal?.reviewReason ?? null,
  };
}

export function mapAllocationAdviceData(userId: string, data: Data): AllocationAdviceDocument {
  const applied = data.applied as Data | null | undefined;
  return {
    userId,
    status: data.status as AllocationAdviceDocument['status'],
    answers: data.answers as AllocationAdviceAnswers,
    stage: (data.stage as AllocationAdviceDocument['stage']) ?? null,
    createdAt: toDate(data.createdAt as Date),
    updatedAt: toDate(data.updatedAt as Date),
    startedAt: dateOrNull(data.startedAt),
    strategy: withFinishedAt<NonNullable<AllocationAdviceDocument['strategy']>>(data.strategy),
    instruments: withFinishedAt<NonNullable<AllocationAdviceDocument['instruments']>>(data.instruments),
    report: withFinishedAt<NonNullable<AllocationAdviceDocument['report']>>(data.report),
    error: (data.error as string | null | undefined) ?? null,
    applied: applied ? { ...(applied as unknown as NonNullable<AllocationAdviceDocument['applied']>), at: toDate(applied.at as Date) } : null,
    revisions: Array.isArray(data.revisions)
      ? (data.revisions as Data[]).map((row) => ({ request: String(row.request ?? ''), at: toDate(row.at as Date) }))
      : [],
  };
}
