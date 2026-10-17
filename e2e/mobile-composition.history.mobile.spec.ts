/**
 * Storico composed for a phone (since 2026-10-14; doc/guide/storico.md § Composizione
 * mobile), on the base account at 390 (`mobile` project).
 *
 * What a browser alone can prove here: ONE cell of the Driver, «Risparmio {anno}» (the year written
 * by a regex: it ages), opens the Driver; the ledger is never lifted — read inside
 * `#storico-driver-panel`, where the featured year is the `button[aria-expanded="true"]` of the
 * panel, its VISIBLE rows add up to its total; THE tile hides the chips the first sentence restates,
 * the hero stays; the DOM order is the vertical order with no `order-*`.
 *
 * Seen red on 2026-10-14: (1) `LIFTED_FIGURE_CLASS` put on a ledger row (the visible sum no longer
 * met the total); (2) `liftedFigures` dropped from Evoluzione («dal primo snapshot» visible).
 */

import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);

const ROW_IDS = ['storico-composizione', 'storico-raddoppi', 'storico-driver', 'storico-valore'] as const;

/** «+1380 €», «−130 €», «0 €» → a number; the minus is the typographic one. */
function euros(text: string): number {
  const cleaned = text.replace(/[\s  €.]/g, '').replace('−', '-').replace('+', '').replace(',', '.');
  return Number(cleaned);
}

async function openStorico(page: Page) {
  await page.goto('/dashboard/history');
  await page.getByRole('region', { name: 'Verdetto sullo storico' }).waitFor({ timeout: 60_000 });
  await expect(page.locator('#storico-driver-trigger')).toBeVisible();
}

test.describe('Storico, composed for a phone', () => {
  test('the Driver\'s ONE cell opens the Driver, whose ledger adds up to its total on screen', async ({ page }) => {
    await openStorico(page);
    const strip = page.getByRole('list', { name: 'Le cifre del verdetto' });
    const driverCells = strip.getByRole('button', { name: /^Risparmio \d{4}/ });
    await expect(driverCells).toHaveCount(1);
    await expect(driverCells).toHaveAccessibleName(/, apre Driver della crescita$/);

    await driverCells.click();
    const trigger = page.locator('#storico-driver-trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toBeFocused();

    // The featured year's ledger: inside the panel, the year row is the open `button[aria-expanded]`.
    const panel = page.locator('#storico-driver-panel');
    const year = panel.locator('button[aria-expanded="true"]').first();
    await expect(year).toBeVisible();
    const ledger = await year.evaluate((button) => {
      const rows = [...document.getElementById(button.getAttribute('aria-controls')!)!.querySelectorAll<HTMLElement>(':scope > div > div > div')];
      return rows
        .filter((row) => row.checkVisibility())
        .map((row) => ({ label: row.children[0]?.textContent?.trim() ?? '', value: row.children[1]?.textContent?.trim() ?? '' }));
    });
    const total = ledger.find((row) => row.label === 'Crescita del patrimonio');
    expect(total, JSON.stringify(ledger)).toBeDefined();
    const parts = ledger.filter((row) => row.label !== 'Crescita del patrimonio');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.reduce((sum, row) => sum + euros(row.value), 0)).toBe(euros(total!.value));
    // The cell prints the ledger's own savings row.
    const savings = parts.find((row) => row.label === 'Risparmio')!;
    await expect(driverCells).toContainText(savings.value.replace(/[  ]/g, ' ').replace(' €', ''));
  });

  test('THE tile hides the chips the first sentence restates; the hero stays', async ({ page }) => {
    await openStorico(page);
    const evoluzione = page.getByRole('region', { name: 'Evoluzione del patrimonio' });
    await expect(evoluzione.locator('p, span').filter({ hasText: /^\d{1,3}(\.\d{3})*,\d{2}\s?€$/ }).first()).toBeVisible();
    await expect(evoluzione.getByText('dal primo snapshot')).toBeHidden();
    await expect(evoluzione.getByText('versamenti inclusi, non un rendimento')).toBeHidden();
  });

  test('the rows are closed and empty, and the DOM order is the vertical order with no order-*', async ({ page }) => {
    await openStorico(page);
    for (const id of ROW_IDS) {
      await expect(page.locator(`#${id}-trigger`)).toHaveAttribute('aria-expanded', 'false');
      expect(await page.locator(`#${id}-panel`).evaluate((el) => el.children.length), id).toBe(0);
    }
    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main section.rounded-2xl')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) })),
    );
    expect(order.map((s) => s.name)).toEqual(['Evoluzione del patrimonio', 'Composizione del patrimonio', 'Raddoppi del patrimonio', 'Driver della crescita', 'Valore per strumento']);
    expect(order.every((s, i) => i === 0 || s.top >= order[i - 1].top - 1), JSON.stringify(order)).toBe(true);
    expect(
      await page.evaluate(() => [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name))),
    ).toEqual([]);
  });
});
