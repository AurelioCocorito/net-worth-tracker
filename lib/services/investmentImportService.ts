/**
 * Investment Import Service — the trade rows of the CSV import (2026-10-25).
 *
 * The pure plan (lib/utils/expenseImport.ts → planTradeRows) decides WHAT is written; this layer
 * writes it through the paths the app already trusts, never around them:
 * - an instrument the user does not hold is created EMPTY (quantity 0, no average cost), exactly as
 *   AssetDialog's ledger create does, stamped with the batch id;
 * - every trade goes through POST /api/asset-transactions (createAssetTransaction), which replays
 *   the instrument and refuses an impossible history with an Italian message — so a sale of more
 *   units than held stops the import at that row, and the rows before it stay (undoable).
 * Trades are sent oldest first, and within a day in the replay's own rank (buy < sell <
 * correction): the route validates each write against the trades already stored.
 *
 * The undo deletes the batch's trades newest first through the same route (each delete is
 * replayed and gives its settlement back), then the instruments the batch created that no other
 * trade uses.
 *
 * Dividend and coupon rows (2026-10-25) go through POST /api/dividends after the trades — the
 * route the dialog uses, which writes the income row of Tracciamento for a payment already made —
 * and the undo deletes them through DELETE /api/dividends/[id], which removes that row too.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { createAsset, deleteAsset } from '@/lib/services/assetService';
import {
  createAssetTransaction,
  deleteAssetTransaction,
  getAssetTransactions,
} from '@/lib/services/assetTransactionService';
import { sortTransactionsForReplay } from '@/lib/utils/assetTransactionUtils';
import { ASSET_TRANSACTIONS_COLLECTION, type AssetTransaction } from '@/types/assetTransactions';
import type {
  ImportExistingDividend,
  ImportPlan,
  ImportTradeType,
  PlannedDividendRow,
  PlannedTradeRow,
} from '@/types/expenseImport';
import type { DividendFormData } from '@/types/dividend';

const TRADE_RANK: Record<ImportTradeType, number> = { buy: 0, sell: 1, adjustment: 2 };

/** The order the trades are sent in: by date, then the replay's same-day rank, then the file's line. */
export function orderTradeRowsForCommit(rows: PlannedTradeRow[]): PlannedTradeRow[] {
  return [...rows].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      TRADE_RANK[a.tradeType] - TRADE_RANK[b.tradeType] ||
      a.line - b.line
  );
}

export interface TradeCommitResult {
  /** Trades written. */
  created: number;
  /** Instruments created. */
  instrumentsCreated: number;
  /** The row the import stopped at, with the ledger's reason; the rows before it are written. */
  failure?: { line: number; message: string };
  /** Every ISIN the import can name → its asset id (the held ones and the ones it created). */
  assetIdByIsin: Map<string, string>;
}

export async function commitTradeRows(
  ownerId: string,
  plan: Pick<ImportPlan, 'tradeRows' | 'instrumentsToCreate'>,
  importBatchId: string
): Promise<TradeCommitResult> {
  const assetIdByIsin = new Map<string, string>();
  let instrumentsCreated = 0;
  for (const instrument of plan.instrumentsToCreate) {
    const assetId = await createAsset(ownerId, {
      ticker: instrument.ticker,
      name: instrument.name,
      type: instrument.type,
      assetClass: instrument.assetClass,
      currency: instrument.currency,
      quantity: 0,
      currentPrice: instrument.currentPrice,
      taxRate: instrument.taxRate,
      autoUpdatePrice: true,
      isin: instrument.isin,
      importBatchId,
    });
    assetIdByIsin.set(instrument.isin, assetId);
    instrumentsCreated++;
  }

  let created = 0;
  for (const row of orderTradeRowsForCommit(plan.tradeRows)) {
    const assetId = row.assetId ?? assetIdByIsin.get(row.isin);
    if (!assetId) {
      return { created, instrumentsCreated, assetIdByIsin, failure: { line: row.line, message: `Titolo ${row.isin} non trovato.` } };
    }
    try {
      await createAssetTransaction(ownerId, {
        assetId,
        type: row.tradeType,
        date: row.date,
        quantity: row.quantity,
        pricePerUnit: row.pricePerUnit,
        fees: row.fees,
        linkedCashAssetId: row.linkedCashAssetId,
        withheldTaxEur: row.withheldTaxEur,
        note: row.notes,
        importBatchId,
      });
      created++;
    } catch (error) {
      return {
        created,
        instrumentsCreated,
        assetIdByIsin,
        failure: { line: row.line, message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
  return { created, instrumentsCreated, assetIdByIsin };
}

/** The registry's payload for one imported payment: gross, withholding, per-unit amount, a manual entry. */
export function buildImportedDividendData(row: PlannedDividendRow, assetId: string, importBatchId: string): DividendFormData {
  return {
    assetId,
    exDate: row.exDate,
    paymentDate: row.paymentDate,
    dividendPerShare: row.grossAmount / row.quantity,
    quantity: row.quantity,
    grossAmount: row.grossAmount,
    taxAmount: row.taxAmount,
    netAmount: row.grossAmount - row.taxAmount,
    currency: row.currency,
    dividendType: row.dividendType,
    notes: row.notes,
    isAutoGenerated: false,
    importBatchId,
  };
}

/** Write the dividend rows oldest first; stops at the first refusal, like the trades. */
export async function commitDividendRows(
  ownerId: string,
  rows: PlannedDividendRow[],
  assetIdByIsin: Map<string, string>,
  importBatchId: string
): Promise<{ created: number; failure?: { line: number; message: string } }> {
  let created = 0;
  const ordered = [...rows].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime() || a.line - b.line);
  for (const row of ordered) {
    const assetId = row.assetId ?? assetIdByIsin.get(row.isin);
    if (!assetId) return { created, failure: { line: row.line, message: `Titolo ${row.isin} non trovato.` } };
    const response = await authenticatedFetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ownerId, dividendData: buildImportedDividendData(row, assetId, importBatchId) }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { created, failure: { line: row.line, message: body.error ?? 'Registrazione del dividendo non riuscita.' } };
    }
    created++;
  }
  return { created };
}

/** The payments a batch wrote (client SDK read; the rules let the owner read the registry). */
async function getDividendIdsByImportBatch(ownerId: string, importBatchId: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'dividends'), where('userId', '==', ownerId), where('importBatchId', '==', importBatchId))
  );
  return snapshot.docs.map((d) => d.id);
}

/** Undo the dividend half of an import: each payment through the route, which deletes its income row too. */
export async function deleteDividendsByImportBatch(ownerId: string, importBatchId: string): Promise<number> {
  const ids = await getDividendIdsByImportBatch(ownerId, importBatchId);
  for (const id of ids) {
    const response = await authenticatedFetch(`/api/dividends/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Eliminazione del dividendo ${id} non riuscita.`);
    }
  }
  return ids.length;
}

const toDateValue = (v: { toDate?: () => Date } | string | Date): Date =>
  typeof v === 'object' && v !== null && 'toDate' in v && v.toDate ? v.toDate() : new Date(v as string);

/** The owner's whole dividend registry, read once with the client SDK. */
async function readDividendDocs(ownerId: string) {
  const snapshot = await getDocs(query(collection(db, 'dividends'), where('userId', '==', ownerId)));
  return snapshot.docs.map((d) => d.data());
}

/** The registry as the plan checks dividend rows against it (same instrument, same day: not twice). */
export async function getExistingDividendsForImport(ownerId: string): Promise<ImportExistingDividend[]> {
  return (await readDividendDocs(ownerId)).map((d) => ({
    assetId: d.assetId as string,
    exDate: toDateValue(d.exDate),
    paymentDate: toDateValue(d.paymentDate),
  }));
}

/** The imported payments of every batch, for «Import precedenti», shaped like the rows it lists. */
export async function getImportedDividends(
  ownerId: string
): Promise<{ importBatchId: string; date: Date; createdAt: Date; linkedCashAssetId?: string }[]> {
  return (await readDividendDocs(ownerId))
    .filter((d) => typeof d.importBatchId === 'string')
    .map((d) => ({ importBatchId: d.importBatchId as string, date: toDateValue(d.paymentDate), createdAt: toDateValue(d.createdAt) }));
}

/** The trades a batch wrote, read with the client SDK (reads are client-side, writes Admin). */
async function getTradesByImportBatch(ownerId: string, importBatchId: string): Promise<AssetTransaction[]> {
  const snapshot = await getDocs(
    query(
      collection(db, ASSET_TRANSACTIONS_COLLECTION),
      where('userId', '==', ownerId),
      where('importBatchId', '==', importBatchId)
    )
  );
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...(data as Omit<AssetTransaction, 'id' | 'date' | 'createdAt' | 'updatedAt'>),
      id: d.id,
      date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
    };
  });
}

/**
 * Undo the trade half of an import: its trades newest first (each delete replays the instrument
 * and gives its settlement back), then the instruments it created that hold no other trade.
 * Returns how many trades and instruments were removed.
 */
export async function deleteTradesByImportBatch(ownerId: string, importBatchId: string): Promise<number> {
  const trades = sortTransactionsForReplay(await getTradesByImportBatch(ownerId, importBatchId)).reverse();
  for (const trade of trades) {
    await deleteAssetTransaction(ownerId, trade.id);
  }

  const createdAssets = await getDocs(
    query(collection(db, 'assets'), where('userId', '==', ownerId), where('importBatchId', '==', importBatchId))
  );
  let removedAssets = 0;
  for (const assetDoc of createdAssets.docs) {
    const remaining = await getAssetTransactions(ownerId, assetDoc.id);
    if (remaining.length > 0) continue; // the user recorded trades of their own on it: keep it
    await deleteAsset(assetDoc.id, ownerId);
    removedAssets++;
  }
  return trades.length + removedAssets;
}

/** The imported trades of every batch, for «Import precedenti» (one read of the owner's ledger). */
export async function getImportedTrades(ownerId: string): Promise<AssetTransaction[]> {
  return (await getAssetTransactions(ownerId)).filter((t) => t.importBatchId);
}
