/**
 * Impostazioni — three fixes of the 2026-10-25 review. Desktop 1440.
 *
 *   1. Deleting a category with «Sposta … ed elimina» re-types the moved rows to the destination
 *      (a variable expense reassigned to a fixed category is fixed), asserted on Firestore.
 *   2. The CSV import preview flags a trade row whose price is far from the instrument's current
 *      price («prezzi da controllare»), without refusing it.
 *   3. The backup reminder: with no `users/{uid}.lastBackupAt` the «Backup» row of Strumenti
 *      carries its mark and the tile says there is no backup yet; «Scarica backup» stamps the date
 *      and both go quiet.
 *
 * Every test plants its own decoys (lontra, castoro, tasso) and removes them in `finally` —
 * data-only, never a re-seed (doc/guide/e2e-emulatori.md).
 */

import { test, expect } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

test('deleting a category moves its rows with the destination type', async ({ page }) => {
  const db = await admin();
  const SOURCE = 'e2e-cat-lontra-variabili';
  const TARGET = 'e2e-cat-lontra-fisse';
  const ROWS = ['e2e-exp-lontra-1', 'e2e-exp-lontra-2'];
  const remove = async () => {
    for (const id of ROWS) await db.collection('expenses').doc(id).delete();
    for (const id of [SOURCE, TARGET]) await db.collection('expenseCategories').doc(id).delete();
  };
  await remove();
  const now = new Date();
  await db.collection('expenseCategories').doc(SOURCE).set({ userId: UID, name: 'Lontra Variabili', type: 'variable', subCategories: [], createdAt: now, updatedAt: now });
  await db.collection('expenseCategories').doc(TARGET).set({ userId: UID, name: 'Lontra Fisse', type: 'fixed', subCategories: [], createdAt: now, updatedAt: now });
  for (const id of ROWS) {
    await db.collection('expenses').doc(id).set({
      userId: UID, type: 'variable', categoryId: SOURCE, categoryName: 'Lontra Variabili', amount: -40,
      currency: 'EUR', date: new Date(now.getFullYear(), now.getMonth(), 1, 12), createdAt: now, updatedAt: now,
    });
  }

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
    const deleteButton = page.getByRole('button', { name: 'Elimina Lontra Variabili', exact: true });
    await expect(deleteButton).toBeVisible({ timeout: 90_000 });
    await deleteButton.click();

    const dialog = page.getByRole('dialog', { name: 'Elimina Lontra Variabili' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('combobox').click();
    await dialog.getByRole('option', { name: /Lontra Fisse/ }).click();
    await dialog.getByRole('button', { name: 'Sposta 2 movimenti ed elimina' }).click();
    await dialog.getByRole('button', { name: /Premi di nuovo/ }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect.poll(async () => (await db.collection('expenseCategories').doc(SOURCE).get()).exists, { timeout: 30_000 }).toBe(false);
    for (const id of ROWS) {
      const row = (await db.collection('expenses').doc(id).get()).data();
      expect(row).toMatchObject({ categoryId: TARGET, categoryName: 'Lontra Fisse', type: 'fixed', amount: -40 });
    }
  } finally {
    await remove();
  }
});

test('the import preview flags a price far from the instrument’s', async ({ page }) => {
  const db = await admin();
  const ETF_ID = 'e2e-asset-castoro';
  const ISIN = 'IE00CASTORO1';
  const now = new Date();
  await db.collection('assets').doc(ETF_ID).set({
    userId: UID, ticker: 'CASTORO', name: 'Castoro ETF', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 10, averageCost: 40, averageCostEur: 40, currentPrice: 50, isLiquid: true, autoUpdatePrice: false,
    taxRate: 26, isin: ISIN, allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
    const input = page.getByLabel('Carica file CSV storico spese');
    await expect(input).toBeAttached({ timeout: 90_000 });
    // The average cost typed with a dot for decimals: «48.500» is read as 48500, a thousand times the price.
    const csv = ['data;tipo;isin;quantita;prezzo;note', `2026-10-01;correzione;${ISIN};10;48.500;fotografia`].join('\n');
    await input.setInputFiles({ name: 'castoro.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });

    const warnings = page.getByTestId('import-price-warnings');
    await expect(warnings).toBeVisible({ timeout: 30_000 });
    await expect(warnings).toContainText('Un prezzo da controllare');
    await expect(warnings).toContainText('Riga 1');
    await expect(warnings).toContainText('Castoro ETF: prezzo medio 48.500 contro un prezzo attuale di 50 (×970)');
    // A warning, not a refusal: the row is still importable.
    await expect(page.getByRole('button', { name: 'Importa 1 voci' })).toBeEnabled();
    await page.getByLabel('Import CSV').getByRole('button', { name: 'Annulla', exact: true }).click();
  } finally {
    await db.collection('assets').doc(ETF_ID).delete();
  }
});

test('the backup reminder marks «Backup» until a backup is downloaded', async ({ page }) => {
  const db = await admin();
  const { FieldValue } = await import('firebase-admin/firestore');
  const userRef = db.collection('users').doc(UID);
  const before = (await userRef.get()).data()?.lastBackupAt;
  await userRef.set({ lastBackupAt: FieldValue.delete() }, { merge: true });

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/settings?tab=condivisione&sezione=backup', { waitUntil: 'load' });
    const mark = page.getByTestId('backup-due-mark');
    await expect(mark.first()).toBeVisible({ timeout: 90_000 });
    const tile = page.locator('section[aria-label="Backup dei dati"]');
    await expect(tile).toContainText('Nessun backup scaricato finora');

    const download = page.waitForEvent('download');
    await tile.getByRole('button', { name: 'Scarica backup' }).click();
    await download;
    await expect(tile).toContainText('Backup scaricato', { timeout: 60_000 });

    await expect.poll(async () => (await userRef.get()).data()?.lastBackupAt !== undefined, { timeout: 30_000 }).toBe(true);
    await expect(mark).toHaveCount(0, { timeout: 30_000 });

    // A fresh visit reads the stamped date.
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('section[aria-label="Backup dei dati"]')).toContainText('Ultimo backup: oggi', { timeout: 90_000 });
    await expect(page.getByTestId('backup-due-mark')).toHaveCount(0);
  } finally {
    await userRef.set({ lastBackupAt: before ?? FieldValue.delete() }, { merge: true });
  }
});
