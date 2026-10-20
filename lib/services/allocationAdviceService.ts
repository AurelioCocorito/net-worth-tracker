import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { mapAllocationAdviceData } from '@/lib/utils/allocationAdviceDocument';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

/**
 * The client reader of the Consulente's document (2026-10-20), under the rules: the page and
 * the Allocazione header read it through `useAllocationAdvice`; every write is the Admin SDK's
 * (the run, the «applied» route), so the client never writes here.
 */
const COLLECTION = 'allocationAdvice';

export async function getAllocationAdvice(userId: string): Promise<AllocationAdviceDocument | null> {
  const snap = await getDoc(doc(db, COLLECTION, userId));
  if (!snap.exists()) return null;
  return mapAllocationAdviceData(userId, snap.data());
}
