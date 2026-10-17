/**
 * The Panoramica composed for a tablet (2026-10-16; doc/guide/panoramica.md § Composizione mobile):
 * one spec, two projects — `tablet` (768×1024, two columns, the pill) and `tablet-landscape`
 * (1024×768, the stage: the answer on the left, the index on the right, the icon rail) — branching on
 * the width. Base account with the overview response patched on the wire (`e2e/overviewFixture.ts`:
 * `hasTERTracking` on and no goal, so SEVEN closed rows — Sintesi, Cashflow, Composizione, Costi,
 * Spese, Entrate, Asset).
 *
 * What a browser alone can prove: the columns at 768 and the landscape stage (the verdict and THE tile
 * 16px apart on the left, the 360px index on the right starting on the verdict line and ending on
 * THE tile line, every row in it in DOM order); an opened row that stays where it was with nothing
 * scrolled, or at 768 spans the grid; no half grid row at 768; the icon rail in landscape; the left
 * stack still while the page scrolls, never overlapped; the same grid as today at 1440 after a
 * resize; nothing past `main`. Where each row goes at 768 is Vitest's (`__tests__/tabletComposition.test.ts`).
 *
 * Seen red on 2026-10-16 (the landscape stage), one at a time, with `cashflow.tablet.spec.ts`
 * and `patrimonio.tablet.spec.ts`: `INDEX_CLASS`'s `min-h` dropped — «the index ends on THE tile line»;
 * the stage's columns without `max-desktop:` — «the grid spans main at 1440» (the 1440 grid squeezed
 * into the 360px column; the first version of the check counted twelve tracks and stayed GREEN);
 * `REST_CELL_CLASS` emptied — «"Il resto" as tall as a row»; `WIDE_CELL_CLASS` emptied — «the open row
 * spans the grid» and «alone on half a grid row» at 768. GREEN, and so declared: the verdict's bottom
 * margin (`--lead-h`) taken out — nothing follows the stage on this page, so the left stack is never
 * pushed up; the margin holds where something does (Analisi, Storico, Allocazione), with no spec.
 */

import { test, expect, type Page } from '@playwright/test';
import { openOverview, patchOverview } from './overviewFixture';
import {
  TOUCH_FLOOR,
  expectGridAcrossMain,
  expectLandscapeShell,
  expectLandscapeStage,
  expectNoHalfCells,
  expectNoOverflow,
  expectOpenedRow,
  expectStickyStage,
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
const main = (page: Page) => page.locator('#page-main');
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);

async function open(page: Page): Promise<void> {
  await patchOverview(page);
  await openOverview(page);
  await expect(lead(page)).toBeVisible();
}

test.describe('Panoramica, composed for a tablet', () => {
  test('two columns at 768 with THE tile across them; the landscape stage at 1024; the first closed row above the fold', async ({ page }) => {
    await open(page);
    const fold = await foldOf(page);
    if (isLandscape(page)) {
      await expectLandscapeStage(page, main(page), ROW_IDS);
    } else {
      const grid = gridOf(page, LEAD_ID);
      expect((await gridTracks(grid)).columns).toBe(2);
      const [gridRect, theTile] = await Promise.all([rectOf(grid), rectOf(lead(page))]);
      expect(Math.abs(theTile.width - gridRect.width), 'THE tile across the grid').toBeLessThanOrEqual(1);
      expect(theTile.bottom, 'THE tile ends above the pill').toBeLessThanOrEqual(fold);
    }
    const first = await rectOf(page.locator(`#${ROW_IDS[0]}`));
    expect(first.bottom, 'the first closed row above the fold').toBeLessThanOrEqual(fold);
  });

  test('at 768 no grid row is half empty', async ({ page }) => {
    test.skip(isLandscape(page), 'a 768 rule');
    await open(page);
    // Seven closed rows: the seventh, alone, takes the whole row.
    await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
  });

  test('an opened row stays in place in the index at 1024 and spans the grid at 768, the rows after it under it', async ({ page }) => {
    await open(page);
    const where = await openRow(page, ROW_IDS[1]);
    await expectOpenedRow(page, gridOf(page, LEAD_ID), ROW_IDS[1], where, ROW_IDS[0], ROW_IDS.slice(2));
    if (isLandscape(page)) {
      await expectLandscapeStage(page, main(page), ROW_IDS);
    } else {
      // Sintesi, left alone before the open Cashflow, takes the whole row too.
      await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
    }
  });

  test('the icon rail in landscape, the pill at 768', async ({ page }) => {
    await open(page);
    if (isLandscape(page)) {
      await expectLandscapeShell(page);
    } else {
      await expect(page.locator('nav[data-nav="pill"]')).toBeVisible();
      await expect(page.locator('[data-sidebar="trigger"]').filter({ visible: true })).toHaveCount(0);
    }
  });

  test('every row open: the left stack stays still, never overlapped, and nothing runs past main', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Apri tutte' }).filter({ visible: true }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    if (isLandscape(page)) await expectStickyStage(page, main(page));
    await expectNoOverflow(page);
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

    // Rotate: 768×1024 ⇄ 1024×768 — the open row ends in the index, or across the grid.
    const landscape = isLandscape(page);
    await page.setViewportSize(landscape ? { width: 768, height: 1024 } : { width: 1024, height: 768 });
    await expect
      .poll(async () => {
        const row = await rectOf(page.locator(`#${ROW_IDS[2]}`));
        if (landscape) return Math.round(row.width) === Math.round((await rectOf(gridOf(page, LEAD_ID))).width);
        const index = await rectOf(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' }).locator('xpath=../..'));
        return row.x >= index.x && row.right <= index.right + 0.5;
      })
      .toBe(true);
    await expect(trigger(page, ROW_IDS[2])).toHaveAttribute('aria-expanded', 'true');

    // To 1440: twelve tracks and the rows of today.
    await page.setViewportSize({ width: 1440, height: 900 });
    const grid = gridOf(page, LEAD_ID);
    await expect.poll(async () => (await gridTracks(grid)).columns).toBe(12);
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    await expectGridAcrossMain(page, grid);
    const resized = await gridTracks(grid);

    const direct = await context.newPage();
    await direct.setViewportSize({ width: 1440, height: 900 });
    await open(direct);
    const opened = await gridTracks(gridOf(direct, LEAD_ID));
    expect(opened.columns).toBe(12);
    expect(resized.rows).toBe(opened.rows);
    await direct.close();
  });
});
