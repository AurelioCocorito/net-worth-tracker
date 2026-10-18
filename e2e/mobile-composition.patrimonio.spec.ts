/**
 * Patrimonio at 1440 after its phone composition (2026-10-14): the page of every width,
 * with the three changes the composition brought to the desktop too — the market a sentence of its
 * own, the year's variation in the verdict and Movimenti as a notice when the ledger
 * is not read (a client-SDK read cannot be failed from a spec, and Vitest holds only the
 * generic open-on-failure, `resolveOpenSections`: the notice itself has no automated proof). Here:
 * no row trigger in the grid, neither the strip nor «Il resto della pagina», one `<p>` verdict, the
 * hero's count a link to `#strumenti`. `aria-expanded` exists at 1440 too (Strumenti's group
 * headers, Movimenti's «Mostra tutte»): it is not what is asserted.
 *
 * Seen red on 2026-10-14 with `compact` ignored by the controller (`collapse()` answering at 1440):
 * five triggers in the grid.
 */

import { test, expect } from '@playwright/test';
import { patchOverview } from './overviewFixture';

test.setTimeout(90_000);

test('Patrimonio at 1440: no row, no strip, no «Il resto»; the market and the year in the sentence; the count links to the table', async ({ page }) => {
  await patchOverview(page, { topInstrumentMovers: [{ id: 'fenicottero', name: 'Fenicottero ETF', delta: 1500 }] });
  await page.goto('/dashboard/assets');
  const verdict = page.getByRole('region', { name: 'Verdetto del portafoglio' });
  await verdict.waitFor({ timeout: 60_000 });
  await expect(page.locator('section#strumenti')).toBeVisible();

  await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Il perché/ })).toBeHidden();

  await expect(verdict).toContainText(/cont[oi]\. Da inizio anno \+15,00% \(\+25\.000,00\s?€\)\. Sul mercato ha spinto soprattutto Fenicottero ETF/);
  await expect(page.getByRole('region', { name: 'Patrimonio' }).getByRole('link', { name: /\d+ strument[oi]/ })).toHaveAttribute('href', '#strumenti');
  // The tiles are whole: the month's chip and the G/P KPI are there.
  await expect(page.getByRole('region', { name: 'Patrimonio' }).getByText('questo mese')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rendimento' }).getByText('G/P non realizzato')).toBeVisible();
});

/**
 * Intestatari's «Valore | Carico» switch (owner, 2026-10-18): the tile exists on the base account
 * through its pension fund's member, the switch sits in its aside, and «Carico» rewrites the
 * reading («Al prezzo di carico, …») and the rows' aria-label; the choice is remembered per
 * browser (`localStorage`, one key for the Panoramica too), so it survives a reload — what only a
 * browser knows; the figures of the two splits are Vitest's (`__tests__/assetOwnership.test.ts`).
 * Seen red on 2026-10-18 with the write to the storage taken out (the reload came back on «Valore»).
 */
test('Intestatari at 1440: «Carico» rewrites the reading and is remembered across a reload', async ({ page }) => {
  await page.goto('/dashboard/assets');
  const tile = page.getByRole('region', { name: 'Intestatari' });
  await tile.waitFor({ timeout: 60_000 });
  const basis = tile.getByRole('group', { name: 'Base delle quote' });
  await expect(basis.getByRole('button', { name: 'Valore' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tile.getByText(/^Al prezzo di carico/)).toHaveCount(0);
  await expect(tile.getByRole('list', { name: 'Patrimonio per intestatario' })).toBeVisible();

  await basis.getByRole('button', { name: 'Carico' }).click();
  await expect(basis.getByRole('button', { name: 'Carico' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tile.getByText(/^Al prezzo di carico, /)).toBeVisible();
  await expect(tile.getByRole('list', { name: 'Prezzo di carico per intestatario' })).toBeVisible();

  await page.reload();
  await tile.waitFor({ timeout: 60_000 });
  await expect(tile.getByRole('group', { name: 'Base delle quote' }).getByRole('button', { name: 'Carico' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tile.getByText(/^Al prezzo di carico, /)).toBeVisible();
  // Back to the default, so the memory this test leaves is the one every other spec expects.
  await tile.getByRole('group', { name: 'Base delle quote' }).getByRole('button', { name: 'Valore' }).click();
  await expect(tile.getByText(/^Al prezzo di carico/)).toHaveCount(0);
});
