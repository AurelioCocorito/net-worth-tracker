/**
 * Impostazioni › Spese · Import CSV — investment rows (2026-10-25). Desktop 1440.
 *
 * What only the browser against the emulators can prove: a CSV with «acquisto», «vendita» and
 * «correzione» rows becomes trades of the Registro operazioni through the ledger route (the
 * replay rewrites quantity and average cost), the settlement account moves by price × units ±
 * fees − tax, an unknown ISIN is created as an instrument with the CSV's class and tax rate, and
 * «Annulla import» gives everything back — trades, balances and the created instruments. Every
 * outcome is asserted on Firestore (Admin SDK), never on the look of the page. The parsing rules
 * live in __tests__/expenseImport.test.ts, the commit order in __tests__/investmentImportService.test.ts.
 *
 * The test plants its own instrument and account (decoy names absent from the seed) and removes
 * what it and the app created in `finally` — data-only, never a re-seed
 * (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
 */

import { test, expect } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ETF_ID = 'e2e-importtrades-tapiro';
const ACCOUNT_ID = 'e2e-importtrades-fenicottero';
const ETF_ISIN = 'IE00TAPIRO01';
const NEW_STOCK_ISIN = 'US0RNITORIN1';
const NEW_BOND_ISIN = 'AT0PELLICAN1';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

/** 10 units held at 100 € and an account holding 1.000 €. */
async function plant(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  await db.collection('assets').doc(ETF_ID).set({
    userId: UID, ticker: 'TAPIRO', name: 'Tapiro ETF', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 10, averageCost: 100, averageCostEur: 100, currentPrice: 110, isLiquid: true, autoUpdatePrice: false,
    taxRate: 26, isin: ETF_ISIN, allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('assetTransactions').doc(`${ETF_ID}-baseline`).set({
    userId: UID, assetId: ETF_ID, type: 'buy', date: new Date(2026, 0, 2), quantity: 10,
    pricePerUnit: 100, priceEur: 100, isBaseline: true, createdAt: now, updatedAt: now,
  });
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: '', name: 'Fenicottero Broker', type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: 1000, currentPrice: 1, isLiquid: true, autoUpdatePrice: false, createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
}

async function createdByIsin(db: FirebaseFirestore.Firestore, isin: string) {
  return (await db.collection('assets').where('userId', '==', UID).where('isin', '==', isin).get()).docs;
}

async function remove(db: FirebaseFirestore.Firestore) {
  const ids = [ETF_ID, ...(await createdByIsin(db, NEW_STOCK_ISIN)).map((d) => d.id), ...(await createdByIsin(db, NEW_BOND_ISIN)).map((d) => d.id)];
  for (const assetId of ids) {
    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', assetId).get();
    for (const trade of trades.docs) await trade.ref.delete();
    await db.collection('assets').doc(assetId).delete();
  }
  await db.collection('assets').doc(ACCOUNT_ID).delete();
}

const CSV = [
  'data;tipo;conto;isin;quantita;prezzo;commissioni;tasse;titolo;strumento;simbolo;classe;aliquota;note',
  `2026-10-01;acquisto;Fenicottero Broker;${ETF_ISIN};5;100;2;;;;;;;`,
  `2026-10-02;vendita;Fenicottero Broker;${ETF_ISIN};3;120;2;10;;;;;;`,
  `2026-10-03;acquisto;;${NEW_STOCK_ISIN};4;50;;;Ornitorinco Corp;azione;ORN.MI;;;`,
  `2026-10-04;correzione;;${NEW_BOND_ISIN};1000;0,98;;;Pellicano Bond;obbligazione;PEL.MOT;obbligazioni;12,5;fotografia`,
].join('\n');

test('investment rows of the CSV import become trades, and «Annulla import» gives them back', async ({ page }) => {
  const db = await admin();
  await remove(db);
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const plantedMeta = !(await metaRef.get()).exists;
  if (plantedMeta) {
    const now = new Date();
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await plant(db);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
    const input = page.getByLabel('Carica file CSV storico spese');
    await expect(input).toBeAttached({ timeout: 90_000 });
    await input.setInputFiles({ name: 'titoli.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') });

    // The preview counts the trades and names the two instruments it will create.
    await expect(page.getByText('2 acquisti, 1 vendita, 1 correzione di titoli')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Titoli che verranno creati in Patrimonio')).toBeVisible();
    await expect(page.getByText(/Ornitorinco Corp/)).toBeVisible();
    await expect(page.getByText(/Pellicano Bond/)).toBeVisible();

    await page.getByRole('button', { name: 'Importa 4 voci' }).click();
    const tile = page.getByLabel('Import CSV');
    await expect(tile.getByText('Importate 4 transazioni.')).toBeVisible({ timeout: 90_000 });

    // The held ETF: 10 + 5 − 3 units; the account: 1000 − (500 + 2) + (360 − 2 − 10) = 846.
    expect((await db.collection('assets').doc(ETF_ID).get()).data()?.quantity).toBe(12);
    expect((await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity).toBe(846);
    const sale = (
      await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', ETF_ID).where('type', '==', 'sell').get()
    ).docs[0]?.data();
    expect(sale).toMatchObject({ quantity: 3, pricePerUnit: 120, fees: 2, withheldTaxEur: 10 });
    expect(typeof sale?.importBatchId).toBe('string');

    const [stock] = await createdByIsin(db, NEW_STOCK_ISIN);
    expect(stock?.data()).toMatchObject({ name: 'Ornitorinco Corp', ticker: 'ORN.MI', type: 'stock', assetClass: 'equity', taxRate: 26, quantity: 4, averageCost: 50 });
    const [bond] = await createdByIsin(db, NEW_BOND_ISIN);
    expect(bond?.data()).toMatchObject({ type: 'bond', assetClass: 'bonds', taxRate: 12.5, quantity: 1000, averageCost: 0.98 });
    expect(bond?.data()?.importBatchId).toBe(sale?.importBatchId);

    // «Annulla import»: trades, balance and created instruments are gone.
    await tile.getByRole('button', { name: 'Annulla import' }).click();
    await expect(page.getByText(/Import annullato/).first()).toBeVisible({ timeout: 90_000 });
    await expect(tile.getByRole('button', { name: 'Carica file CSV' })).toBeVisible({ timeout: 90_000 });
    expect((await db.collection('assets').doc(ETF_ID).get()).data()?.quantity).toBe(10);
    expect((await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity).toBe(1000);
    const left = await db.collection('assetTransactions').where('userId', '==', UID).where('importBatchId', '==', sale?.importBatchId).get();
    expect(left.size).toBe(0);
    expect(await createdByIsin(db, NEW_STOCK_ISIN)).toHaveLength(0);
    expect(await createdByIsin(db, NEW_BOND_ISIN)).toHaveLength(0);
  } finally {
    await remove(db);
    if (plantedMeta) await metaRef.delete();
  }
});
