/**
 * REVENUE SERVICE — the `revenueEntries` register of Cashflow › Fatturati.
 *
 * A top-level collection with a `userId` field, like `costCenters` (firestore.rules: the owner or
 * a delegated member). The document id is DERIVED from (owner, month, client) — `revenueEntryId`
 * — so a save of a pair already recorded overwrites it: the form's «Salva» and the CSV import are
 * the same upsert, and a file imported twice does not double its months.
 *
 * The read has no `orderBy`: a `where` + `orderBy` pair needs a composite index, and the register
 * is small (twelve rows a year per client), so it is sorted in memory.
 */

import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { RevenueEntry, RevenueEntryInput } from '@/types/revenue';
import { toDate } from '@/lib/utils/dateHelpers';
import { revenueEntryId } from '@/lib/utils/revenueStats';
import { roundToCents } from '@/lib/utils/cents';

const REVENUE_ENTRIES = 'revenueEntries';
/** Firestore's ceiling is 500 writes per batch. */
const BATCH_SIZE = 400;

function docToRevenueEntry(id: string, data: Record<string, unknown>): RevenueEntry {
  return {
    id,
    userId: data.userId as string,
    month: data.month as string,
    client: (data.client as string | undefined) ?? '',
    amount: Number(data.amount ?? 0),
    note: (data.note as string | null | undefined) ?? undefined,
    createdAt: data.createdAt ? toDate(data.createdAt as never) : new Date(0),
    updatedAt: data.updatedAt ? toDate(data.updatedAt as never) : new Date(0),
  };
}

/** The owner's register, oldest month first, then by client. */
export async function getRevenueEntries(userId: string): Promise<RevenueEntry[]> {
  const snap = await getDocs(query(collection(db, REVENUE_ENTRIES), where('userId', '==', userId)));
  return snap.docs
    .map((d) => docToRevenueEntry(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.month.localeCompare(b.month) || a.client.localeCompare(b.client, 'it'));
}

function payloadOf(userId: string, input: RevenueEntryInput) {
  return {
    userId,
    month: input.month,
    client: input.client.trim().replace(/\s+/g, ' '),
    amount: roundToCents(input.amount),
    note: input.note?.trim() || null,
    // `createdAt` is rewritten on an overwrite too: the register never shows it, and keeping it
    // would cost a read before every write.
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Saves one (month, client) figure, replacing the one already recorded for the pair. */
export async function saveRevenueEntry(userId: string, input: RevenueEntryInput): Promise<void> {
  await setDoc(doc(db, REVENUE_ENTRIES, revenueEntryId(userId, input.month, input.client)), payloadOf(userId, input));
}

/**
 * Saves an edited row. When the edit moved it to another (month, client), the old document is
 * removed in the same batch, so the register never holds the figure twice.
 */
export async function updateRevenueEntry(userId: string, previousId: string, input: RevenueEntryInput): Promise<void> {
  const nextId = revenueEntryId(userId, input.month, input.client);
  const batch = writeBatch(db);
  batch.set(doc(db, REVENUE_ENTRIES, nextId), payloadOf(userId, input));
  if (previousId !== nextId) batch.delete(doc(db, REVENUE_ENTRIES, previousId));
  await batch.commit();
}

/** The CSV import: one upsert per row, in batches. */
export async function importRevenueEntries(userId: string, rows: readonly RevenueEntryInput[]): Promise<number> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const row of rows.slice(start, start + BATCH_SIZE)) {
      batch.set(doc(db, REVENUE_ENTRIES, revenueEntryId(userId, row.month, row.client)), payloadOf(userId, row));
    }
    await batch.commit();
  }
  return rows.length;
}

export async function deleteRevenueEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, REVENUE_ENTRIES, id));
}
