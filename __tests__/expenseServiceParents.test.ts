/**
 * `createExpenseSettledOnDate` hands back the PARENT rows it wrote (`parents`, since 2026-10-12):
 * the row as a reader would return it — its fields, its id, its date as a `Date` — one per parent
 * and in the parents' order, the fees excluded. Tracciamento's «+» on a phone reveals the saved
 * row before the refetch lands, and it can only do so with the row in hand: the id alone cannot
 * say whether the row is in the period or passes the filters.
 *
 * Firestore is mocked at the module boundary (as `__tests__/mortgageInstalmentsQuery.test.ts`):
 * `doc(collectionRef)` mints an id, `writeBatch` records what is set. Seen red on 2026-10-12 with
 * the fee rows pushed into `parents` beside their parents (two parents for one row with a fee, five
 * for a series of three with a fee each).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExpenseFormData } from '@/types/expenses';

let minted = 0;
const batchSets: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  // `doc(collectionRef)` mints a new reference; `doc(db, name, id)` names an existing one.
  doc: (ref: unknown, name?: string, id?: string) => (typeof name === 'string' ? { collectionName: name, id } : { id: `minted-${++minted}` }),
  writeBatch: () => ({
    set: (ref: { id: string }, data: Record<string, unknown>) => batchSets.push({ id: ref.id, data }),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (n: number) => ({ limit: n }),
  deleteField: () => '__deleteField__',
  Timestamp: { now: () => new Date('2026-10-12T09:00:00Z'), fromDate: (date: Date) => date },
}));

import { createExpenseSettledOnDate, type ExpenseFee } from '@/lib/services/expenseService';

const NOW = new Date(2026, 9, 12, 12);

function form(overrides: Partial<ExpenseFormData> = {}): ExpenseFormData {
  return {
    type: 'variable',
    categoryId: 'cat-food',
    amount: 42,
    currency: 'EUR',
    date: new Date(2026, 9, 12, 0, 0, 0),
    notes: 'Ornitorinco al mercato',
    isRecurring: false,
    isInstallment: false,
    linkedCashAssetId: 'acct-1',
    ...overrides,
  };
}

const FEE: ExpenseFee = { amount: 1.5, category: { categoryId: 'cat-fees', categoryName: 'Commissioni bancarie', type: 'fixed' }, notes: 'Commissione' };

describe('createExpenseSettledOnDate → parents', () => {
  beforeEach(() => {
    minted = 0;
    batchSets.length = 0;
  });

  it('returns the one row it wrote, as a reader would hand it out, its id the first of `ids`', async () => {
    const result = await createExpenseSettledOnDate('owner', form(), 'Alimentari', 'Mercato', NOW);

    expect(result.parents).toHaveLength(1);
    const [row] = result.parents;
    expect(row.id).toBe(result.ids[0]);
    expect(row).toMatchObject({ userId: 'owner', type: 'variable', amount: -42, categoryName: 'Alimentari', subCategoryName: 'Mercato', notes: 'Ornitorinco al mercato', linkedCashAssetId: 'acct-1' });
    expect(row.date).toBeInstanceOf(Date);
    expect(row.date.getTime()).toBe(form().date.getTime());
    // What was written is what is handed back.
    expect(batchSets.map((set) => set.id)).toEqual([row.id]);
  });

  it('excludes the fee row: one parent for a row with a fee, the fee id after it in `ids`', async () => {
    const result = await createExpenseSettledOnDate('owner', form(), 'Alimentari', undefined, NOW, FEE);

    expect(result.ids).toHaveLength(2);
    expect(result.parents).toHaveLength(1);
    expect(result.parents[0].id).toBe(result.ids[0]);
    expect(result.parents[0].transferFeeExpenseId).toBe(result.ids[1]);
    expect(result.parents.some((row) => row.feeOfTransferId)).toBe(false);
  });

  it('returns every occurrence of a series in order, the fees of each left out', async () => {
    const result = await createExpenseSettledOnDate(
      'owner',
      form({ isRecurring: true, recurringFrequency: 'monthly', recurringCount: 3, recurringDay: 12 }),
      'Alimentari',
      undefined,
      NOW,
      FEE,
    );

    expect(result.ids).toHaveLength(6);
    expect(result.parents).toHaveLength(3);
    expect(result.parents.map((row) => row.id)).toEqual(result.ids.slice(0, 3));
    expect(result.parents.every((row) => row.isRecurring && !row.feeOfTransferId)).toBe(true);
    expect(result.parents.map((row) => row.date.getMonth())).toEqual([9, 10, 11]);
    // The rows still ahead wait for their date, the first one has moved its account.
    expect(result.parents.map((row) => row.balancePending ?? false)).toEqual([false, true, true]);
  });

  it('returns every instalment of a plan, dated one month apart', async () => {
    const result = await createExpenseSettledOnDate(
      'owner',
      form({ isInstallment: true, installmentCount: 2, installmentMode: 'auto', installmentTotalAmount: 300, installmentStartDate: new Date(2026, 9, 12) }),
      'Tecnologia',
      undefined,
      NOW,
    );

    expect(result.parents).toHaveLength(2);
    expect(result.parents.map((row) => row.amount)).toEqual([-150, -150]);
    expect(result.parents.map((row) => row.installmentNumber)).toEqual([1, 2]);
    expect(result.parents.map((row) => row.id)).toEqual(result.ids);
  });
});
