/**
 * The Panoramica composed for a tablet (MOB-08, 2026-10-16; doc/guide/panoramica.md § Composizione
 * mobile): one spec, two projects — `tablet` (768×1024, two columns, the pill) and
 * `tablet-landscape` (1024×768, THE tile and the rail, the bar) — branching on the width. Base
 * account with the overview response patched on the wire (`e2e/overviewFixture.ts`:
 * `hasTERTracking` on and no goal, so SEVEN closed rows — Sintesi, Cashflow, Composizione, Costi,
 * Spese, Entrate, Asset).
 *
 * What a browser alone can prove: the columns; THE tile's width and the first screen; at 1024
 * «Il resto della pagina» and all seven rows in the 360px rail, 12px apart and as tall as their
 * trigger (the flexible track takes THE tile's height); an opened row that stays where it was in
 * the rail with nothing scrolled (the owner's ask, decision 104), or at 768 spans the grid; no half
 * grid row at 768 (the seventh row takes the whole row); the landscape bar's 53px and its 44px
 * trigger; the same grid as today at 1440 after a resize; nothing past `main`. Where each row goes
 * is Vitest's (`__tests__/tabletComposition.test.ts`).
 *
 * At 1024 THE tile starts on the first screen and does not end there (owner, 2026-10-16,
 * doc/mobile/README.md § 9, 101).
 *
 * Seen red on 2026-10-16 (the rail, decision 104), one at a time: the rail class dropped from the
 * rows that are wide at 768 — the open Cashflow left the rail («the open row did not leave the
 * rail»); the lone-row rule dropped — Asset principali and, with Cashflow open, Sintesi alone on half
 * a grid row at 768; the rail's columns without `max-desktop:` — 1440 no longer twelve tracks;
 * `min-w-11` taken off the period picker — «1A» under 44px; «Crea snapshot» back at `h-9`. And GREEN,
 * so the claim was wrong, not the test: the template's `1fr` as `auto`, or no `--beside` at all —
 * THE tile's last track is empty and takes its height either way (lib/utils/tabletComposition.ts).
 */

import { test, expect, type Page } from '@playwright/test';
import { openOverview, patchOverview } from './overviewFixture';
import {
  BAR_HEIGHT,
  GAP,
  RAIL_WIDTH,
  TOUCH_FLOOR,
  barGeometry,
  expectNoHalfCells,
  expectNoOverflow,
  expectOpenedRow,
  expectRail,
  foldOf,
  gridOf,
  gridTracks,
  isLandscape,
  openRow,
  rectOf,
} from './tabletLayout';

const LEAD_ID = 'panoramica-patrimonio';
/** The seven rows of the patched payload (no goal), in DOM order. */
const ROW_IDS = [
  'panoramica-sintesi',
  'panoramica-cashflow',
  'panoramica-composizione',
  'panoramica-costi',
  'panoramica-spese',
  'panoramica-entrate',
  'panoramica-asset',
] as const;

// Framer's entrance and the panels' spring off: every box is read where it lands.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const lead = (page: Page) => page.locator(`#${LEAD_ID}`);
const rest = (page: Page) => page.getByRole('heading', { level: 2, name: 'Il resto della pagina' }).locator('xpath=..');
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);

async function open(page: Page): Promise<void> {
  await patchOverview(page);
  await openOverview(page);
  await expect(lead(page)).toBeVisible();
}

test.describe('Panoramica, composed for a tablet', () => {
  test('two columns at 768; THE tile and the 360px rail at 1024; the first closed row above the fold', async ({ page }) => {
    await open(page);
    const grid = gridOf(page, LEAD_ID);
    expect((await gridTracks(grid)).columns).toBe(2);

    const [gridRect, theTile, first, fold] = await Promise.all([
      rectOf(grid),
      rectOf(lead(page)),
      rectOf(page.locator(`#${ROW_IDS[0]}`)),
      foldOf(page),
    ]);
    const expectedWidth = isLandscape(page) ? gridRect.width - RAIL_WIDTH - GAP : gridRect.width;
    expect(Math.abs(theTile.width - expectedWidth), 'THE tile beside the rail, or across the grid').toBeLessThanOrEqual(1);
    if (isLandscape(page)) {
      // At 1024 THE tile STARTS on the first screen and does not end there (decision 101): 715px
      // under the bar, of which the header and the verdict take ~370.
      expect(theTile.y, 'THE tile starts above the fold').toBeLessThan(fold);
    } else {
      expect(theTile.bottom, 'THE tile ends above the pill').toBeLessThanOrEqual(fold);
    }
    expect(first.bottom, 'the first closed row above the fold').toBeLessThanOrEqual(fold);
  });

  test('at 1024 «Il resto» and all seven rows sit in the rail; at 768 no grid row is half empty', async ({ page }) => {
    await open(page);
    if (isLandscape(page)) {
      await expectRail(page, lead(page), rest(page), ROW_IDS);
    } else {
      // Seven closed rows: the seventh, alone, takes the whole row.
      await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
    }
  });

  test('an opened row stays in the rail at 1024 and spans the grid at 768, the rows after it under it', async ({ page }) => {
    await open(page);
    const where = await openRow(page, ROW_IDS[1]);
    await expectOpenedRow(page, gridOf(page, LEAD_ID), ROW_IDS[1], where, ROW_IDS[0], ROW_IDS.slice(2));
    if (isLandscape(page)) {
      // Every row, the open one included, still in the rail in DOM order.
      await expectRail(page, lead(page), rest(page), ROW_IDS);
    } else {
      // Sintesi, left alone before the open Cashflow, takes the whole row too.
      await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
    }
  });

  test('the landscape bar is 53px with a 44px trigger; at 768 the pill instead', async ({ page }) => {
    await open(page);
    const bar = await barGeometry(page);
    const pill = page.locator('nav[aria-label="Navigazione principale"]');
    if (isLandscape(page)) {
      expect(bar.visible).toBe(true);
      expect(Math.abs(bar.barHeight - BAR_HEIGHT), `the bar measured ${bar.barHeight}px`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(bar.mainTop - bar.barHeight)).toBeLessThanOrEqual(0.5);
      expect(bar.mainClientHeight).toBe(768 - BAR_HEIGHT);
      expect(bar.trigger!.width).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(bar.trigger!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      await expect(pill).toBeHidden();
    } else {
      expect(bar.visible).toBe(false);
      expect(bar.mainTop).toBe(0);
      await expect(pill).toBeVisible();
    }
  });

  test('the header and the period picker are thumb targets', async ({ page }) => {
    await open(page);
    const snapshot = page.getByRole('button', { name: 'Crea snapshot' }).filter({ visible: true }).first();
    expect((await snapshot.boundingBox())!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    const periods = lead(page).getByRole('radiogroup', { name: 'Periodo del grafico' }).getByRole('radio');
    for (const radio of await periods.all()) {
      const box = (await radio.boundingBox())!;
      const name = (await radio.textContent()) ?? '';
      expect(box.width, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(box.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }
  });

  test('a rotation keeps the open rows; at 1440 the grid is the one of a page opened at 1440', async ({ page, context }) => {
    await open(page);
    await trigger(page, ROW_IDS[2]).click();
    await expect(trigger(page, ROW_IDS[2])).toHaveAttribute('aria-expanded', 'true');

    // Rotate: 768×1024 ⇄ 1024×768 — the open row ends in the rail, or across the grid.
    const landscape = isLandscape(page);
    await page.setViewportSize(landscape ? { width: 768, height: 1024 } : { width: 1024, height: 768 });
    const grid = gridOf(page, LEAD_ID);
    await expect
      .poll(async () => {
        const [row, gridRect] = await Promise.all([rectOf(page.locator(`#${ROW_IDS[2]}`)), rectOf(grid)]);
        return Math.round(row.width) === Math.round(landscape ? gridRect.width : RAIL_WIDTH);
      })
      .toBe(true);
    await expect(trigger(page, ROW_IDS[2])).toHaveAttribute('aria-expanded', 'true');

    // To 1440: twelve tracks, no tablet custom property left on the grid, the rows of today.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await gridTracks(grid)).columns).toBe(12);
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    const resized = await gridTracks(grid);
    expect(resized.beside).toBe('');
    expect(resized.leadRows).toBe('');

    const direct = await context.newPage();
    await direct.setViewportSize({ width: 1440, height: 900 });
    await open(direct);
    const opened = await gridTracks(gridOf(direct, LEAD_ID));
    expect(opened.columns).toBe(12);
    expect(resized.rows).toBe(opened.rows);
    await direct.close();
  });

  test('every row open, nothing runs past main', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await expectNoOverflow(page);
  });
});
