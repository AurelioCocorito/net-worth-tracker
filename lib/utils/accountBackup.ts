/**
 * The account backup (2026-10-25): WHAT goes in the file and HOW a Firestore value is written.
 *
 * The file is everything the owner entered, read with the Admin SDK by `/api/user/backup`
 * (lib/server/accountBackupService.ts) and downloaded from Impostazioni › Condivisione. It is the
 * one source a lost account is rebuilt from, so it keeps each document's id (the links between
 * accounts, instruments and rows travel by id) and each value's Firestore type (a Timestamp stays
 * a Timestamp, never a bare string).
 *
 * Every collection the app names is either BACKED UP or EXCLUDED with its reason: the test
 * `__tests__/accountBackup.test.ts` scans the code and the rules for collection names and fails on
 * one that is neither — a new collection never silently misses the backup.
 */

import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export const BACKUP_FORMAT = 'net-worth-tracker-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** How a collection's documents belong to the account. */
export type BackupScope =
  /** One document per account, its id the owner's uid (`budgets/{uid}`). */
  | 'docId'
  /** Many documents, each carrying `userId` = the owner's uid. */
  | 'userIdField';

export interface BackupCollectionSpec {
  name: string;
  scope: BackupScope;
  /** Subcollections read under each of the account's documents (`budgetHistory/{uid}/months`). */
  subcollections?: readonly string[];
}

export const BACKUP_COLLECTIONS: readonly BackupCollectionSpec[] = [
  { name: 'users', scope: 'docId' },
  { name: 'userPreferences', scope: 'docId' },
  { name: 'account-access', scope: 'docId' },
  { name: 'assets', scope: 'userIdField' },
  { name: 'assetTransactions', scope: 'userIdField' },
  { name: 'assetTransactionsMeta', scope: 'docId' },
  { name: 'monthly-snapshots', scope: 'userIdField' },
  { name: 'expenses', scope: 'userIdField' },
  { name: 'expenseCategories', scope: 'userIdField' },
  { name: 'dividends', scope: 'userIdField' },
  { name: 'pensionContributions', scope: 'userIdField' },
  { name: 'costCenters', scope: 'userIdField' },
  { name: 'budgets', scope: 'docId' },
  { name: 'budgetHistory', scope: 'docId', subcollections: ['months'] },
  { name: 'goalBasedInvesting', scope: 'docId' },
  { name: 'assetAllocationTargets', scope: 'docId' },
  { name: 'allocationAdvice', scope: 'docId' },
  { name: 'hall-of-fame', scope: 'docId' },
  { name: 'assistantMemory', scope: 'docId' },
];

/** Collections left out, each with the reason written into the file. */
export const BACKUP_EXCLUDED_COLLECTIONS: Readonly<Record<string, string>> = {
  assistantThreads: "Conversazioni con l'Assistente AI: escluse per scelta del proprietario (2026-10-25).",
  'performance-cache': 'Rendimenti calcolati: ricalcolati dagli snapshot e dalle operazioni.',
  dashboardOverviewSummaries: 'Riepilogo della Panoramica: ricalcolato dal server.',
  'instrument-profile-cache': 'Profili degli strumenti scaricati dal web: comuni a tutti, riscaricati.',
  'benchmark-cache': 'Serie dei benchmark: comuni a tutti, riscaricate.',
  'fx-rate-cache': 'Tassi di cambio: comuni a tutti, riscaricati.',
  'ecb-rate-cache': 'Tasso BCE: comune a tutti, riscaricato.',
};

export interface BackupDocument {
  id: string;
  data: Record<string, unknown>;
  /** Subcollection name → its documents. */
  subcollections?: Record<string, BackupDocument[]>;
  /** The document itself was never written, only its subcollections: a restore writes none. */
  missing?: true;
}

export interface AccountBackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  ownerUid: string;
  /** Collection → documents counted, subcollections included. */
  counts: Record<string, number>;
  collections: Record<string, BackupDocument[]>;
  excluded: { collection: string; reason: string }[];
}

/** Firestore types JSON cannot carry, written as `{ "__type": … }` objects. */
export type EncodedSpecial =
  | { __type: 'timestamp'; seconds: number; nanoseconds: number; iso: string }
  | { __type: 'geopoint'; latitude: number; longitude: number }
  | { __type: 'reference'; path: string }
  | { __type: 'bytes'; base64: string }
  | { __type: 'number'; value: 'NaN' | 'Infinity' | '-Infinity' };

type Duck = Record<string, unknown>;

/**
 * Data read from Firestore is plain maps, arrays and scalars — EXCEPT the special types, which are
 * class instances carrying methods. A function-valued property is therefore what tells a
 * Timestamp, a GeoPoint or a DocumentReference apart from a map that happens to share their field
 * names (no import of the Admin SDK here: the module stays pure and testable).
 */
function isTimestampLike(value: Duck): boolean {
  return typeof value.toDate === 'function' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number';
}

function isGeoPointLike(value: Duck): boolean {
  return typeof value.isEqual === 'function' && typeof value.latitude === 'number' && typeof value.longitude === 'number';
}

function isReferenceLike(value: Duck): boolean {
  return typeof value.isEqual === 'function' && typeof value.path === 'string' && typeof value.id === 'string';
}

function encodeNumber(value: number): number | EncodedSpecial {
  if (Number.isFinite(value)) return value;
  return { __type: 'number', value: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
}

/** One Firestore value → its JSON-safe form, recursively. `undefined` fields are dropped. */
export function encodeBackupValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'number') return encodeNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    const seconds = Math.floor(ms / 1000);
    return { __type: 'timestamp', seconds, nanoseconds: (ms - seconds * 1000) * 1e6, iso: value.toISOString() };
  }
  if (value instanceof Uint8Array) {
    return { __type: 'bytes', base64: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (typeof value === 'object') {
    const duck = value as Duck;
    if (isTimestampLike(duck)) {
      const date = (duck.toDate as () => Date)();
      return { __type: 'timestamp', seconds: duck.seconds, nanoseconds: duck.nanoseconds, iso: date.toISOString() };
    }
    if (isReferenceLike(duck)) return { __type: 'reference', path: duck.path as string };
    if (isGeoPointLike(duck)) return { __type: 'geopoint', latitude: duck.latitude, longitude: duck.longitude };
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(duck)) {
      if (field !== undefined) out[key] = encodeBackupValue(field);
    }
    return out;
  }
  // bigint, symbol, function: never stored by Firestore.
  return null;
}

/** A document's fields, encoded. */
export function encodeBackupData(data: Record<string, unknown>): Record<string, unknown> {
  return encodeBackupValue(data) as Record<string, unknown>;
}

/** Documents in a collection, subcollections included. */
export function countBackupDocuments(documents: readonly BackupDocument[]): number {
  return documents.reduce(
    (total, doc) =>
      total + (doc.missing ? 0 : 1) + Object.values(doc.subcollections ?? {}).reduce((sub, docs) => sub + countBackupDocuments(docs), 0),
    0
  );
}

/** Assembles the file around the collections read. */
export function buildBackupFile(
  ownerUid: string,
  collections: Record<string, BackupDocument[]>,
  createdAt: Date
): AccountBackupFile {
  const counts: Record<string, number> = {};
  for (const spec of BACKUP_COLLECTIONS) counts[spec.name] = countBackupDocuments(collections[spec.name] ?? []);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    ownerUid,
    counts,
    collections,
    excluded: Object.entries(BACKUP_EXCLUDED_COLLECTIONS).map(([collection, reason]) => ({ collection, reason })),
  };
}

/** `networth-backup-2026-10-25.json`, dated on the Italian day. */
export function backupFileName(createdAt: Date): string {
  return `networth-backup-${getItalyDateIso(createdAt)}.json`;
}
