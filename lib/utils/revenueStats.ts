/**
 * FATTURATO — the figures of Cashflow › Fatturati, pure.
 *
 * The register holds one amount per (month of competence, client). Everything the tab prints is
 * computed here from that list, so a figure that cannot be pointed at inside a `RevenueSummary`
 * does not belong on the screen.
 *
 * THE MEASURES, and why these:
 * - The month's figure is the sum of its clients. A month with no row is NOT a zero: it is a month
 *   nobody recorded (DESIGN.md → The Absence-Has-Three-Names Rule), so it stays `null` in the grid
 *   and out of every statistic. A recorded 0 is a measured zero and counts.
 * - Per calendar month (every January, every February…) the MEDIAN across the years, with the
 *   lowest and the highest year beside it. The median, not the mean, because a single odd year (a
 *   leave, a settlement invoiced in one month) moves it little; the mean is kept as the second
 *   figure. With two years the two coincide, and the tab says how many years each month rests on.
 * - The SHARE OF THE YEAR (July is usually 6% of the year), measured only on complete years —
 *   twelve recorded months. It is the honest reading of seasonality when the revenue grows: the euro
 *   figures of the older years are lower and drag every median, the shares are not.
 */

import type { RevenueEntry } from '@/types/revenue';
import { roundToCents } from '@/lib/utils/cents';

/** The label of the rows that name no client: the month's total, recorded as one figure. */
export const UNSPECIFIED_CLIENT_LABEL = 'Senza datore';

/** The client filter's value for «every client». */
export const ALL_CLIENTS = '__all__';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidRevenueMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/** The identity of a client across rows: case and repeated spaces never make two clients. */
export function revenueClientKey(client: string): string {
  return client.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The document id of a (month, client) pair: a re-import of the same month UPDATES its figure.
 * Firestore ids cannot hold «/», so the client is slugged; '_' stands for «no client».
 */
export function revenueEntryId(userId: string, month: string, client: string): string {
  const slug = revenueClientKey(client).replace(/[^a-z0-9àèéìòù]+/g, '-').replace(/^-+|-+$/g, '');
  return `${userId}__${month}__${slug || '_'}`;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface RevenueYearRow {
  year: number;
  /** Twelve cells, January first: the month's total, or `null` when nothing was recorded. */
  months: (number | null)[];
  total: number;
  recordedMonths: number;
  /** All twelve months recorded: the year enters the share-of-year measure. */
  complete: boolean;
}

export interface YearAmount {
  year: number;
  amount: number;
}

export interface RevenueMonthStat {
  /** 1–12. */
  month: number;
  /** One value per year that recorded this month, oldest first. */
  values: YearAmount[];
  median: number | null;
  mean: number | null;
  min: YearAmount | null;
  max: YearAmount | null;
  /** The median share of the year this month took, in percent, over the complete years; `null` without one. */
  shareMedian: number | null;
}

export interface RevenueClientRow {
  key: string;
  label: string;
  total: number;
  /** Share of the whole register, in percent. */
  percentage: number;
  months: number;
}

export interface RevenueYearToDate {
  year: number;
  previousYear: number;
  /** The last month recorded in `year`: the comparison stops there in both years. */
  upToMonth: number;
  current: number;
  previous: number;
  /** In percent; `null` when the previous year adds up to zero. */
  deltaPct: number | null;
}

export interface RevenueSummary {
  /** The rows the summary rests on (after the client filter). */
  entryCount: number;
  /** Oldest year first. */
  years: RevenueYearRow[];
  /** Twelve, January first. */
  months: RevenueMonthStat[];
  /** Every client of the register, whatever the filter, largest first. */
  clients: RevenueClientRow[];
  /** The median of every recorded month's total: what a month usually invoices. */
  monthlyMedian: number | null;
  recordedMonths: number;
  completeYears: number;
  /** The calendar months with the highest and the lowest median; `null` with fewer than two months measured. */
  strongest: RevenueMonthStat | null;
  weakest: RevenueMonthStat | null;
  yearToDate: RevenueYearToDate | null;
  /** The largest month in the grid, for its shading. */
  gridMax: number;
}

/** The register's clients, largest first; the client-less rows last whatever their size. */
export function summarizeRevenueClients(entries: readonly RevenueEntry[]): RevenueClientRow[] {
  const byKey = new Map<string, { label: string; total: number; months: Set<string> }>();
  let grand = 0;
  for (const entry of entries) {
    const key = revenueClientKey(entry.client);
    const row = byKey.get(key) ?? { label: entry.client.trim() || UNSPECIFIED_CLIENT_LABEL, total: 0, months: new Set<string>() };
    row.total += entry.amount;
    row.months.add(entry.month);
    byKey.set(key, row);
    grand += entry.amount;
  }
  return [...byKey.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      total: roundToCents(row.total),
      percentage: grand > 0 ? (row.total / grand) * 100 : 0,
      months: row.months.size,
    }))
    .sort((a, b) => (a.key === '' ? 1 : 0) - (b.key === '' ? 1 : 0) || b.total - a.total || a.label.localeCompare(b.label, 'it'));
}

/**
 * @param client `ALL_CLIENTS` (or absent) for the whole register, else a `revenueClientKey`.
 */
export function summarizeRevenue(entries: readonly RevenueEntry[], client: string = ALL_CLIENTS): RevenueSummary {
  const clients = summarizeRevenueClients(entries);
  const rows = client === ALL_CLIENTS ? entries : entries.filter((e) => revenueClientKey(e.client) === client);

  // The month's total, summed over its clients.
  const monthTotals = new Map<string, number>();
  for (const entry of rows) {
    if (!isValidRevenueMonth(entry.month)) continue;
    monthTotals.set(entry.month, (monthTotals.get(entry.month) ?? 0) + entry.amount);
  }

  const yearNumbers = [...new Set([...monthTotals.keys()].map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b);
  const years: RevenueYearRow[] = yearNumbers.map((year) => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const value = monthTotals.get(`${year}-${String(i + 1).padStart(2, '0')}`);
      return value === undefined ? null : roundToCents(value);
    });
    const recorded = months.filter((v): v is number => v !== null);
    return {
      year,
      months,
      total: roundToCents(recorded.reduce((sum, v) => sum + v, 0)),
      recordedMonths: recorded.length,
      complete: recorded.length === 12,
    };
  });

  const completeYears = years.filter((y) => y.complete && y.total > 0);

  const months: RevenueMonthStat[] = Array.from({ length: 12 }, (_, i) => {
    const values: YearAmount[] = years
      .filter((y) => y.months[i] !== null)
      .map((y) => ({ year: y.year, amount: y.months[i] as number }));
    const amounts = values.map((v) => v.amount);
    const shares = completeYears.map((y) => ((y.months[i] as number) / y.total) * 100);
    let min: YearAmount | null = null;
    let max: YearAmount | null = null;
    for (const v of values) {
      if (min === null || v.amount < min.amount) min = v;
      if (max === null || v.amount > max.amount) max = v;
    }
    return {
      month: i + 1,
      values,
      median: median(amounts),
      mean: mean(amounts),
      min,
      max,
      shareMedian: median(shares),
    };
  });

  const measured = months.filter((m) => m.median !== null);
  let strongest: RevenueMonthStat | null = null;
  let weakest: RevenueMonthStat | null = null;
  if (measured.length >= 2) {
    for (const m of measured) {
      if (strongest === null || (m.median as number) > (strongest.median as number)) strongest = m;
      if (weakest === null || (m.median as number) < (weakest.median as number)) weakest = m;
    }
    // Every month alike: there is no strongest one to name.
    if (strongest && weakest && strongest.median === weakest.median) {
      strongest = null;
      weakest = null;
    }
  }

  const allMonthValues = years.flatMap((y) => y.months.filter((v): v is number => v !== null));

  return {
    entryCount: rows.length,
    years,
    months,
    clients,
    monthlyMedian: median(allMonthValues),
    recordedMonths: allMonthValues.length,
    completeYears: completeYears.length,
    strongest,
    weakest,
    yearToDate: computeYearToDate(years),
    gridMax: allMonthValues.reduce((top, v) => Math.max(top, v), 0),
  };
}

/** The latest year against the one before, on the same months (January up to the latest one recorded). */
function computeYearToDate(years: readonly RevenueYearRow[]): RevenueYearToDate | null {
  const latest = years[years.length - 1];
  if (!latest) return null;
  const previousRow = years.find((y) => y.year === latest.year - 1);
  if (!previousRow) return null;
  let upToMonth = 0;
  latest.months.forEach((v, i) => {
    if (v !== null) upToMonth = i + 1;
  });
  const sumTo = (row: RevenueYearRow) =>
    roundToCents(row.months.slice(0, upToMonth).reduce<number>((sum, v) => sum + (v ?? 0), 0));
  const previousRecorded = previousRow.months.slice(0, upToMonth).some((v) => v !== null);
  if (!previousRecorded) return null;
  const current = sumTo(latest);
  const previous = sumTo(previousRow);
  return {
    year: latest.year,
    previousYear: previousRow.year,
    upToMonth,
    current,
    previous,
    deltaPct: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export type RevenueMonthTier = 'low' | 'mid' | 'high';

/**
 * Stagionalità's three bands (the owner's request, 2026-10-25): the measured months ranked by
 * median and cut in thirds — with twelve, the four weakest, the four in the middle, the four
 * strongest. A tie keeps the calendar order. `null` for a month nobody recorded, and for every
 * month when fewer than three are measured or all of them are alike: there is no ranking to show.
 */
export function revenueMonthTiers(months: readonly RevenueMonthStat[]): (RevenueMonthTier | null)[] {
  const measured = months.filter((m) => m.median !== null);
  const tiers: (RevenueMonthTier | null)[] = months.map(() => null);
  if (measured.length < 3) return tiers;
  const medians = measured.map((m) => m.median as number);
  if (Math.min(...medians) === Math.max(...medians)) return tiers;
  const ranked = [...measured].sort((a, b) => (a.median as number) - (b.median as number) || a.month - b.month);
  const bands: RevenueMonthTier[] = ['low', 'mid', 'high'];
  ranked.forEach((m, rank) => {
    tiers[months.indexOf(m)] = bands[Math.floor((rank * 3) / ranked.length)];
  });
  return tiers;
}
