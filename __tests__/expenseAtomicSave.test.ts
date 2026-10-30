/**
 * The expense form's saves are ALL OR NOTHING (2026-10-30): creating, editing and deleting a row
 * writes the row, its fee, the accounts and the loan in ONE transaction, so a lost connection can
 * never leave a row saved with its account unmoved, or a loan repaid twice.
 *
 * Firestore is an in-memory fake (`__tests__/fixtures/fakeFirestore.ts`): each test reads back
 * what the save LEFT, and `failNextCommit()` breaks the commit to show that nothing is left
 * half-way, and `commitCount()` that the save is ONE commit. Seen red on 2026-10-30 by forcing
 * the create through its long-series path (rows in a batch, the money in a transaction after): two
 * commits. Figures are invented and round (WORKFLOW.md § 1, rule 6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExpenseFormData } from '@/types/expenses';

import { fakeFirestore as fake } from './fixtures/fakeFirestore';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', async () => (await import('./fixtures/fakeFirestore')).fakeFirestore.module);

import {
  createExpenseSettledOnDate,
  deleteExpenseRows,
  deleteRecurringExpenses,
  saveExpenseEdit,
  type ExpenseEdit,
  type ExpenseFee,
} from '@/lib/services/expenseService';

const NOW = new Date(2026, 9, 30, 12);
const TODAY = new Date(2026, 9, 30, 12);
const NEXT_MONTH = new Date(2026, 10, 30, 12);
const FEE_CATEGORY = { categoryId: 'cat-fees', categoryName: 'Commissioni bancarie', type: 'fixed' as const };
const FEE: ExpenseFee = { amount: 2, category: FEE_CATEGORY, notes: 'Commissione' };

function form(overrides: Partial<ExpenseFormData> = {}): ExpenseFormData {
  return {
    type: 'variable',
    categoryId: 'cat-food',
    amount: 100,
    currency: 'EUR',
    date: TODAY,
    notes: 'Fenicottero al mercato',
    isRecurring: false,
    isInstallment: false,
    linkedCashAssetId: 'acct-1',
    ...overrides,
  };
}

const balance = (id: string) => fake.get(`assets/${id}`)?.quantity;
const expenses = () => fake.all('expenses');

/** A stored row, as the form would have written it. */
function putRow(id: string, data: Record<string, unknown>) {
  fake.put(`expenses/${id}`, { userId: 'owner', currency: 'EUR', categoryId: 'cat-food', categoryName: 'Alimentari', date: fake.timestamp(TODAY), ...data });
}

function edit(overrides: Partial<ExpenseEdit> = {}): ExpenseEdit {
  return {
    ownerId: 'owner',
    expenseId: 'row-1',
    updates: { type: 'variable', amount: 100, date: TODAY },
    categoryName: 'Alimentari',
    after: { type: 'variable', amount: -100, date: TODAY, currency: 'EUR', linkedCashAssetId: 'acct-1' },
    requestedFee: null,
    feeCategory: FEE_CATEGORY,
    feeNote: 'Commissione',
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  fake.reset();
  fake.put('assets/acct-1', { userId: 'owner', type: 'cash', quantity: 1000 });
  fake.put('assets/acct-2', { userId: 'owner', type: 'cash', quantity: 500 });
  fake.put('assets/loan-1', { userId: 'owner', type: 'loan', quantity: 100000, debtInterestRate: 3 });
});

describe('createExpenseSettledOnDate — one transaction', () => {
  it('writes the row and moves its account together', async () => {
    const result = await createExpenseSettledOnDate('owner', form(), 'Alimentari', undefined, NOW);

    expect(result.assetsMoved).toBe(true);
    expect(expenses().size).toBe(1);
    expect(balance('acct-1')).toBe(900);
    expect(fake.commitCount()).toBe(1);
  });

  it('leaves NOTHING when the commit fails: no row, the account untouched', async () => {
    fake.failNextCommit();
    await expect(createExpenseSettledOnDate('owner', form(), 'Alimentari', undefined, NOW, FEE)).rejects.toMatchObject({ code: 'unavailable' });

    expect(expenses().size).toBe(0);
    expect(balance('acct-1')).toBe(1000);
  });

  it('writes a row with its fee and debits the account by both', async () => {
    const result = await createExpenseSettledOnDate('owner', form(), 'Alimentari', undefined, NOW, FEE);

    expect(result.ids).toHaveLength(2);
    expect(expenses().get(result.ids[0])?.transferFeeExpenseId).toBe(result.ids[1]);
    expect(expenses().get(result.ids[1])?.feeOfTransferId).toBe(result.ids[0]);
    expect(balance('acct-1')).toBe(898);
  });

  it('repays the loan with an instalment already due, and stamps the row with what it repaid', async () => {
    const result = await createExpenseSettledOnDate('owner', form({ type: 'debt', amount: 1000, debtAssetId: 'loan-1' }), 'Mutuo', undefined, NOW);

    // 3% on 100.000 is 250 of interest a month: 750 of principal.
    expect(balance('loan-1')).toBe(99250);
    expect(balance('acct-1')).toBe(0);
    expect(expenses().get(result.ids[0])).toMatchObject({ debtPrincipalRepaid: 750, debtInterestPaid: 250 });
  });

  it('moves nothing for a row still to come: it waits for its date', async () => {
    const result = await createExpenseSettledOnDate('owner', form({ date: NEXT_MONTH }), 'Alimentari', undefined, NOW);

    expect(result.assetsMoved).toBe(false);
    expect(expenses().get(result.ids[0])?.balancePending).toBe(true);
    expect(balance('acct-1')).toBe(1000);
  });

  it('moves only the occurrences already due of a series, all in the same commit', async () => {
    const result = await createExpenseSettledOnDate(
      'owner',
      form({ type: 'transfer', categoryId: 'cat-transfers', amount: 200, transferCashAssetId: 'acct-2', isRecurring: true, recurringFrequency: 'monthly', recurringCount: 3, recurringDay: 30 }),
      'Trasferimenti',
      undefined,
      NOW,
    );

    expect(result.parents).toHaveLength(3);
    expect(balance('acct-1')).toBe(800);
    expect(balance('acct-2')).toBe(700);
    expect(fake.commitCount()).toBe(1);
  });
});

describe('saveExpenseEdit — one transaction', () => {
  beforeEach(() => putRow('row-1', { type: 'variable', amount: -100, linkedCashAssetId: 'acct-1' }));

  it('moves the account by the difference of the new amount', async () => {
    const result = await saveExpenseEdit(edit({ updates: { type: 'variable', amount: 150, date: TODAY }, after: { ...edit().after, amount: -150 } }));

    expect(result).toMatchObject({ pending: false, feeExpenseId: null, assetsMoved: true });
    expect(fake.get('expenses/row-1')?.amount).toBe(-150);
    expect(balance('acct-1')).toBe(950);
    expect(fake.commitCount()).toBe(1);
  });

  it('leaves NOTHING when the commit fails: the row and the account as they were', async () => {
    fake.failNextCommit();
    await expect(
      saveExpenseEdit(edit({ updates: { type: 'variable', amount: 150, date: TODAY }, after: { ...edit().after, amount: -150 }, requestedFee: 2 }))
    ).rejects.toMatchObject({ code: 'unavailable' });

    expect(fake.get('expenses/row-1')?.amount).toBe(-100);
    expect(fake.get('expenses/row-1')?.transferFeeExpenseId).toBeUndefined();
    expect(expenses().size).toBe(1);
    expect(balance('acct-1')).toBe(1000);
  });

  it('creates the fee with the row, the parent pointing at it, the account debited', async () => {
    const result = await saveExpenseEdit(edit({ requestedFee: 2 }));

    expect(result.feeExpenseId).not.toBeNull();
    expect(fake.get('expenses/row-1')?.transferFeeExpenseId).toBe(result.feeExpenseId);
    expect(expenses().get(result.feeExpenseId!)).toMatchObject({ amount: -2, feeOfTransferId: 'row-1', categoryName: 'Commissioni bancarie' });
    expect(balance('acct-1')).toBe(998);
  });

  it('deletes the fee with the row, the parent unlinked, the account credited back', async () => {
    putRow('fee-1', { type: 'fixed', amount: -2, linkedCashAssetId: 'acct-1', feeOfTransferId: 'row-1' });
    fake.put('expenses/row-1', { ...fake.get('expenses/row-1')!, transferFeeExpenseId: 'fee-1' });

    const result = await saveExpenseEdit(edit({ requestedFee: null }));

    expect(result.feeExpenseId).toBeNull();
    expect(fake.get('expenses/fee-1')).toBeUndefined();
    expect(fake.get('expenses/row-1')?.transferFeeExpenseId).toBeUndefined();
    expect(balance('acct-1')).toBe(1002);
  });

  it('reads the row as STORED: an instalment settled while the dialog was open is given back as applied', async () => {
    // The form opened it pending; the server settled it since (account already debited, flag gone).
    putRow('row-1', { type: 'variable', amount: -100, linkedCashAssetId: 'acct-1' });

    await saveExpenseEdit(edit({ updates: { type: 'variable', amount: 100, date: NEXT_MONTH }, after: { ...edit().after, date: NEXT_MONTH } }));

    // Moved to next month: the 100 it had taken comes back, and it waits again.
    expect(balance('acct-1')).toBe(1100);
    expect(fake.get('expenses/row-1')?.balancePending).toBe(true);
  });

  it('gives back the principal and repays again on the new amount, with the stamp', async () => {
    putRow('row-1', { type: 'debt', amount: -1000, linkedCashAssetId: 'acct-1', debtAssetId: 'loan-1', debtPrincipalRepaid: 750, debtInterestPaid: 250 });
    fake.put('assets/loan-1', { userId: 'owner', type: 'loan', quantity: 99250, debtInterestRate: 3 });

    await saveExpenseEdit(
      edit({
        updates: { type: 'debt', amount: 1250, date: TODAY },
        after: { type: 'debt', amount: -1250, date: TODAY, currency: 'EUR', linkedCashAssetId: 'acct-1', debtAssetId: 'loan-1' },
      })
    );

    // Back to 100.000, then 1.250 − 250 of interest = 1.000 of principal.
    expect(balance('loan-1')).toBe(99000);
    expect(balance('acct-1')).toBe(750);
    expect(fake.get('expenses/row-1')).toMatchObject({ debtPrincipalRepaid: 1000, debtInterestPaid: 250 });
  });
});

describe('deleteExpenseRows — one transaction', () => {
  beforeEach(() => {
    putRow('row-1', { type: 'debt', amount: -1000, linkedCashAssetId: 'acct-1', debtAssetId: 'loan-1', debtPrincipalRepaid: 750, transferFeeExpenseId: 'fee-1' });
    putRow('fee-1', { type: 'fixed', amount: -2, linkedCashAssetId: 'acct-1', feeOfTransferId: 'row-1' });
    fake.put('assets/loan-1', { userId: 'owner', type: 'loan', quantity: 99250, debtInterestRate: 3 });
  });

  it('removes the row and its fee, gives back the account and the loan', async () => {
    const moved = await deleteExpenseRows('owner', [{ id: 'row-1' }, { id: 'fee-1' }]);

    expect(moved).toBe(true);
    expect(expenses().size).toBe(0);
    expect(balance('acct-1')).toBe(2002);
    expect(balance('loan-1')).toBe(100000);
    expect(fake.commitCount()).toBe(1);
  });

  it('leaves NOTHING when the commit fails: both rows, the account and the loan as they were', async () => {
    fake.failNextCommit();
    await expect(deleteExpenseRows('owner', [{ id: 'row-1' }, { id: 'fee-1' }])).rejects.toMatchObject({ code: 'unavailable' });

    expect(expenses().size).toBe(2);
    expect(balance('acct-1')).toBe(1000);
    expect(balance('loan-1')).toBe(99250);
  });

  it('unlinks the parent when a fee is deleted alone', async () => {
    await deleteExpenseRows('owner', [{ id: 'fee-1' }]);

    expect(fake.get('expenses/fee-1')).toBeUndefined();
    expect(fake.get('expenses/row-1')?.transferFeeExpenseId).toBeUndefined();
    expect(balance('acct-1')).toBe(1002);
  });

  it('gives back nothing for a row still waiting for its date', async () => {
    putRow('row-2', { type: 'variable', amount: -100, linkedCashAssetId: 'acct-1', balancePending: true, date: fake.timestamp(NEXT_MONTH) });

    expect(await deleteExpenseRows('owner', [{ id: 'row-2' }])).toBe(false);
    expect(balance('acct-1')).toBe(1000);
  });
});

describe('deleteRecurringExpenses — one transaction', () => {
  it('removes every occurrence and its fee, giving back only what was applied', async () => {
    putRow('occ-1', { type: 'fixed', amount: -50, linkedCashAssetId: 'acct-1', recurringParentId: 'series-1', transferFeeExpenseId: 'occ-1-fee' });
    putRow('occ-1-fee', { type: 'fixed', amount: -1, linkedCashAssetId: 'acct-1', feeOfTransferId: 'occ-1' });
    putRow('occ-2', { type: 'fixed', amount: -50, linkedCashAssetId: 'acct-1', recurringParentId: 'series-1', balancePending: true, transferFeeExpenseId: 'occ-2-fee' });
    putRow('occ-2-fee', { type: 'fixed', amount: -1, linkedCashAssetId: 'acct-1', feeOfTransferId: 'occ-2', balancePending: true });
    putRow('other', { type: 'fixed', amount: -10, linkedCashAssetId: 'acct-1' });

    const moved = await deleteRecurringExpenses('owner', 'series-1');

    expect(moved).toBe(true);
    expect([...expenses().keys()]).toEqual(['other']);
    expect(balance('acct-1')).toBe(1051);
    expect(fake.commitCount()).toBe(1);
  });
});
