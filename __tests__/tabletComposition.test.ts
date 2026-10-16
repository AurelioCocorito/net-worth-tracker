/**
 * Tests for lib/utils/tabletComposition.ts — where each row of a composed page sits on a tablet: at
 * 1024 in the rail beside THE tile, in DOM order, open or closed; at 768 on the whole grid row when
 * open or left alone (MOB-08, 2026-10-16; the rail is decision 104).
 *
 * Falsified on 2026-10-16, one at a time: the odd-run rule dropped (`closeRun` never marking the
 * lone row) → «a closed row left alone at 768» and «the last closed row of an odd page» red; the rail
 * counted from 1 instead of 2 (`index + 1`, on PageRest's track) → «every row in the rail» and «a repeated id» red;
 * `max-desktop:` taken off `RAIL_CELL_CLASS` → «every container query carries max-desktop:» red.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as tablet from '@/lib/utils/tabletComposition';
import { layoutTabletSections } from '@/lib/utils/tabletComposition';

const NONE: ReadonlySet<string> = new Set();

describe('layoutTabletSections', () => {
  it('should put every row in the rail in DOM order, open or closed, after «Il resto»', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], open: new Set(['b']) });

    expect([...layout.railRow]).toEqual([['a', 2], ['b', 3], ['c', 4], ['d', 5], ['e', 6], ['f', 7], ['g', 8]]);
    expect(layout.railTracks).toBe(8);
  });

  it('should keep one track for «Il resto della pagina» when the page has no row', () => {
    const layout = layoutTabletSections({ order: [], open: NONE });

    expect(layout.railTracks).toBe(1);
    expect(layout.railRow.size).toBe(0);
    expect(layout.wideAt768.size).toBe(0);
  });

  it('should spread an open row over the grid at 768 and pair the closed ones around it', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'c', 'd', 'e'], open: new Set(['c']) });

    // a b | c (whole row) | d e
    expect([...layout.wideAt768]).toEqual(['c']);
  });

  it('should give the whole row at 768 to a closed row left alone before an open one', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'c', 'd'], open: new Set(['b']) });

    // a would sit beside an empty half: it takes the row; c d pair up.
    expect([...layout.wideAt768]).toEqual(['a', 'b']);
  });

  it('should give the whole row at 768 to the last closed row of an odd page', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], open: NONE });

    expect([...layout.wideAt768]).toEqual(['g']);
  });

  it('should slide every later row by one track when a row appears in the order', () => {
    const before = layoutTabletSections({ order: ['a', 'b', 'c'], open: NONE });
    const after = layoutTabletSections({ order: ['a', 'new', 'b', 'c'], open: NONE });

    expect(after.railRow.get('b')).toBe((before.railRow.get('b') ?? 0) + 1);
    expect(after.railRow.get('c')).toBe((before.railRow.get('c') ?? 0) + 1);
  });

  it('should ignore open ids that are not on the page, and count a repeated id once', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'a'], open: new Set(['ghost']) });

    expect([...layout.railRow]).toEqual([['a', 2], ['b', 3]]);
    expect([...layout.wideAt768]).toEqual([]);
  });
});

/** The composed grids of MOB-02..07 (MOB-08 § 5): their container queries come from the constants only. */
const COMPOSED_GRID_FILES = [
  'app/dashboard/page.tsx',
  'app/dashboard/assets/page.tsx',
  'app/dashboard/performance/page.tsx',
  'app/dashboard/history/page.tsx',
  'app/dashboard/allocation/page.tsx',
  'app/dashboard/hall-of-fame/page.tsx',
  'components/cashflow/ExpenseTrackingTab.tsx',
  'components/cashflow/BudgetTab.tsx',
  'components/cashflow/CostCentersTab.tsx',
  'components/cashflow/CostCenterDetail.tsx',
  'components/cashflow/ExpenseSplitTab.tsx',
  'components/cashflow/AnalisiTab.tsx',
  'components/dividends/DividendTrackingTab.tsx',
  'components/pension/PensionOverview.tsx',
  'components/fire-simulations/FireCalculatorTab.tsx',
  'components/fire-simulations/CoastFireTab.tsx',
  'components/fire-simulations/WhatIfAnalysisTab.tsx',
  'components/fire-simulations/MonteCarloTab.tsx',
  'components/fire-simulations/GoalBasedInvestingTab.tsx',
];

const CLASS_CONSTANTS: [string, string][] = Object.entries(tablet as Record<string, unknown>).flatMap(([name, value]) =>
  name.endsWith('_CLASS') && typeof value === 'string' ? [[name, value] as [string, string]] : [],
);

/** `lg:` or an arbitrary `min-[…]:` as a VARIANT (not `min-w-[…]`), at the start of a class token. */
const BANNED_VARIANT = /(?:^|[\s'"`:])(?:lg|min-\[[^\]]*\]):/;

describe('the tablet classes', () => {
  it('should export the six classes of the composition', () => {
    expect(CLASS_CONSTANTS.map(([name]) => name).sort()).toEqual([
      'COMPACT_GRID_CLASS',
      'COMPACT_GRID_WRAPPER_CLASS',
      'LEAD_CELL_CLASS',
      'RAIL_CELL_CLASS',
      'REST_CELL_CLASS',
      'WIDE_CELL_CLASS',
    ]);
  });

  it('should put max-desktop: in front of every container query, or it would win at 1440', () => {
    const queries = CLASS_CONSTANTS.flatMap(([, value]) => value.split(/\s+/)).filter((token) => token.includes('@['));

    expect(queries.length).toBeGreaterThan(5);
    for (const token of queries) expect(token, token).toMatch(/^max-desktop:@\[/);
  });

  it('should never use lg: nor an arbitrary min-[…]: breakpoint', () => {
    for (const [name, value] of CLASS_CONSTANTS) expect(value, name).not.toMatch(BANNED_VARIANT);
  });

  it.each(COMPOSED_GRID_FILES)('%s should take its container queries from the constants alone', (file) => {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');

    // The positive anchor: the file IS a composed grid, or the absence below proves nothing.
    // Booleans, not `toContain`: a failure would print the whole file.
    expect(source.includes('COMPACT_GRID_CLASS'), 'uses COMPACT_GRID_CLASS').toBe(true);
    expect(source.includes('@['), 'a literal @[…] class').toBe(false);
    expect(/['"`\s]@container[\s'"`]/.test(source), 'a literal @container').toBe(false);
    expect(BANNED_VARIANT.test(source), 'lg: or min-[…]:').toBe(false);
  });
});
