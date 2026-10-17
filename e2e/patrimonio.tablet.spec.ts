/**
 * Patrimonio on a tablet with the overview unread (2026-10-16): no THE tile, no stage — the plain
 * two-column grid of before, on which Strumenti spans both columns at 768 and in landscape, as it did
 * before the tablet composition. Base account; the overview request aborted on the wire, as
 * `mobile-composition.patrimonio.mobile.spec.ts` does at 390.
 *
 * Seen red on 2026-10-16 with `tablet:col-span-2` taken off Strumenti in that state — the defect the
 * retirement of the tablet spec found: «Strumenti spans the grid» red at 768 and at 1024 (half the grid).
 */

import { test, expect } from '@playwright/test';
import { isLandscape, rectOf } from './tabletLayout';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('with the overview unread, Strumenti spans the plain grid at 768 and in landscape', async ({ page }) => {
  await page.route('**/api/dashboard/overview*', (route) => route.abort());
  await page.goto('/dashboard/assets');
  await expect(page.getByText(/Il riepilogo del patrimonio non è stato letto/)).toBeVisible({ timeout: 60_000 });
  // No THE tile, so no stage: nothing is measured or sticky.
  await expect(page.locator('[data-stage="lead"]')).toHaveCount(0);

  const strumenti = page.locator('#patrimonio-strumenti');
  await expect(strumenti).toBeVisible();
  const grid = strumenti.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " grid ")][1]');
  const [row, gridRect] = await Promise.all([rectOf(strumenti), rectOf(grid)]);
  expect(Math.abs(row.width - gridRect.width), `Strumenti spans the grid (${isLandscape(page) ? 'landscape' : '768'})`).toBeLessThanOrEqual(1);
});
