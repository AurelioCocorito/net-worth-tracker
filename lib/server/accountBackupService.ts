import 'server-only';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  BACKUP_COLLECTIONS,
  buildBackupFile,
  encodeBackupData,
  type AccountBackupFile,
  type BackupCollectionSpec,
  type BackupDocument,
} from '@/lib/utils/accountBackup';

/**
 * Reads the account's documents for the backup file (lib/utils/accountBackup.ts says which).
 *
 * Admin SDK on purpose: several collections are server-written (`assetTransactions`,
 * `budgetHistory`, `allocationAdvice`, `assistantMemory`) and the rules let the client read some
 * of them only in part. A `docId` collection whose document does not exist still has its
 * subcollections read: `budgetHistory/{uid}` is never written itself, only its `months`.
 */

async function readSubcollections(ref: DocumentReference, names: readonly string[] | undefined) {
  if (!names?.length) return undefined;
  const entries = await Promise.all(
    names.map(async (name) => {
      const snap = await ref.collection(name).get();
      const docs: BackupDocument[] = snap.docs.map((doc) => ({ id: doc.id, data: encodeBackupData(doc.data()) }));
      return [name, docs] as const;
    })
  );
  const present = entries.filter(([, docs]) => docs.length > 0);
  return present.length > 0 ? Object.fromEntries(present) : undefined;
}

async function readCollection(spec: BackupCollectionSpec, ownerUid: string): Promise<BackupDocument[]> {
  if (spec.scope === 'docId') {
    const ref = adminDb.collection(spec.name).doc(ownerUid);
    const [snap, subcollections] = await Promise.all([ref.get(), readSubcollections(ref, spec.subcollections)]);
    if (!snap.exists && !subcollections) return [];
    return [
      {
        id: ownerUid,
        data: encodeBackupData(snap.data() ?? {}),
        ...(subcollections && { subcollections }),
        ...(!snap.exists && { missing: true as const }),
      },
    ];
  }

  const snap = await adminDb.collection(spec.name).where('userId', '==', ownerUid).get();
  return Promise.all(
    snap.docs.map(async (doc) => {
      const subcollections = await readSubcollections(doc.ref, spec.subcollections);
      return { id: doc.id, data: encodeBackupData(doc.data()), ...(subcollections && { subcollections }) };
    })
  );
}

export async function buildAccountBackup(ownerUid: string, now: Date = new Date()): Promise<AccountBackupFile> {
  const read = await Promise.all(
    BACKUP_COLLECTIONS.map(async (spec) => [spec.name, await readCollection(spec, ownerUid)] as const)
  );
  return buildBackupFile(ownerUid, Object.fromEntries(read), now);
}
