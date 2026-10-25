import { describe, expect, it } from 'vitest';
import {
  ALL_CLIENTS,
  median,
  revenueMonthTiers,
  revenueClientKey,
  revenueEntryId,
  summarizeRevenue,
  UNSPECIFIED_CLIENT_LABEL,
} from '@/lib/utils/revenueStats';
import { buildRevenueVerdict, describeRevenueGrid, describeRevenueMonthTip } from '@/lib/utils/revenueNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import type { RevenueEntry } from '@/types/revenue';

let seq = 0;
function entry(month: string, amount: number, client = 'Clinica Alfa'): RevenueEntry {
  seq++;
  return { id: `e${seq}`, userId: 'u1', month, client, amount, createdAt: new Date(0), updatedAt: new Date(0) };
}

/** Twelve months of `base`, with July at `july`. */
function fullYear(year: number, base: number, july: number, client = 'Clinica Alfa'): RevenueEntry[] {
  return Array.from({ length: 12 }, (_, i) => entry(`${year}-${String(i + 1).padStart(2, '0')}`, i === 6 ? july : base, client));
}

describe('median', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('revenueEntryId / revenueClientKey', () => {
  it('one client whatever its case and spacing', () => {
    expect(revenueClientKey('  Dental   CARE ')).toBe('dental care');
    expect(revenueEntryId('u1', '2025-03', 'Dental Care')).toBe(revenueEntryId('u1', '2025-03', ' dental  care'));
  });
  it('never puts a slash in the id, and names the client-less row', () => {
    expect(revenueEntryId('u1', '2025-03', 'A/B')).toBe('u1__2025-03__a-b');
    expect(revenueEntryId('u1', '2025-03', '')).toBe('u1__2025-03___');
  });
});

describe('summarizeRevenue', () => {
  it('sums the clients of a month and leaves an unrecorded month null, not zero', () => {
    const s = summarizeRevenue([entry('2025-01', 1000), entry('2025-01', 500, 'Studio Beta'), entry('2025-03', 0)]);
    expect(s.years).toHaveLength(1);
    expect(s.years[0].months.slice(0, 4)).toEqual([1500, null, 0, null]);
    expect(s.years[0].total).toBe(1500);
    expect(s.years[0].recordedMonths).toBe(2);
    expect(s.years[0].complete).toBe(false);
    expect(s.recordedMonths).toBe(2);
  });

  it('per calendar month: median, mean, min and max across the years', () => {
    const s = summarizeRevenue([entry('2023-07', 1000), entry('2024-07', 4000), entry('2025-07', 2000)]);
    const july = s.months[6];
    expect(july.values.map((v) => v.year)).toEqual([2023, 2024, 2025]);
    expect(july.median).toBe(2000);
    expect(july.mean).toBeCloseTo(2333.33, 2);
    expect(july.min).toEqual({ year: 2023, amount: 1000 });
    expect(july.max).toEqual({ year: 2024, amount: 4000 });
    expect(s.months[0].median).toBeNull();
  });

  it('the share of the year is measured on complete years only', () => {
    // 2024 complete: 11 × 1000 + July 2000 = 13 000 → July 15,38%; 2025 has July alone.
    const s = summarizeRevenue([...fullYear(2024, 1000, 2000), entry('2025-07', 9000)]);
    expect(s.completeYears).toBe(1);
    expect(s.months[6].shareMedian).toBeCloseTo((2000 / 13000) * 100, 5);
    expect(s.months[6].median).toBe(5500);
  });

  it('names the strongest and the weakest month, and none when every month is alike', () => {
    const s = summarizeRevenue(fullYear(2024, 1000, 2500));
    expect(s.strongest?.month).toBe(7);
    expect(s.weakest?.median).toBe(1000);
    const flat = summarizeRevenue(fullYear(2024, 1000, 1000));
    expect(flat.strongest).toBeNull();
    expect(flat.weakest).toBeNull();
    expect(summarizeRevenue([entry('2024-01', 10)]).strongest).toBeNull();
  });

  it('compares the latest year with the one before on the same months', () => {
    const s = summarizeRevenue([...fullYear(2024, 1000, 1000), entry('2025-01', 1500), entry('2025-02', 1500)]);
    expect(s.yearToDate).toEqual({ year: 2025, previousYear: 2024, upToMonth: 2, current: 3000, previous: 2000, deltaPct: 50 });
    expect(summarizeRevenue([entry('2025-01', 1)]).yearToDate).toBeNull();
    // No month of the previous year inside the window: nothing to compare.
    expect(summarizeRevenue([entry('2024-12', 100), entry('2025-01', 1)]).yearToDate).toBeNull();
  });

  it('filters on one client but keeps every client in the list, the client-less rows last', () => {
    const rows = [entry('2025-01', 1000, 'Clinica Alfa'), entry('2025-01', 3000, 'Studio Beta'), entry('2025-02', 5000, '')];
    const all = summarizeRevenue(rows);
    expect(all.clients.map((c) => c.label)).toEqual(['Studio Beta', 'Clinica Alfa', UNSPECIFIED_CLIENT_LABEL]);
    expect(all.clients[0].percentage).toBeCloseTo(33.33, 2);
    const beta = summarizeRevenue(rows, 'studio beta');
    expect(beta.entryCount).toBe(1);
    expect(beta.years[0].months[0]).toBe(3000);
    expect(beta.clients).toHaveLength(3);
    expect(summarizeRevenue(rows, ALL_CLIENTS).years[0].total).toBe(9000);
  });

  it('a credit note lowers its month', () => {
    const s = summarizeRevenue([entry('2025-05', 2000), entry('2025-05', -250, 'Studio Beta')]);
    expect(s.years[0].months[4]).toBe(1750);
  });
});

describe('buildRevenueVerdict', () => {
  it('an empty register says how to start, with no figure', () => {
    const v = buildRevenueVerdict(summarizeRevenue([]), null);
    expect(v.headline).toBe('Nessun fatturato registrato');
    expect(v.sentence.some((s) => s.mono)).toBe(false);
  });

  it('names the strongest month and the year so far', () => {
    const rows = [...fullYear(2023, 1000, 3000), ...fullYear(2024, 1000, 3000), entry('2025-01', 1100)];
    const v = buildRevenueVerdict(summarizeRevenue(rows), null);
    expect(v.headline).toBe('Luglio è il mese più forte');
    const text = narrativeToText(v.sentence);
    expect(text).toContain('luglio arriva in mediana a 3000');
    expect(text).toContain('A gennaio 2025 hai fatturato 1100');
    expect(text).toContain('+10%');
    expect(v.tone).toBe('positive');
    expect(v.leadLength).toBeGreaterThan(0);
  });

  it('warns that two years make a median a mean', () => {
    const text = narrativeToText(buildRevenueVerdict(summarizeRevenue([...fullYear(2023, 1000, 2000), ...fullYear(2024, 1000, 2000)]), 'Clinica Alfa').sentence);
    expect(text).toContain('Con due anni la mediana');
  });

  it('the grid says an empty cell is not a zero', () => {
    const text = narrativeToText(describeRevenueGrid(summarizeRevenue([entry('2025-01', 1)]))!);
    expect(text).toContain('non zeri');
  });
});

describe('describeRevenueMonthTip', () => {
  it('opens on the median, then the mean, the lowest and the highest year, the share of the year', () => {
    const summary = summarizeRevenue([...fullYear(2024, 1000, 400), ...fullYear(2025, 1200, 600), entry('2026-07', 500)]);
    const tip = describeRevenueMonthTip(summary.months[6]);
    expect(tip?.title).toBe('Luglio · 3 anni');
    expect(tip?.headline).toMatch(/^Mediana 500/);
    expect(tip?.rows.map((r) => r.label)).toEqual(['Media', 'Minimo', 'Massimo', "Quota dell'anno"]);
    expect(tip?.rows[1].value).toMatch(/400.*\(2024\)/);
    expect(tip?.rows[2].value).toMatch(/600.*\(2025\)/);
  });

  it('with one year names that year and nothing else; a month nobody recorded has no tip', () => {
    const summary = summarizeRevenue([entry('2025-03', 2500), entry('2025-04', 1120)]);
    const tip = describeRevenueMonthTip(summary.months[2]);
    expect(tip?.title).toBe('Marzo · 1 anno');
    expect(tip?.rows).toEqual([{ label: 'Solo il', value: '2025' }]);
    expect(describeRevenueMonthTip(summary.months[0])).toBeNull();
  });
});

describe('revenueMonthTiers', () => {
  it('cuts twelve months into the four weakest, the four in the middle and the four strongest', () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry(`2025-${String(i + 1).padStart(2, '0')}`, [50, 1200, 900, 300, 1000, 2500, 400, 100, 1100, 700, 800, 2000][i]));
    expect(revenueMonthTiers(summarizeRevenue(entries).months)).toEqual([
      'low', 'high', 'mid', 'low', 'mid', 'high', 'low', 'low', 'high', 'mid', 'mid', 'high',
    ]);
  });

  it('leaves an unrecorded month out, and ranks nothing under three months or when all are alike', () => {
    const six = summarizeRevenue(['01', '02', '03', '04', '05', '06'].map((m, i) => entry(`2025-${m}`, (i + 1) * 100)));
    expect(revenueMonthTiers(six.months).slice(0, 7)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high', null]);
    expect(revenueMonthTiers(summarizeRevenue([entry('2025-01', 100), entry('2025-02', 200)]).months).every((t) => t === null)).toBe(true);
    expect(revenueMonthTiers(summarizeRevenue([entry('2025-01', 100), entry('2025-02', 100), entry('2025-03', 100)]).months).every((t) => t === null)).toBe(true);
  });
});
