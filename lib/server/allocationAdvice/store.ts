import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { mapAllocationAdviceData } from '@/lib/utils/allocationAdviceDocument';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

/**
 * The Consulente's ONE document per account, `allocationAdvice/{userId}` (2026-10-20):
 * written only here, with the Admin SDK (the run and the «applied» route); read by the client
 * through `lib/services/allocationAdviceService.ts` under the rules (`read: canAccess`,
 * `write: false`). Dates travel as Timestamps and come back as Dates field by field
 * (`mapAllocationAdviceData`), never through JSON (AGENTS.md § Caching).
 */

const COLLECTION = 'allocationAdvice';

export async function getAllocationAdviceAdmin(userId: string): Promise<AllocationAdviceDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(userId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data ? mapAllocationAdviceData(userId, data) : null;
}

/** Replaces the document whole — a run starts from its answers and nothing of the last run survives. */
export async function setAllocationAdviceAdmin(document: AllocationAdviceDocument): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(document.userId)
    .set(removeUndefinedDeep({ ...document, updatedAt: new Date() }));
}

/** Merges a partial onto the document; only the fields present in `patch` move. */
export async function patchAllocationAdviceAdmin(userId: string, patch: Partial<AllocationAdviceDocument>): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(userId)
    .set(removeUndefinedDeep({ ...patch, updatedAt: new Date() }), { merge: true });
}
