/**
 * Tests for the user's money that moves the net worth outside the cashflow — the pension
 * contributions and the principal repaid per debt — named beside the market and the savings on
 * the Panoramica, Patrimonio and the email instead of swelling «altre variazioni» (owner,
 * 2026-10-14). The rules are Storico's (`pensionPaidInAcross`, `debtRepaymentsBetween` in
 * lib/utils/marketEffect.ts); `computeMonthFlows` measures them against the live portfolio.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { PensionContribution } from '@/types/pension';

// computeMonthFlows reaches calculateAssetValue, whose module imports the client Firebase SDK
// (the convention of __tests__/dashboardOverviewUtils.test.ts).
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { debtRepaymentsBetween, pensionPaidInAcross, type DebtPositionRow } from '@/lib/utils/marketEffect';
import { computeMonthFlows } from '@/lib/utils/dashboardOverviewUtils';

const row = (overrides: Partial<DebtPositionRow> & { assetId: string }): DebtPositionRow => ({
  name: overrides.assetId,
  quantity: 1,
  price: 1,
  totalValue: 0,
  ...overrides,
});

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    userId: 'u1',
    ticker: '',
    name: overrides.id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function makeSnapshot(byAsset: MonthlySnapshot['byAsset']): MonthlySnapshot {
  return {
    userId: 'u1',
    year: 2026,
    month: 9,
    totalNetWorth: 0,
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset,
    assetAllocation: {},
    createdAt: new Date(0),
  };
}

const contribution = (amount: number, createdAt: Date): PensionContribution => ({
  id: `c${amount}`,
  userId: 'u1',
  assetId: 'fund',
  source: 'tfr',
  amount,
  date: createdAt,
  taxYear: 2026,
  deductible: false,
  createdAt,
});

describe('pensionPaidInAcross', () => {
  const contributions = [contribution(500, new Date(2026, 9, 13, 12)), contribution(200, new Date(2026, 10, 5, 12))];

  it('should sum the contributions whose value moved after the previous month, through the last one', () => {
    expect(pensionPaidInAcross(contributions, ['fund'], '2026-07', '2026-09')).toBe(700);
    expect(pensionPaidInAcross(contributions, ['fund'], '2026-07', '2026-09', '2026-10')).toBe(500);
  });

  it('should name nothing before the contributions are complete', () => {
    expect(pensionPaidInAcross(contributions, ['fund'], null, '2026-09')).toBe(0);
    expect(pensionPaidInAcross(contributions, ['fund'], '2026-10', '2026-09')).toBe(0);
  });
});

describe('debtRepaymentsBetween', () => {
  const loans = [
    { id: 'mutuo', name: 'Mutuo', financedAssetId: 'casa' },
    { id: 'auto', name: 'Prestito auto' },
  ];
  const realEstate = new Set(['casa']);

  it('should give each loan its own principal repaid, by name', () => {
    const before = [row({ assetId: 'mutuo', quantity: 100000, totalValue: -100000 }), row({ assetId: 'auto', quantity: 5000, totalValue: -5000 })];
    const after = [row({ assetId: 'mutuo', quantity: 99700, totalValue: -99700 }), row({ assetId: 'auto', quantity: 4850, totalValue: -4850 })];
    expect(debtRepaymentsBetween(before, after, loans, realEstate)).toEqual([
      { name: 'Mutuo', repaid: 300 },
      { name: 'Prestito auto', repaid: 150 },
    ]);
  });

  it('should read a loan opened in the window as new debt, and one closed as repaid in full', () => {
    expect(debtRepaymentsBetween([], [row({ assetId: 'auto', quantity: 20000, totalValue: -20000 })], loans, realEstate)).toEqual([
      { name: 'Prestito auto', repaid: -20000 },
    ]);
    // A loan deleted after its payoff is read by its negative value, named by its snapshot row.
    expect(debtRepaymentsBetween([row({ assetId: 'vecchio', name: 'Prestito chiuso', quantity: 800, totalValue: -800 })], [], loans, realEstate)).toEqual([
      { name: 'Prestito chiuso', repaid: 800 },
    ]);
  });

  /**
   * The migration month (2026-10-10): the previous snapshot carries the debt on the property
   * (gross − net), the live portfolio on its loan. Credited to the loan that finances the
   * property, the two cancel and only the instalment's principal is left — without the pairing
   * the sentence would read «−100.000 € di nuovo debito (Mutuo)» beside «+100.000 €» on the house.
   */
  it("should credit a property's legacy debt to the loan that finances it", () => {
    const before = [row({ assetId: 'casa', quantity: 1, price: 300000, totalValue: 200000 })];
    const after = [row({ assetId: 'casa', quantity: 1, price: 300000, totalValue: 300000 }), row({ assetId: 'mutuo', quantity: 99700, totalValue: -99700 })];
    expect(debtRepaymentsBetween(before, after, loans, realEstate)).toEqual([{ name: 'Mutuo', repaid: 300 }]);
  });

  it('should leave out a property on one side only: its debt moved with it, it was not repaid', () => {
    const after = [row({ assetId: 'casa', quantity: 1, price: 300000, totalValue: 200000 })];
    expect(debtRepaymentsBetween([], after, loans, realEstate)).toEqual([]);
  });
});

describe('computeMonthFlows', () => {
  const fund = makeAsset({ id: 'fund', type: 'pensionFund', quantity: 12000 });
  const mutuo = makeAsset({ id: 'mutuo', name: 'Mutuo', type: 'loan', assetClass: 'realestate', quantity: 99700, financedAssetId: 'casa' });
  const pension = { contributions: [contribution(2000, new Date(2026, 9, 13, 12))], startMonth: '2026-07' };

  it('should be null when the market is: no previous snapshot, or one without byAsset', () => {
    expect(computeMonthFlows([fund], null, pension)).toBeNull();
    expect(computeMonthFlows([fund], makeSnapshot([]), pension)).toBeNull();
  });

  it("should name the month's contributions and each debt repaid against the live portfolio", () => {
    const previous = makeSnapshot([
      { assetId: 'fund', ticker: '', name: 'Fondo', quantity: 10000, price: 1, totalValue: 10000 },
      { assetId: 'mutuo', ticker: '', name: 'Mutuo', quantity: 100000, price: 1, totalValue: -100000 },
    ]);
    expect(computeMonthFlows([fund, mutuo], previous, pension)).toEqual({
      pensionPaidIn: 2000,
      debts: [{ name: 'Mutuo', repaid: 300 }],
    });
  });

  it('should name no contribution before they are complete, like the market', () => {
    const previous = makeSnapshot([{ assetId: 'fund', ticker: '', name: 'Fondo', quantity: 10000, price: 1, totalValue: 10000 }]);
    expect(computeMonthFlows([fund], previous, { ...pension, startMonth: '2026-10' })?.pensionPaidIn).toBe(0);
  });
});
