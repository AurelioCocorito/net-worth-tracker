/**
 * The bulk rewrites a category edit cascades into (2026-10-25):
 *   - they write in batches under Firestore's 500-operation ceiling, so a category used for years
 *     (more rows than one batch accepts) is rewritten whole instead of failing whole;
 *   - the reassignment that precedes a category's deletion is the move (`moveExpensesToCategory`):
 *     the rows take the destination's TYPE, not only its name — a variable expense reassigned to a
 *     fixed category is fixed in Analisi and in the 50/30/20 split.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { batches, getDocsMock } = vi.hoisted(() => ({
  batches: [] as { updates: { id: string; data: Record<string, unknown> }[]; committed: boolean }[],
  getDocsMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(async () => {}),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  doc: (_db: unknown, name: string, id: string) => ({ collectionName: name, id }),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction?: string) => ({ orderBy: field, direction }),
  writeBatch: () => {
    const batch = { updates: [] as { id: string; data: Record<string, unknown> }[], committed: false };
    batches.push(batch);
    return {
      update: (ref: { id: string }, data: Record<string, unknown>) => {
        if (batch.updates.length >= 500) throw new Error('A batch holds at most 500 operations');
        batch.updates.push({ id: ref.id, data });
      },
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => { batch.committed = true; }),
    };
  },
  runTransaction: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: () => '__deleteField__',
  Timestamp: { now: () => new Date('2026-10-25T09:00:00Z'), fromDate: (date: Date) => date },
}));

import {
  clearExpensesCategoryAssignment,
  moveExpensesToCategory,
  updateExpensesCategoryName,
  updateExpensesType,
} from '@/lib/services/expenseService';

function rows(count: number, amount = -20) {
  return {
    empty: count === 0,
    docs: Array.from({ length: count }, (_, i) => ({ ref: { id: `row-${i}` }, data: () => ({ amount }) })),
  };
}

const written = () => batches.flatMap((batch) => batch.updates);

describe('category bulk rewrites', () => {
  beforeEach(() => {
    batches.length = 0;
    getDocsMock.mockReset();
  });

  it.each([
    ['a rename', () => updateExpensesCategoryName('cat-1', 'Spesa', 'owner')],
    ['a type change', () => updateExpensesType('cat-1', 'variable', 'fixed', 'owner')],
    ['a clear on delete', () => clearExpensesCategoryAssignment('cat-1', 'owner')],
    ['a move or a reassignment on delete', () => moveExpensesToCategory('cat-1', 'variable', 'cat-2', 'Casa', 'fixed', 'owner')],
  ])('%s of 1000 rows writes every row, in batches under the ceiling', async (_case, run) => {
    getDocsMock.mockResolvedValue(rows(1000));

    await run();

    expect(written()).toHaveLength(1000);
    expect(new Set(written().map((update) => update.id)).size).toBe(1000);
    expect(batches.length).toBeGreaterThan(2);
    expect(batches.every((batch) => batch.committed && batch.updates.length <= 450)).toBe(true);
  });

  it('a reassignment re-types the rows to the destination category', async () => {
    getDocsMock.mockResolvedValue(rows(2));

    const count = await moveExpensesToCategory('cat-1', 'variable', 'cat-2', 'Casa', 'fixed', 'owner', 'sub-1', 'Affitto');

    expect(count).toBe(2);
    for (const { data } of written()) {
      expect(data).toMatchObject({
        categoryId: 'cat-2',
        categoryName: 'Casa',
        type: 'fixed',
        subCategoryId: 'sub-1',
        subCategoryName: 'Affitto',
      });
      // Both sides store a negative amount: no flip.
      expect(data.amount).toBeUndefined();
    }
  });

  it('a reassignment into an income category flips the stored sign', async () => {
    getDocsMock.mockResolvedValue(rows(1, -20));

    await moveExpensesToCategory('cat-1', 'variable', 'cat-3', 'Rimborsi', 'income', 'owner');

    expect(written()[0].data).toMatchObject({ type: 'income', amount: 20, subCategoryId: null });
  });

  it('a reassignment across the transfer boundary is refused before any write', async () => {
    getDocsMock.mockResolvedValue(rows(3));

    await expect(
      moveExpensesToCategory('cat-1', 'variable', 'cat-4', 'Trasferimenti', 'transfer', 'owner')
    ).rejects.toThrow();
    expect(batches).toHaveLength(0);
  });
});
