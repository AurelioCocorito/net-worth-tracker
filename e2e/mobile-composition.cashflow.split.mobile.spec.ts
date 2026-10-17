/**
 * Cashflow › Divisione composed for a phone (since 2026-10-12; doc/guide/cashflow-divisione.md
 * § Composizione mobile), on the split account over «Quest'anno» — the window the fixture is
 * written for (`scripts/seedSplitE2E.mts`: Ghiandaia keeps 2200 € of what has moved, Nibbio
 * +500 € today and −100 € once the 1500 € still in the calendar is paid).
 *
 * What a browser alone can prove: the strip is one cell per person on the BOOKED residual, in
 * the positive token — never the period's −100 €; the calendar's clause is the scope line under
 * the strip (The Scheduled-Is-Not-Spent Rule; at 1440 `cashflow.split.spec.ts` prints it too); Tracciamento and
 * Divisione, both mounted (`forceMount`), each have their own «Il perché» and no id is doubled in
 * `main` — five verdicts share one DOM, so every rest id is prefixed.
 *
 * `.split.mobile.spec.ts`: collected by `split-mobile` alone (`playwright.config.ts`).
 *
 * Seen red on 2026-10-12: the strip reading `remaining` instead of `remainingBooked` (Nibbio
 * «−100 €»); `residualTone` with its two tones swapped (Ghiandaia's cell without the gain token);
 * both tabs on the default `restId` (two `perche-panel` in `main`). The scope rendered only when
 * `compact` goes red at 1440, in `cashflow.split.spec.ts` — at 390 `compact` is always true.
 */

import { test, expect, type Page } from '@playwright/test';

const strip = (page: Page) => page.getByRole('tabpanel', { name: 'Divisione' }).getByRole('list', { name: 'Le cifre del verdetto' });

async function chooseThisYear(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: "Quest'anno", exact: true }).filter({ visible: true }).first().click();
}

async function openDivisione(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow?tab=split');
  await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });
  await chooseThisYear(page);
  await expect(page.getByRole('region', { name: 'Verdetto sulla divisione' })).toContainText(/900\s?€ a Ghiandaia/);
}

test.describe('Cashflow › Divisione, composed for a phone', () => {
  test('one cell per person on the booked residual, the hero lifted, the calendar as the scope line', async ({ page }) => {
    await openDivisione(page);

    const cells = strip(page).getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/Ghiandaia\s*2200\s?€/);
    await expect(cells.nth(1)).toContainText(/Nibbio\s*500\s?€/);
    await expect(cells.nth(1)).not.toContainText('100');
    // Both residuals in the gain tone (`residualTone`, the tile's own rule).
    await expect(cells.nth(0).locator('span.text-positive')).toHaveCount(1);
    await expect(cells.nth(1).locator('span.text-positive')).toHaveCount(1);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Nibbio$/);

    // The scope line: the calendar's clause, under the strip and before «Il perché» — the three
    // boxes read in ONE pass, before any tap scrolls the page (a `reveal` scrolls smoothly, and
    // two reads taken during it disagree).
    const scope = page.getByText(/Nel totale ci sono ancora\s*1500\s?€ di spese già in calendario da qui a fine anno/).filter({ visible: true });
    await expect(scope).toBeVisible();
    const perche = page.getByRole('button', { name: /^Il perché · quanto resta a ciascuno/ });
    await expect(perche).toBeVisible();
    const [stripBox, scopeBox, percheBox] = await Promise.all([strip(page).boundingBox(), scope.boundingBox(), perche.boundingBox()]);
    expect(scopeBox!.y, JSON.stringify({ stripBox, scopeBox })).toBeGreaterThanOrEqual(stripBox!.y + stripBox!.height - 1);
    expect(percheBox!.y).toBeGreaterThanOrEqual(scopeBox!.y + scopeBox!.height - 1);

    // The people are closed rows, their hero hidden where the strip prints it (The Lifted-Figure Rule).
    const nibbioRow = page.getByRole('region', { name: 'Quanto resta a Nibbio' });
    await expect(nibbioRow.locator('[id$="-trigger"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(nibbioRow.locator('[id$="-trigger"]')).toContainText('quanto resta');
    await cells.nth(1).click();
    await expect(nibbioRow.locator('[id$="-trigger"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(nibbioRow.locator('p.font-mono').first()).toBeHidden();
    await expect(nibbioRow).toContainText(/Con le spese ancora in calendario mancano\s*100\s?€/);

    // The verdict's first part stops at the shares; the rest — what remains to each, then the
    // calendar's turn — is behind «Il perché».
    const rest = page.locator('#spl-perche-panel');
    await expect(rest).toBeHidden();
    await perche.click();
    await expect(perche).toHaveAttribute('aria-expanded', 'true');
    await expect(rest).toBeVisible();
    await expect(rest).toContainText(/Con le spese in calendario, a fine periodo/);
  });

  test('Tracciamento and Divisione each keep their own «Il perché»: no id is doubled in main', async ({ page }) => {
    await openDivisione(page);
    await expect(page.locator('#spl-perche-panel')).toHaveCount(1);

    // Tracciamento on the same window (its period is the page's): rows lived and rows ahead, so
    // its verdict has a first sentence and a rest of its own.
    await page.getByRole('tab', { name: 'Tracciamento' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Tracciamento' })).toBeVisible();
    await chooseThisYear(page);
    await expect(page.getByRole('tabpanel', { name: 'Tracciamento' }).getByRole('button', { name: /^Il perché · dove chiude il periodo/ })).toBeVisible();

    // Both rests in one `main`, each with its own id — with the default `restId` on both tabs
    // this read `['perche-panel']` (seen red on 2026-10-12).
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of document.querySelector('main')!.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
    await expect(page.locator('#trk-perche-panel')).toHaveCount(1);
    await expect(page.locator('#spl-perche-panel')).toHaveCount(1);
  });
});
