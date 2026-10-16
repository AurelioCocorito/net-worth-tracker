/**
 * Cashflow › Tracciamento composed for a tablet (MOB-08, 2026-10-16; doc/guide/cashflow-tracciamento.md
 * § Composizione mobile): one spec, two projects — `tablet` (768×1024) and `tablet-landscape`
 * (1024×768) — branching on the width, on the base account as it is (four closed rows: Spese,
 * Entrate, Risparmio nel tempo, Movimenti; at 1024 all four in the 360px rail beside THE tile). The tab's own add affordances are the point of the second half: the portrait «+» of the
 * pill at 768, the axis' «Aggiungi» at 1024 — the only one in landscape, a 44px target.
 *
 * At 1024 THE tile starts on the first screen and does not end there (owner, 2026-10-16,
 * doc/mobile/README.md § 9, 101): the header, the tab pill and the verdict take ~425 of 715px.
 *
 * Seen red on 2026-10-16 (the rail, decision 104), one at a time (with `overview.tablet.spec.ts`):
 * THE tile spanning only the rail's tracks — «trk-entrate: 12px under the one before» (THE tile is
 * taller than the four rows here, so this is the spec that holds the flexible track); the rail class
 * dropped from the rows wide at 768 — the open Entrate left the rail; the lone-row rule dropped —
 * Spese alone on half a grid row before the open Entrate at 768.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  GAP,
  RAIL_WIDTH,
  TOUCH_FLOOR,
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

const LEAD_ID = 'trk-periodo';
/** The four rows, in DOM order. */
const ROW_IDS = ['trk-spese', 'trk-entrate', 'trk-risparmio', 'trk-movimenti'] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Tracciamento' });
const lead = (page: Page) => page.locator(`#${LEAD_ID}`);
const rest = (page: Page) => panel(page).getByRole('heading', { level: 2, name: 'Il resto della pagina' }).locator('xpath=..');
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);

async function open(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
  await expect(lead(page)).toBeVisible();
}

test.describe('Cashflow › Tracciamento, composed for a tablet', () => {
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
      // At 1024 THE tile STARTS on the first screen and does not end there (owner, 2026-10-16,
      // doc/mobile/README.md § 9, 101): the header, the tab pill and the verdict take ~425 of 715px.
      expect(theTile.y, 'THE tile starts above the fold').toBeLessThan(fold);
    } else {
      expect(theTile.bottom, 'THE tile ends above the pill').toBeLessThanOrEqual(fold);
    }
    expect(first.bottom, 'the first closed row above the fold').toBeLessThanOrEqual(fold);
  });

  test('at 1024 «Il resto» and the four rows sit in the rail; at 768 they pair up', async ({ page }) => {
    await open(page);
    if (isLandscape(page)) await expectRail(page, lead(page), rest(page), ROW_IDS);
    else await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
  });

  test('an opened row stays in the rail at 1024 and spans the grid at 768, the rows after it under it', async ({ page }) => {
    await open(page);
    const where = await openRow(page, ROW_IDS[1]);
    await expectOpenedRow(page, gridOf(page, LEAD_ID), ROW_IDS[1], where, ROW_IDS[0], ROW_IDS.slice(2));
    if (isLandscape(page)) await expectRail(page, lead(page), rest(page), ROW_IDS);
    // Spese, left alone before the open Entrate, takes the whole row.
    else await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
  });

  test('a rotation keeps Movimenti open, its feed whole; nothing runs past main', async ({ page }) => {
    await open(page);
    await trigger(page, 'trk-movimenti').click();
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ })).toBeVisible();

    const landscape = isLandscape(page);
    await page.setViewportSize(landscape ? { width: 768, height: 1024 } : { width: 1024, height: 768 });
    await expect
      .poll(async () => {
        const [row, gridRect] = await Promise.all([rectOf(page.locator('#trk-movimenti')), rectOf(gridOf(page, LEAD_ID))]);
        return Math.round(row.width) === Math.round(landscape ? gridRect.width : RAIL_WIDTH);
      })
      .toBe(true);
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'true');

    await panel(page).getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await expectNoOverflow(page);
  });

  test('the tabs are 44×44; the «+» at 768, «Aggiungi» at 1024 is 44px tall and the «+» is gone', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('tab').filter({ visible: true });
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    for (const tab of await tabs.all()) {
      const box = (await tab.boundingBox())!;
      const name = (await tab.getAttribute('aria-label')) ?? '';
      expect(box.width, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(box.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    const fab = page.getByRole('button', { name: 'Aggiungi nuova voce' });
    const add = page.getByRole('button', { name: 'Aggiungi voce', exact: true });
    if (isLandscape(page)) {
      await expect(add).toBeVisible();
      expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      await expect(fab).toBeHidden();
    } else {
      await expect(fab).toBeVisible();
      await expect(add).toBeHidden();
    }
  });
});
