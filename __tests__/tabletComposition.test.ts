/**
 * Tests for lib/utils/tabletComposition.ts — where each row of a composed page sits at 768 (on the
 * whole grid row when open or left alone), the heights the landscape stage reads (`--fold`,
 * `--verdict-h`, `--left-h`), and the rules over the classes and the composed grids (2026-10-16;
 * the landscape stage: DESIGN.md → The First-Screen Rule).
 *
 * Falsified on 2026-10-16, one at a time: the odd-run rule dropped (`closeRun` never marking the
 * lone row) → «a closed row left alone at 768» and «the last closed row of an odd page» red;
 * the stage's gap left out of `--left-h` → «the left stack» red; the bottom padding left out of
 * `--fold` → «the fold» red; `max-desktop:` taken off `LEAD_CELL_CLASS` → «every container query
 * carries max-desktop:» red; a bare `LEAD_CELL_CLASS` put back on Obiettivi's no-goal branch (the
 * defect of 2026-10-16) → «beside a plain grid, THE tile goes through leadCellClass» red.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as tablet from '@/lib/utils/tabletComposition';
import { layoutTabletSections, stageCustomProperties } from '@/lib/utils/tabletComposition';

const NONE: ReadonlySet<string> = new Set();

describe('layoutTabletSections', () => {
  it('should leave every row in its cell at 768 when the page has none open and an even count', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'c', 'd'], open: NONE });

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

  it('should ignore open ids that are not on the page, and count a repeated id once', () => {
    const layout = layoutTabletSections({ order: ['a', 'b', 'a'], open: new Set(['ghost']) });

    expect([...layout.wideAt768]).toEqual([]);
  });
});

describe('stageCustomProperties', () => {
  // A 1024×768 tablet beside the icon rail: `main` 768 tall, the stage 76px down (header + gap), 24px of bottom padding.
  const LANDSCAPE = { mainHeight: 768, stageTop: 76, mainPaddingBottom: 24, verdictHeight: 160, leadHeight: 492 };

  it('should measure the fold from the stage top to the first screen bottom, the padding left out', () => {
    expect(stageCustomProperties(LANDSCAPE)['--fold']).toBe('668px');
  });

  it('should give the verdict box its own height', () => {
    expect(stageCustomProperties(LANDSCAPE)['--verdict-h']).toBe('160px');
  });

  it('should give the left stack the verdict, the 16px gap and THE tile', () => {
    // 160 + 16 + 492 = 668: THE tile at its floor ends exactly on the fold.
    expect(stageCustomProperties(LANDSCAPE)['--left-h']).toBe('668px');
  });

  it('should never write a negative fold, and round to whole pixels', () => {
    const properties = stageCustomProperties({ mainHeight: 300.4, stageTop: 400, mainPaddingBottom: 24, verdictHeight: 120.6, leadHeight: 400.2 });

    expect(properties['--fold']).toBe('0px');
    expect(properties['--verdict-h']).toBe('121px');
    expect(properties['--left-h']).toBe('537px');
  });
});

/** The composed grids of the small-screen composition: their container queries come from the constants only. */
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
  it('should export the classes of the composition', () => {
    expect(CLASS_CONSTANTS.map(([name]) => name).sort()).toEqual([
      'ASIDE_YIELDS_TO_ANSWER_CLASS',
      'CLOSED_ANSWER_CLASS',
      'COMPACT_GRID_CLASS',
      'COMPACT_GRID_WRAPPER_CLASS',
      'INDEX_CLASS',
      'INDEX_GROUP_CLASS',
      'LEAD_CELL_CLASS',
      'PLAIN_GRID_CLASS',
      'REST_CELL_CLASS',
      'STAGE_CLASS',
      'STAGE_WRAPPER_CLASS',
      'VERDICT_CELL_CLASS',
      'WIDE_CELL_CLASS',
    ]);
  });

  it('should put max-desktop: in front of every container query, or it would win at 1440', () => {
    const queries = CLASS_CONSTANTS.flatMap(([, value]) => value.split(/\s+/)).filter((token) => token.includes('@['));

    expect(queries.length).toBeGreaterThan(20);
    for (const token of queries) expect(token, token).toMatch(/^max-desktop:@\[/);
  });

  it('should never use lg: nor an arbitrary min-[…]: breakpoint', () => {
    for (const [name, value] of CLASS_CONSTANTS) expect(value, name).not.toMatch(BANNED_VARIANT);
  });

  it.each(COMPOSED_GRID_FILES)('%s should take its container queries from the constants alone, inside a measured stage', (file) => {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');

    // The positive anchor: the file IS a composed grid, or the absence below proves nothing.
    // Booleans, not `toContain`: a failure would print the whole file.
    expect(source.includes('COMPACT_GRID_CLASS'), 'uses COMPACT_GRID_CLASS').toBe(true);
    expect(source.includes('ref={stageRef}') && source.includes('useTabletStage()'), 'a measured stage').toBe(true);
    expect(source.includes('data-stage="verdict"'), 'the verdict box marked').toBe(true);
    expect(source.includes('data-stage="lead"'), 'THE tile cell marked').toBe(true);
    expect(source.includes('INDEX_CLASS'), 'an index').toBe(true);
    expect(source.includes('@['), 'a literal @[…] class').toBe(false);
    expect(/['"`\s]@container[\s'"`]/.test(source), 'a literal @container').toBe(false);
    expect(BANNED_VARIANT.test(source), 'lg: or min-[…]:').toBe(false);
    expect(/tablet\.(gridStyle|cellStyle)/.test(source), 'the 1024 column the landscape stage replaced on 2026-10-16').toBe(false);
    expect(source.includes("'grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12'"), 'a plain grid written by hand').toBe(false);
  });

  // Obiettivi with no goal (2026-10-16): the cell kept `LEAD_CELL_CLASS` on the plain grid, and its
  // landscape classes put the tile in the left column with the right one empty.
  it('should give THE tile both columns of the plain grid, and the stage cell only when composed', () => {
    expect(tablet.leadCellClass(true)).toBe(tablet.LEAD_CELL_CLASS);
    expect(tablet.leadCellClass(false)).toBe('tablet:col-span-2');
  });

  const PARTLY_COMPOSED = COMPOSED_GRID_FILES.filter((file) => readFileSync(resolve(__dirname, '..', file), 'utf8').includes('PLAIN_GRID_CLASS'));

  it('should find the grids composed in some states only (the anchor of the next check)', () => {
    expect(PARTLY_COMPOSED.length).toBeGreaterThanOrEqual(4);
  });

  it.each(PARTLY_COMPOSED)('%s: beside a plain grid, THE tile goes through leadCellClass, never a bare LEAD_CELL_CLASS', (file) => {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');

    expect(/\bLEAD_CELL_CLASS\b/.test(source), 'a bare LEAD_CELL_CLASS').toBe(false);
    expect(source.includes('leadCellClass('), 'leadCellClass').toBe(true);
  });
});
