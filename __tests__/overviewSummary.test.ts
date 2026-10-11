/**
 * Tests for lib/utils/overviewSummary.ts — the Panoramica's model for the phone composition
 * (MOB-03, 2026-10-11): the strip's three cells, the identity between a cell and the verdict's
 * sentence, `verdictNamesMarket`, the rows' closed asides, the two ratios of the Cashflow tile.
 * The Firebase chain behind chartService's formatter is mocked away as in overviewNarrative.test.ts.
 *
 * Falsified on 2026-10-11, one at a time: the identity went red with «Questo mese» without
 * `decimals` («+3000 €» against the sentence's «+3000,00 €») and with the savings rate passed
 * unrounded (−12,5 → «−13%» from `Intl`, «−12%» in the sentence); `verdictNamesMarket` went red on
 * the net-loss sale with the body replaced by `input.marketEffect !== null`.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { buildOverviewVerdict, narrativeToText, resolveLivedCashflow, type OverviewVerdictInput } from '@/lib/utils/overviewNarrative';
import {
  describeOverviewAsides,
  monthCoverageRatio,
  monthSavingsRate,
  OVERVIEW_PATRIMONIO_ID,
  OVERVIEW_SECTION_IDS,
  selectOverviewStrip,
  verdictNamesMarket,
} from '@/lib/utils/overviewSummary';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';
import type { DashboardOverviewExpenseStats, DashboardOverviewPayload } from '@/types/dashboardOverview';

const plain = (text: string) => text.replace(/[  ]/g, ' ');
const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));

/** Round, invented figures: income 4000 with nothing scheduled, expenses 2000 of which 350 in the calendar. */
const STATS: DashboardOverviewExpenseStats = {
  currentMonth: { income: 4000, expenses: 2000, net: 2000, expensesScheduled: 350, incomeScheduled: 0 },
  previousMonth: { income: 4000, expenses: 3500, net: 500 },
  delta: { income: 0, expenses: -42.9, net: 300 },
  topExpenseCategories: [{ category: 'Casa', categoryKey: 'casa', expenseType: 'fixed', amount: 900, percentage: 45 }],
  topIncomeCategories: [{ category: 'Stipendio', categoryKey: 'stipendio', expenseType: 'income', amount: 4000, percentage: 100 }],
};

function makeOverview(overrides: Partial<DashboardOverviewPayload> = {}): DashboardOverviewPayload {
  return {
    metrics: {
      totalValue: 190000,
      liquidNetWorth: 150000,
      illiquidNetWorth: 40000,
      cashNetWorth: 20000,
      liquidInvestmentsNetWorth: 130000,
      netTotal: 185000,
      liquidNetTotal: 145000,
      unrealizedGains: 20000,
      estimatedTaxes: 5000,
      liquidEstimatedTaxes: 5000,
      portfolioTER: 0.2,
      annualPortfolioCost: 300,
      annualStampDuty: 380,
    },
    variations: { monthly: { value: 3000, percentage: 1.6 }, yearly: { value: 25000, percentage: 15 } },
    expenseStats: STATS,
    charts: {
      assetClassData: [{ name: 'Azioni', value: 130000, percentage: 68.4, color: '#000', assetClass: 'equity' }],
      assetData: [],
      liquidityData: [],
    },
    flags: { assetCount: 3, hasCostBasisTracking: true, hasTERTracking: true, hasStampDuty: true, currentMonthSnapshotExists: false },
    freshness: { source: 'live_recompute', updatedAt: '2026-10-11T08:00:00.000Z', computedAt: '2026-10-11T08:00:00.000Z', sourceVersion: 19, stale: false },
    topAssets: [{ id: 'a', name: 'VWCE', assetType: 'etf', assetClass: 'equity', totalValue: 130000, portfolioPercent: 68.4, returnPercent: 12 }],
    marketEffect: 2000,
    topMovers: [{ assetClass: 'equity', label: 'Azioni', delta: 1500 }],
    goalProgressList: [{ goalId: 'g', goalName: 'Casa', goalColor: '#000', currentValue: 40000, targetAmount: 100000, progressPercentage: 40 }],
    ...overrides,
  };
}

/** The verdict's input the way `app/dashboard/page.tsx` builds it from the payload. */
function verdictInput(overview: DashboardOverviewPayload, month = 10): OverviewVerdictInput {
  const cashflow = resolveLivedCashflow(overview.expenseStats);
  return {
    month,
    totalValue: overview.metrics.totalValue,
    monthlyVariation: overview.variations.monthly,
    yearlyVariation: overview.variations.yearly,
    isNewATH: overview.ath?.isNewATH ?? false,
    savingsRate: cashflow ? cashflow.savingsRate : monthSavingsRate(overview.expenseStats),
    cashflow,
    marketEffect: overview.marketEffect ?? null,
    topMover: overview.topMovers?.[0] ?? null,
    sales: overview.monthSales ?? null,
  };
}

const ROW_IDS = Object.values(OVERVIEW_SECTION_IDS);

describe('selectOverviewStrip', () => {
  const overview = makeOverview();
  const strip = selectOverviewStrip(overview);

  it('reads three cells — the month, the year, what was saved so far — and passes the strip rules', () => {
    expect(strip.map((figure) => figure.label)).toEqual(['Questo mese', 'Da inizio anno', 'Messo da parte finora']);
    expect(strip.map((figure) => figure.opens)).toEqual([VERDICT_REST_SECTION, OVERVIEW_PATRIMONIO_ID, OVERVIEW_SECTION_IDS.cashflow]);
    expect(validateStrip(strip, [...ROW_IDS, OVERVIEW_PATRIMONIO_ID, VERDICT_REST_SECTION])).toEqual([]);
    // Without «Il perché» (the cut cancelled by a binding clause) the first cell still opens a known target.
    expect(validateStrip(strip, [...ROW_IDS, OVERVIEW_PATRIMONIO_ID, VERDICT_REST_SECTION])).toEqual([]);
  });

  it('lifts the two chips of THE tile, and nothing of the Cashflow tile', () => {
    expect(liftedBlocks(strip, OVERVIEW_PATRIMONIO_ID)).toEqual(['monthly', 'yearly']);
    expect(liftedBlocks(strip, OVERVIEW_SECTION_IDS.cashflow)).toEqual([]);
  });

  it('prints every cell EXACTLY as the verdict prints it (two decimals for the euro and the percentage, the rate whole)', () => {
    const sentence = plain(narrativeToText(buildOverviewVerdict(verdictInput(overview)).sentence));
    expect(cellText(strip[0])).toBe('+3000,00 €');
    expect(cellText(strip[1])).toBe('+15,00%');
    // 4000 − 1650 lived = 2350 → 58,75% → «59%» in both.
    expect(cellText(strip[2])).toBe('59%');
    for (const figure of strip) expect(sentence).toContain(cellText(figure));
  });

  it('keeps the identity at a savings rate of −12,5 (rounded once, by the sentence\'s rule) and at a zero variation', () => {
    // income 4000 lived, expenses 4500 → −12,5%: `Math.round` gives −12 as the sentence; `Intl` alone would give −13.
    const overspent = makeOverview({
      expenseStats: { ...STATS, currentMonth: { income: 4000, expenses: 4500, net: -500, expensesScheduled: 0, incomeScheduled: 0 } },
      variations: { monthly: { value: -0.004, percentage: 0 }, yearly: { value: 0, percentage: 0 } },
    });
    const strip = selectOverviewStrip(overspent);
    const sentence = plain(narrativeToText(buildOverviewVerdict(verdictInput(overspent)).sentence));
    expect(cellText(strip[2])).toBe('−12%');
    expect(sentence).toContain('il −12% delle entrate');
    expect(cellText(strip[0])).toBe('0,00 €');
    expect(cellText(strip[1])).toBe('0,00%');
    for (const figure of strip) expect(sentence).toContain(cellText(figure));
  });

  it('says why a figure is missing, never a zero', () => {
    const noSnapshots = selectOverviewStrip(makeOverview({ variations: { monthly: null, yearly: null } }));
    expect(noSnapshots[0]).toMatchObject({ value: null, reason: 'nessuno snapshot prima di questo mese' });
    expect(noSnapshots[1]).toMatchObject({ value: null, reason: "nessuno snapshot da cui contare l'anno" });

    // No income so far (the salary still in the calendar): the lived reading exists and has no rate.
    const salaryTomorrow = selectOverviewStrip(
      makeOverview({ expenseStats: { ...STATS, currentMonth: { income: 2456, expenses: 300, net: 2156, expensesScheduled: 0, incomeScheduled: 2456 } } }),
    );
    expect(salaryTomorrow[2]).toMatchObject({ value: null, reason: 'nessuna entrata finora' });

    // A payload without `incomeScheduled` (or without stats): the whole month, and no income in it.
    const olderPayload = selectOverviewStrip(
      makeOverview({ expenseStats: { ...STATS, currentMonth: { income: 0, expenses: 300, net: -300, expensesScheduled: 0 } } }),
    );
    expect(olderPayload[2]).toMatchObject({ value: null, reason: 'nessuna entrata nel mese' });
    expect(selectOverviewStrip(makeOverview({ expenseStats: null }))[2]).toMatchObject({ value: null, reason: 'nessuna entrata nel mese' });
  });

  it('is empty when every figure is missing', () => {
    expect(selectOverviewStrip(makeOverview({ variations: { monthly: null, yearly: null }, expenseStats: null }))).toEqual([]);
  });
});

describe('verdictNamesMarket', () => {
  const namesIt = (input: OverviewVerdictInput) => /mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence));
  const cases: Array<[string, OverviewVerdictInput, boolean]> = [
    ['a month with a market effect and a driver', verdictInput(makeOverview()), true],
    ['no market effect', verdictInput(makeOverview({ marketEffect: null, topMovers: [] })), false],
    // The driver clause does not need the variation: «sul mercato hanno spinto…» still names it.
    ['no monthly variation', verdictInput(makeOverview({ variations: { monthly: null, yearly: { value: 25000, percentage: 15 } } })), true],
    ['an unknown class and no split', verdictInput(makeOverview({ topMovers: [{ assetClass: 'structuredNotes', label: 'Note', delta: 500 }], marketEffect: null })), false],
    [
      'a taxed sale with the split',
      verdictInput(
        makeOverview({
          topMovers: [],
          monthSales: { proceeds: 10000, realizedGain: 2000, estimatedTax: 520, instruments: [{ id: 'a', name: 'A', proceeds: 10000, realizedGain: 2000, estimatedTax: 520 }], brokenLedgers: 0 },
        }),
      ),
      true,
    ],
    [
      'a sale with a net loss and a tax above zero: no split, no counterfactual, no driver',
      verdictInput(
        makeOverview({
          topMovers: [],
          monthSales: {
            proceeds: 10000,
            realizedGain: -500,
            estimatedTax: 260,
            instruments: [
              { id: 'a', name: 'A', proceeds: 6000, realizedGain: 1000, estimatedTax: 260 },
              { id: 'b', name: 'B', proceeds: 4000, realizedGain: -1500, estimatedTax: 0 },
            ],
            brokenLedgers: 0,
          },
        }),
      ),
      false,
    ],
  ];

  it.each(cases)('agrees with the sentence: %s', (_name, input, expected) => {
    expect(namesIt(input)).toBe(expected);
    expect(verdictNamesMarket(input)).toBe(expected);
  });
});

describe('describeOverviewAsides', () => {
  it('says in words what each closed row holds, without a figure', () => {
    const asides = describeOverviewAsides(makeOverview());
    expect(asides).toEqual({
      [OVERVIEW_SECTION_IDS.sintesi]: 'cosa è liquidabile',
      [OVERVIEW_SECTION_IDS.cashflow]: 'entrate, spese e fine mese',
      [OVERVIEW_SECTION_IDS.composizione]: 'per asset class',
      [OVERVIEW_SECTION_IDS.costi]: 'stima annua',
      [OVERVIEW_SECTION_IDS.obiettivo]: 'in corso',
      [OVERVIEW_SECTION_IDS.spese]: 'le prime del mese',
      [OVERVIEW_SECTION_IDS.entrate]: 'le prime del mese',
      [OVERVIEW_SECTION_IDS.asset]: 'valore, peso, rendimento',
    });
    for (const aside of Object.values(asides)) expect(aside).not.toMatch(/\d|€/);
  });

  it('says what is missing when a tile has nothing to show', () => {
    const asides = describeOverviewAsides(
      makeOverview({
        expenseStats: null,
        charts: { assetClassData: [], assetData: [], liquidityData: [] },
        topAssets: [],
        goalProgressList: [{ goalId: 'g', goalName: 'Casa', goalColor: '#000', currentValue: 100000, targetAmount: 100000, progressPercentage: 100 }],
      }),
    );
    expect(asides[OVERVIEW_SECTION_IDS.cashflow]).toBe('nessun dato questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.composizione]).toBe('nessun asset');
    expect(asides[OVERVIEW_SECTION_IDS.obiettivo]).toBe('raggiunto');
    expect(asides[OVERVIEW_SECTION_IDS.spese]).toBe('nessuna spesa questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.entrate]).toBe('nessuna entrata questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.asset]).toBe('nessun asset in portafoglio');
    // Stats present but a month with no rows of one kind.
    const noIncome = describeOverviewAsides(makeOverview({ expenseStats: { ...STATS, topIncomeCategories: [] } }));
    expect(noIncome[OVERVIEW_SECTION_IDS.entrate]).toBe('nessuna entrata questo mese');
  });
});

describe('the Cashflow tile\'s ratios (the whole month)', () => {
  it('reads the savings rate and the coverage on the whole month, null without a denominator', () => {
    expect(monthSavingsRate(STATS)).toBe(50);
    expect(monthCoverageRatio(STATS)).toBe(2);
    expect(monthSavingsRate({ ...STATS, currentMonth: { ...STATS.currentMonth, income: 0 } })).toBeNull();
    expect(monthCoverageRatio({ ...STATS, currentMonth: { ...STATS.currentMonth, expenses: 0 } })).toBeNull();
    expect(monthSavingsRate(null)).toBeNull();
    expect(monthCoverageRatio(undefined)).toBeNull();
  });
});
