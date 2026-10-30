/**
 * The arithmetic of the all-or-nothing expense save (lib/utils/expenseMoneyWrites.ts): what the
 * accounts and the loans become, given the assets as the transaction read them. The transaction
 * itself is held by `__tests__/expenseAtomicSave.test.ts`. Figures invented and round.
 */
import { describe, it, expect } from 'vitest';
import {
  assetIdsTouched,
  assetWritesOf,
  debtsAfterGivingBack,
  loanDebtsOf,
  loanIdsOfEdit,
  planDebtEditWrites,
  type ReadAsset,
} from '@/lib/utils/expenseMoneyWrites';

const NOW = new Date(2026, 9, 30, 12);
const TODAY = new Date(2026, 9, 30, 12);
const NEXT_MONTH = new Date(2026, 10, 30, 12);

const cash = (quantity: number): ReadAsset => ({ type: 'cash', assetClass: 'cash', quantity }) as ReadAsset;
const loan = (quantity: number, rate = 3): ReadAsset => ({ type: 'loan', assetClass: 'cash', quantity, debtInterestRate: rate }) as ReadAsset;
const property = (debt: number): ReadAsset => ({ type: 'realestate', assetClass: 'realestate', quantity: 1, outstandingDebt: debt, debtInterestRate: 3 }) as ReadAsset;

describe('assetIdsTouched', () => {
  it('names every account and loan once', () => {
    expect(assetIdsTouched([{ assetId: 'a', delta: -1 }, { assetId: 'b', delta: 1 }, { assetId: 'a', delta: -2 }], ['l', undefined, 'a'])).toEqual(['a', 'b', 'l']);
  });
});

describe('assetWritesOf', () => {
  it('nets the effects per account and rounds to the cent', () => {
    const assets = new Map([['a', cash(100)]]);
    expect(assetWritesOf(assets, [{ assetId: 'a', delta: -10.1 }, { assetId: 'a', delta: -0.2 }], new Map())).toEqual([{ assetId: 'a', fields: { quantity: 89.7 } }]);
  });

  it('writes nothing for effects that cancel out, or for an asset not found', () => {
    const assets = new Map([['a', cash(100)]]);
    expect(assetWritesOf(assets, [{ assetId: 'a', delta: -5 }, { assetId: 'a', delta: 5 }, { assetId: 'gone', delta: 3 }], new Map([['gone-loan', 10]]))).toEqual([]);
  });

  it('sets a loan on its principal and a legacy property on its debt field', () => {
    const assets = new Map([['l', loan(1000)], ['p', property(2000)]]);
    expect(assetWritesOf(assets, [], new Map([['l', 900], ['p', 1900]]))).toEqual([
      { assetId: 'l', fields: { quantity: 900 } },
      { assetId: 'p', fields: { outstandingDebt: 1900 } },
    ]);
  });
});

describe('debtsAfterGivingBack', () => {
  it('adds back the principal the applied rows had repaid; a pending row gives nothing', () => {
    const loans = loanDebtsOf(new Map([['l', loan(1000)]]), ['l']);
    const rows = [
      { debtAssetId: 'l', debtPrincipalRepaid: 50 },
      { debtAssetId: 'l', debtPrincipalRepaid: 25 },
      { debtAssetId: 'l', debtPrincipalRepaid: 99, balancePending: true },
    ];
    expect(debtsAfterGivingBack(rows, loans)).toEqual(new Map([['l', 1075]]));
  });
});

describe('planDebtEditWrites', () => {
  const before = { type: 'debt' as const, amount: -1000, debtAssetId: 'l', debtPrincipalRepaid: 750 };

  it('changes nothing when the edit leaves the repayment alone (a note, a category)', () => {
    const after = { type: 'debt' as const, amount: -1000, debtAssetId: 'l', date: TODAY };
    expect(loanIdsOfEdit(before, after, NOW)).toEqual([]);
    expect(planDebtEditWrites(before, after, NOW, new Map())).toEqual({ debts: new Map(), touchesStamp: false, stamp: null });
  });

  it('gives back and splits again on the debt as it now stands', () => {
    const after = { type: 'debt' as const, amount: -1250, debtAssetId: 'l', date: TODAY };
    const loans = loanDebtsOf(new Map([['l', loan(99250)]]), loanIdsOfEdit(before, after, NOW));
    // Back to 100.000: 250 of interest, 1.000 of principal.
    expect(planDebtEditWrites(before, after, NOW, loans)).toEqual({ debts: new Map([['l', 99000]]), touchesStamp: true, stamp: { interest: 250, principal: 1000 } });
  });

  it('gives back and clears the stamp when the row moves to next month', () => {
    const after = { type: 'debt' as const, amount: -1000, debtAssetId: 'l', date: NEXT_MONTH };
    const loans = loanDebtsOf(new Map([['l', loan(99250)]]), loanIdsOfEdit(before, after, NOW));
    expect(planDebtEditWrites(before, after, NOW, loans)).toEqual({ debts: new Map([['l', 100000]]), touchesStamp: true, stamp: null });
  });

  it('deletes a stale stamp on a row that repays nothing any more', () => {
    const stale = { type: 'variable' as const, amount: -10, debtPrincipalRepaid: 0 };
    expect(planDebtEditWrites(stale, { type: 'variable', amount: -10, date: TODAY }, NOW, new Map())).toEqual({ debts: new Map(), touchesStamp: true, stamp: null });
  });
});
