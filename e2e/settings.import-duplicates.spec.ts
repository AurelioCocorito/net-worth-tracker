/**
 * Impostazioni › Spese · Import CSV — rows already in the data and «saldo» rows (2026-10-25).
 * Desktop 1440.
 *
 * What only the browser against the emulators can prove: a file whose rows carry a «codice» is
 * written with it (`importRowCode`), a «saldo» row moves its account to the statement's balance
 * once the other rows are written and stamps the delta on the account, the SAME file loaded again
 * sets every row aside in the preview and finds the account already aligned, and «Annulla import»
 * from «Import precedenti» gives back the rows and the delta. Every outcome is asserted on Firestore
 * (Admin SDK). The matching rules live in __tests__/expenseImport.test.ts.
 *
 * The test plants its own account (a decoy name absent from the seed) and removes what it and the
 * app created in `finally` — data-only, never a re-seed (doc/guide/e2e-emulatori.md).
 */

import { test, expect } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ACCOUNT_ID = 'e2e-importdup-ghepardo';
const CATEGORIES = ['Ghepardo Spese', 'Ghepardo Entrate'];

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function remove(db: FirebaseFirestore.Firestore) {
  const rows = await db.collection('expenses').where('userId', '==', UID).where('linkedCashAssetId', '==', ACCOUNT_ID).get();
  for (const row of rows.docs) await row.ref.delete();
  for (const name of CATEGORIES) {
    const cats = await db.collection('expenseCategories').where('userId', '==', UID).where('name', '==', name).get();
    for (const c of cats.docs) await c.ref.delete();
  }
  await db.collection('assets').doc(ACCOUNT_ID).delete();
}

// 1000 € today; the file takes 100 € and brings 50 €: 950 €. The statement says 1.200 € at 07/10.
const CSV = [
  'data;importo;tipo;categoria;sottocategoria;note;valuta;conto;codice',
  '2026-10-05;100,00;variable;Ghepardo Spese;;Ghepardo · spesa;EUR;Ghepardo Conto;ghepardo-001',
  '2026-10-06;50,00;income;Ghepardo Entrate;;Ghepardo · rimborso;EUR;Ghepardo Conto;ghepardo-002',
  '2026-10-07;1200,00;saldo;;;;EUR;Ghepardo Conto;',
].join('\n');

test('a file loaded twice writes nothing twice, and «saldo» aligns the account to the statement', async ({ page }) => {
  const db = await admin();
  await remove(db);
  const now = new Date();
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: '', name: 'Ghepardo Conto', type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: 1000, currentPrice: 1, isLiquid: true, autoUpdatePrice: false, createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
    const tile = page.getByLabel('Import CSV');
    const input = page.getByLabel('Carica file CSV storico spese');
    await expect(input).toBeAttached({ timeout: 90_000 });
    const upload = () => input.setInputFiles({ name: 'ghepardo.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') });

    // First load: the preview states the alignment — app 950 €, statement 1.200 €, +250 €.
    await upload();
    await expect(tile.getByText("Saldi allineati all'estratto")).toBeVisible({ timeout: 30_000 });
    await expect(tile.getByText(/Ghepardo Conto al 07\/10\/2026/)).toContainText('correzione +');
    await tile.getByRole('button', { name: 'Importa 3 voci' }).click();
    await expect(tile.getByText('Importate 2 transazioni.')).toBeVisible({ timeout: 90_000 });
    await expect(tile.getByText('Un conto portato al saldo dell’estratto.')).toBeVisible();

    const account = (await db.collection('assets').doc(ACCOUNT_ID).get()).data();
    expect(account?.quantity).toBe(1200);
    expect(account?.importBalanceCorrections).toEqual([
      expect.objectContaining({ delta: 250, date: '2026-10-07', statementBalance: 1200 }),
    ]);
    const written = await db.collection('expenses').where('userId', '==', UID).where('linkedCashAssetId', '==', ACCOUNT_ID).get();
    expect(written.docs.map((d) => d.data().importRowCode).sort()).toEqual(['ghepardo-001', 'ghepardo-002']);

    // Second load of the SAME file: both rows set aside, the account already aligned.
    await tile.getByRole('button', { name: 'Importa un altro file' }).click();
    await upload();
    await expect(tile.getByText('2 righe già presenti nei dati: non verranno importate')).toBeVisible({ timeout: 30_000 });
    await expect(tile.getByText(/già allineato, nessuna correzione/)).toBeVisible();
    await expect(tile.getByRole('button', { name: 'Importa 1 voci' })).toBeVisible();
    await tile.getByRole('button', { name: 'Annulla', exact: true }).click();

    // «Import precedenti»: the undo gives back the two rows and the 250 €.
    await tile.getByText('Import precedenti').click();
    const undo = tile.getByRole('button', { name: 'Annulla import' }).first();
    await expect(undo).toBeVisible({ timeout: 30_000 });
    await undo.click();
    await tile.getByRole('button', { name: /Conferma: elimina/ }).click();
    await expect(page.getByText(/Import annullato/).first()).toBeVisible({ timeout: 90_000 });
    const after = (await db.collection('assets').doc(ACCOUNT_ID).get()).data();
    expect(after?.quantity).toBe(1000);
    expect(after?.importBalanceCorrections).toEqual([]);
    const left = await db.collection('expenses').where('userId', '==', UID).where('linkedCashAssetId', '==', ACCOUNT_ID).get();
    expect(left.size).toBe(0);
  } finally {
    await remove(db);
  }
});
