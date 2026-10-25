/**
 * Impostazioni › Aspetto · Pagina iniziale (2026-10-25). Desktop 1440.
 *
 * What only the browser can prove: choosing «Cashflow» on this device sends a tab opened on
 * Panoramica to Cashflow once, a later visit to Panoramica from the menu stays there, and
 * choosing «Panoramica» back stops the redirect. The rules live in __tests__/startPage.test.ts.
 * The choice is localStorage only: nothing is written to Firestore, so nothing needs removing.
 */

import { test, expect } from '@playwright/test';

test.setTimeout(180_000);

test('the start page sends a tab opened on Panoramica to Cashflow, once', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard/settings?tab=aspetto', { waitUntil: 'load' });
  const group = page.getByRole('group', { name: 'Pagina iniziale' });
  await expect(group).toBeVisible({ timeout: 90_000 });
  await group.getByRole('button', { name: 'Cashflow' }).click();
  await expect(group.getByRole('button', { name: 'Cashflow' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/si apre su Cashflow/)).toBeVisible();

  // A new tab opened on Panoramica (a bookmark, the home-screen icon) lands on Cashflow.
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.goto('/dashboard', { waitUntil: 'load' });
  await expect(tab).toHaveURL(/\/dashboard\/cashflow/, { timeout: 90_000 });

  // Panoramica from the menu, in the same tab, stays on Panoramica.
  await tab.goto('/dashboard', { waitUntil: 'load' });
  await tab.waitForTimeout(3_000);
  await expect(tab).toHaveURL(/\/dashboard$/);
  await tab.close();

  // Back to Panoramica: a new tab stays where it opened.
  await group.getByRole('button', { name: 'Panoramica' }).click();
  const second = await context.newPage();
  await second.goto('/dashboard', { waitUntil: 'load' });
  await second.waitForTimeout(3_000);
  await expect(second).toHaveURL(/\/dashboard$/);
  await second.close();
});
