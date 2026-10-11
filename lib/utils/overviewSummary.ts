/**
 * The Panoramica's model for the small-screen composition (since 2026-10-11): the payload IS
 * the page's summary, so what the other pages derive in a `*Summary` module — the strip's three
 * figures, the two cashflow ratios, the rows' closed asides — is read straight from
 * `DashboardOverviewPayload` here. Pure, SDK-free, tested by `__tests__/overviewSummary.test.ts`.
 *
 * The strip (`selectOverviewStrip`) prints EXACTLY what the verdict prints (The First-Screen
 * Rule): every cell carries the value ALREADY rounded the way the sentence rounds it, with the
 * sentence's `decimals`, so `Intl` never rounds a second time — «Messo da parte finora» at −12,5
 * is «−12%» in both (`Math.round`), where `Intl` alone would print −13%.
 */

import { buildOverviewVerdict, narrativeToText, resolveLivedCashflow, type OverviewVerdictInput } from '@/lib/utils/overviewNarrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import type { StripFigure } from '@/lib/utils/verdictStrip';
import type { DashboardOverviewExpenseStats, DashboardOverviewPayload } from '@/types/dashboardOverview';

/** THE tile of the page: open at every width, never a row (decision 21); a strip cell targets it. */
export const OVERVIEW_PATRIMONIO_ID = 'panoramica-patrimonio';

/** The rows below `desktop:`, in the DOM's order (decision 11: Sintesi before Cashflow, as at 1440). */
export const OVERVIEW_SECTION_IDS = {
  sintesi: 'panoramica-sintesi',
  cashflow: 'panoramica-cashflow',
  composizione: 'panoramica-composizione',
  costi: 'panoramica-costi',
  obiettivo: 'panoramica-obiettivo',
  spese: 'panoramica-spese',
  entrate: 'panoramica-entrate',
  asset: 'panoramica-asset',
} as const;

export type OverviewSectionId = (typeof OVERVIEW_SECTION_IDS)[keyof typeof OVERVIEW_SECTION_IDS];

// ─── The two ratios of the Cashflow tile (the WHOLE month, calendar included) ─────────────────

/** The month's savings rate in percent — `null` (not 0) without income: a rate needs a denominator. */
export function monthSavingsRate(stats: DashboardOverviewExpenseStats | null | undefined): number | null {
  if (!stats) return null;
  const { income, expenses } = stats.currentMonth;
  if (income <= 0) return null;
  return ((income - expenses) / income) * 100;
}

/** income / expenses; `null` without expenses. */
export function monthCoverageRatio(stats: DashboardOverviewExpenseStats | null | undefined): number | null {
  if (!stats) return null;
  const { income, expenses } = stats.currentMonth;
  if (expenses <= 0) return null;
  return income / expenses;
}

// ─── The strip ────────────────────────────────────────────────────────────────────────────────

/**
 * The savings rate the verdict judges — what has already happened (`resolveLivedCashflow`), or
 * the whole month on a payload that cannot say — rounded as the sentence rounds it
 * (`Math.round`, decision 26). `null` with nothing to divide by.
 */
function verdictSavingsRate(stats: DashboardOverviewExpenseStats | null | undefined): { rate: number | null; lived: boolean } {
  const lived = resolveLivedCashflow(stats);
  const rate = lived ? lived.savingsRate : monthSavingsRate(stats);
  return { rate: rate === null ? null : Math.round(rate), lived: lived !== null };
}

/**
 * The three figures under the title on a phone: the month's euro (the chip's first figure,
 * lifted from THE tile; it opens «Il perché», where the sentence restates it), the year's
 * percentage (the year's chip, lifted whole; it opens THE tile on its YTD curve) and what was
 * saved so far (it opens the Cashflow row, which keeps the whole month). Every cell carries
 * the sentence's rounding. All three `null` → `[]`: no strip at all.
 */
export function selectOverviewStrip(overview: DashboardOverviewPayload): StripFigure[] {
  const monthly = overview.variations.monthly;
  const yearly = overview.variations.yearly;
  const saved = verdictSavingsRate(overview.expenseStats);

  const figures: StripFigure[] = [
    {
      label: 'Questo mese',
      value: monthly ? monthly.value : null,
      format: 'signed-currency',
      decimals: 2,
      opens: VERDICT_REST_SECTION,
      lifts: { section: OVERVIEW_PATRIMONIO_ID, block: 'monthly' },
      ...(monthly ? {} : { reason: 'nessuno snapshot prima di questo mese' }),
    },
    {
      label: 'Da inizio anno',
      value: yearly ? yearly.percentage : null,
      format: 'signed-percent',
      decimals: 2,
      opens: OVERVIEW_PATRIMONIO_ID,
      lifts: { section: OVERVIEW_PATRIMONIO_ID, block: 'yearly' },
      ...(yearly ? {} : { reason: "nessuno snapshot da cui contare l'anno" }),
    },
    {
      label: 'Messo da parte finora',
      value: saved.rate,
      format: 'percent',
      decimals: 0,
      opens: OVERVIEW_SECTION_IDS.cashflow,
      ...(saved.rate === null ? { reason: saved.lived ? 'nessuna entrata finora' : 'nessuna entrata nel mese' } : {}),
    },
  ];
  return figures.every((figure) => figure.value === null) ? [] : figures;
}

/**
 * Whether the verdict's sentence names the market — then the digest «Mercato:» of THE tile is
 * lifted on a phone (its words are in «Il perché»), otherwise the digest stays. True iff the
 * builder's sentence contains «mercato»: a market effect alone is not enough — a sale with a net
 * loss and a tax above zero skips both the month's split and the counterfactual, and without a
 * driver clause nothing names it.
 */
export function verdictNamesMarket(input: OverviewVerdictInput): boolean {
  return /mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence));
}

// ─── The closed rows' asides ──────────────────────────────────────────────────────────────────

/**
 * What each closed row says beside its eyebrow (The Closed-Row Rule): words, never an amount
 * nor a count of figures — the full phrase when the tile has something to show, the empty one
 * when it has not.
 */
export function describeOverviewAsides(overview: DashboardOverviewPayload): Record<OverviewSectionId, string> {
  const stats = overview.expenseStats;
  const goals = overview.goalProgressList ?? (overview.goalProgress ? [overview.goalProgress] : []);
  const classes = overview.charts.assetClassData.filter((d) => d.percentage > 0);
  return {
    [OVERVIEW_SECTION_IDS.sintesi]: 'cosa è liquidabile',
    [OVERVIEW_SECTION_IDS.cashflow]: stats ? 'entrate, spese e fine mese' : 'nessun dato questo mese',
    [OVERVIEW_SECTION_IDS.composizione]: classes.length > 0 ? 'per asset class' : 'nessun asset',
    [OVERVIEW_SECTION_IDS.costi]: 'stima annua',
    [OVERVIEW_SECTION_IDS.obiettivo]: goals.some((goal) => goal.currentValue < goal.targetAmount) ? 'in corso' : 'raggiunto',
    [OVERVIEW_SECTION_IDS.spese]: stats && stats.topExpenseCategories.length > 0 ? 'le prime del mese' : 'nessuna spesa questo mese',
    [OVERVIEW_SECTION_IDS.entrate]: stats && stats.topIncomeCategories.length > 0 ? 'le prime del mese' : 'nessuna entrata questo mese',
    [OVERVIEW_SECTION_IDS.asset]: (overview.topAssets ?? []).length > 0 ? 'valore, peso, rendimento' : 'nessun asset in portafoglio',
  };
}
