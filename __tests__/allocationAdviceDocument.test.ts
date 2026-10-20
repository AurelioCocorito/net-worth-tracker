/**
 * The Consulente's document mapper (lib/utils/allocationAdviceDocument.ts): the dates of every
 * stage converted, the absent parts null, the revisions («Chiedi una modifica», 2026-10-20)
 * always an array.
 */

import { describe, expect, it } from 'vitest';
import { mapAllocationAdviceData, priorPlanOf } from '@/lib/utils/allocationAdviceDocument';

const AT = new Date('2026-10-20T10:00:00.000Z');

describe('mapAllocationAdviceData', () => {
  it('maps a running document with nothing landed yet, revisions included', () => {
    const document = mapAllocationAdviceData('u1', { status: 'running', answers: { age: 35 }, stage: 'strategy', createdAt: AT, updatedAt: AT, startedAt: AT });
    expect(document).toMatchObject({ userId: 'u1', status: 'running', stage: 'strategy', strategy: null, instruments: null, report: null, error: null, applied: null, revisions: [] });
    expect(document.startedAt).toEqual(AT);
  });

  it('converts the dates of every stage, of the application and of each revision', () => {
    const document = mapAllocationAdviceData('u1', {
      status: 'applied',
      answers: {},
      stage: 'review',
      createdAt: AT,
      updatedAt: AT,
      startedAt: null,
      strategy: { markdown: 's', proposal: null, model: 'o', finishedAt: AT },
      instruments: { markdown: 'i', candidates: null, model: 's', webSearchUsed: true, finishedAt: AT },
      report: { markdown: 'r', proposal: null, model: 'o', finishedAt: AT },
      applied: { at: AT, targetsWritten: true, rolesChanged: 0, goalsWritten: 1 },
      revisions: [{ request: 'meno cripto', at: AT }],
    });
    expect(document.strategy?.finishedAt).toEqual(AT);
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.applied).toEqual({ at: AT, targetsWritten: true, rolesChanged: 0, goalsWritten: 1 });
    expect(document.revisions).toEqual([{ request: 'meno cripto', at: AT }]);
    expect(document.startedAt).toBeNull();
  });
});

describe('priorPlanOf', () => {
  it('is null without a finished report, and the report with its requests, dates and review otherwise', () => {
    const running = mapAllocationAdviceData('u1', { status: 'running', answers: {}, stage: 'strategy', createdAt: AT, updatedAt: AT, startedAt: AT });
    expect(priorPlanOf(running)).toBeNull();
    expect(priorPlanOf(null)).toBeNull();

    const ready = mapAllocationAdviceData('u1', {
      status: 'ready',
      answers: {},
      stage: 'review',
      createdAt: AT,
      updatedAt: AT,
      report: { markdown: 'r', proposal: { reviewByIso: '2028-01-15', reviewReason: 'perché' }, model: 'o', finishedAt: AT },
      revisions: [{ request: 'meno cripto', at: AT }],
    });
    expect(priorPlanOf(ready)).toEqual({ reportMarkdown: 'r', revisions: ['meno cripto'], finishedAt: AT, appliedAt: null, reviewByIso: '2028-01-15', reviewReason: 'perché' });
  });
});
