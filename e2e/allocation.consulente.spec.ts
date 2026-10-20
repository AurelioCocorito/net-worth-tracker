/**
 * Allocazione › Consulente — the eight screens, at 1440px, on the base account.
 *
 * PERCHÉ ESISTE: il percorso è un reducer puro con una schermata per domanda, e Vitest ne tiene
 * ogni transizione; quello che solo un browser sa è che la pagina si raggiunge dal bottone di
 * Allocazione, che ogni schermata mostra il suo passo e i suoi controlli, che «Avanti» resta
 * fermo finché il passo non è completo, che «Indietro» torna, che la bozza sopravvive a un
 * reload (localStorage) e che il riepilogo rimanda alla schermata giusta.
 *
 * NON avvia mai la ricerca: «Avvia la ricerca» chiama due modelli con la chiave vera (WORKFLOW.md
 * § 3: a probe never opens a control that SPENDS). La corsa è coperta da `allocationAdviceRun`
 * (SDK simulato) e, il 2026-10-20, da una corsa vera sul mirror.
 *
 * Account base (`test@example.com`): l'età può non essere nelle impostazioni, quindi la spec la
 * scrive; gli obiettivi del seed, se ci sono, si attraversano con «Avanti» finché compare «cosa
 * manca» — la spec non conta su un numero.
 */

import { test, expect, type Page } from '@playwright/test';

async function openConsulente(page: Page) {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  const button = page.getByRole('link', { name: 'Consulente' }).filter({ visible: true }).first();
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL(/\/dashboard\/allocation\/consulente/);
  // A finished report on this account (a real run left one on 2026-10-20) opens the page on the
  // report: «Rifai il percorso» brings the screens back. The emulators keep the document between runs.
  const step1 = page.getByRole('heading', { name: /Passo 1 di 8/ });
  const redo = page.getByRole('button', { name: /Rifai il percorso|Ricomincia il percorso/ });
  await expect(step1.or(redo)).toBeVisible({ timeout: 60_000 });
  if (await redo.isVisible()) await redo.click();
  await expect(step1).toBeVisible({ timeout: 60_000 });
}

async function next(page: Page) {
  await page.getByRole('button', { name: 'Avanti' }).click();
}

async function walkGoals(page: Page) {
  // One sub-screen per goal, then «cosa manca» — however many goals the seed holds.
  for (let i = 0; i < 12; i += 1) {
    if ((await page.locator('#consulente-missing').count()) > 0) return;
    await next(page);
  }
  throw new Error('the goals screen never reached «cosa manca»');
}

test.beforeEach(async ({ page }) => {
  // The draft of a previous run must not steer this one.
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('allocation-advice-draft:')) localStorage.removeItem(key);
  });
});

test('walks the eight screens, «Avanti» held until a screen is complete, and «Indietro» returns', async ({ page }) => {
  await openConsulente(page);

  // Step 1: without the horizon the screen says so and «Avanti» stays disabled.
  await page.locator('#consulente-age').fill('35');
  await page.locator('#consulente-horizon').fill('');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('quanti anni investi');
  await page.locator('#consulente-horizon').fill('20');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeEnabled();
  await next(page);

  // Step 2: three loss rows in euro, a radio of three.
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();
  const scenarios = page.getByRole('list', { name: 'Scenari di perdita sulla tua base' });
  await expect(scenarios.getByRole('listitem')).toHaveCount(3);
  await expect(scenarios).toContainText('−10%');
  await page.getByRole('radio', { name: 'Alta' }).check();
  await next(page);

  // Step 3: the exchange is prefilled, the broker optional.
  await expect(page.getByRole('heading', { name: /Passo 3 di 8/ })).toBeVisible();
  // The exchange is a closed list with «Altra…» opening a free field; the default stays Borsa Italiana.
  await expect(page.locator('#consulente-exchange')).toContainText('Borsa Italiana');
  await page.locator('#consulente-exchange').click();
  await page.getByRole('option', { name: 'Altra…' }).click();
  await page.locator('#consulente-exchange-other').fill('SIX Swiss Exchange');
  await page.locator('#consulente-exchange').click();
  await page.getByRole('option', { name: /Borsa Italiana/ }).click();
  await expect(page.locator('#consulente-exchange-other')).toHaveCount(0);
  await page.locator('#consulente-broker').fill('Broker X');
  await next(page);

  await expect(page.getByRole('heading', { name: /Passo 4 di 8/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Distribuzione' }).check();
  await next(page);

  // Step 5: the goals, then «cosa manca» with its textarea and «Aggiungi un obiettivo».
  await expect(page.getByRole('heading', { name: /Passo 5 di 8/ })).toBeVisible();
  await walkGoals(page);
  await page.locator('#consulente-missing').fill('un fondo per i figli');
  await page.getByRole('button', { name: 'Aggiungi un obiettivo' }).click();
  // The new goal's screen: no name → blocked; a name → on.
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeDisabled();
  await page.locator('input[id^="goal-"][id$="-name"]').fill('Fondo figli');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeEnabled();
  await next(page);
  await expect(page.locator('#consulente-missing')).toHaveValue('un fondo per i figli');
  await next(page);

  // Step 6: three role blocks.
  await expect(page.getByRole('heading', { name: /Passo 6 di 8/ })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(3);
  await next(page);

  // Step 7: the constraints.
  await expect(page.getByRole('heading', { name: /Passo 7 di 8/ })).toBeVisible();
  await page.locator('#consulente-avoid').fill('niente leva');
  await next(page);

  // Step 8: the summary rows, each a link back; the run button present and never pressed.
  await expect(page.getByRole('heading', { name: /Passo 8 di 8/ })).toBeVisible();
  const summary = page.getByRole('list', { name: 'Le tue risposte' });
  await expect(summary).toContainText('35 anni · 20 anni di orizzonte');
  await expect(summary).toContainText('Broker X');
  await expect(summary).toContainText('distribuzione');
  await expect(summary).toContainText('Fondo figli');
  await expect(summary).toContainText('evita: niente leva');
  await expect(page.getByRole('button', { name: 'Avvia la ricerca' })).toBeVisible();

  // «Indietro» returns to the constraints; the summary's row opens its screen.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('heading', { name: /Passo 7 di 8/ })).toBeVisible();
  await next(page);
  await summary.getByRole('button', { name: /Borsa e broker/ }).click();
  await expect(page.getByRole('heading', { name: /Passo 3 di 8/ })).toBeVisible();
  await expect(page.locator('#consulente-broker')).toHaveValue('Broker X');
});

test('the draft survives a reload on this browser', async ({ page }) => {
  await openConsulente(page);
  await page.locator('#consulente-age').fill('42');
  await page.locator('#consulente-horizon').fill('15');
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.locator('#consulente-age')).toHaveValue('42');
  await expect(page.locator('#consulente-horizon')).toHaveValue('15');
});

test('the assistant links to the Consulente', async ({ page }) => {
  await page.goto('/dashboard/assistant', { waitUntil: 'load' });
  const link = page.getByRole('link', { name: /Imposta la tua allocazione con il Consulente/ });
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(link).toHaveAttribute('href', '/dashboard/allocation/consulente');
});
