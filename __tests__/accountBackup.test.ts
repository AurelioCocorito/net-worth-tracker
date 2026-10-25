import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import {
  BACKUP_COLLECTIONS,
  BACKUP_EXCLUDED_COLLECTIONS,
  backupFileName,
  buildBackupFile,
  countBackupDocuments,
  encodeBackupValue,
} from '@/lib/utils/accountBackup';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every collection name the app's code and rules use, top-level and sub. */
function collectionNamesInRepo(): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /const\s+(?:[A-Z_]*COLLECTION(?:_NAME)?|COST_CENTERS|EXPENSES)\s*=\s*'([\w-]+)'/g,
    /\.collection\(\s*'([\w-]+)'/g,
    /collection\(\s*db\s*,\s*'([\w-]+)'/g,
    /doc\(\s*db\s*,\s*[A-Z_]+\s*,\s*\w+\s*,\s*'([\w-]+)'/g,
  ];
  for (const dir of ['lib', 'app', 'components', 'types']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of patterns) for (const match of text.matchAll(pattern)) names.add(match[1]);
    }
  }
  const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
  for (const match of rules.matchAll(/match\s+\/([\w-]+)\/\{/g)) {
    if (match[1] !== 'databases') names.add(match[1]);
  }
  return names;
}

describe('backup completeness', () => {
  const backedUp = new Set(BACKUP_COLLECTIONS.map((spec) => spec.name));
  const subcollections = new Set(BACKUP_COLLECTIONS.flatMap((spec) => spec.subcollections ?? []));
  // `messages` lives under `assistantThreads`, which is excluded whole.
  const excludedSub = new Set(['messages']);

  it('finds the collections it is meant to guard', () => {
    const names = collectionNamesInRepo();
    expect(names.has('expenses')).toBe(true);
    expect(names.has('monthly-snapshots')).toBe(true);
    expect(names.has('assistantThreads')).toBe(true);
    expect(names.has('months')).toBe(true);
  });

  it('every collection is either backed up or excluded with a reason', () => {
    const unclassified = [...collectionNamesInRepo()].filter(
      (name) =>
        !backedUp.has(name) &&
        !(name in BACKUP_EXCLUDED_COLLECTIONS) &&
        !subcollections.has(name) &&
        !excludedSub.has(name)
    );
    expect(unclassified).toEqual([]);
  });

  it('no collection is both backed up and excluded', () => {
    expect(Object.keys(BACKUP_EXCLUDED_COLLECTIONS).filter((name) => backedUp.has(name))).toEqual([]);
  });

  it('keeps the data the owner cannot rebuild', () => {
    for (const name of ['monthly-snapshots', 'assetTransactions', 'expenses', 'expenseCategories', 'dividends', 'pensionContributions', 'budgetHistory']) {
      expect(backedUp.has(name)).toBe(true);
    }
  });
});

describe('encodeBackupValue', () => {
  it('writes a Timestamp with its exact time', () => {
    const encoded = encodeBackupValue(new Timestamp(1767268800, 500));
    expect(encoded).toEqual({ __type: 'timestamp', seconds: 1767268800, nanoseconds: 500, iso: '2026-01-01T12:00:00.000Z' });
  });

  it('writes a Date as a timestamp', () => {
    expect(encodeBackupValue(new Date('2026-01-01T12:00:00.250Z'))).toEqual({
      __type: 'timestamp',
      seconds: 1767268800,
      nanoseconds: 250_000_000,
      iso: '2026-01-01T12:00:00.250Z',
    });
  });

  it('tells a GeoPoint from a map with the same field names', () => {
    expect(encodeBackupValue(new GeoPoint(45, 9))).toEqual({ __type: 'geopoint', latitude: 45, longitude: 9 });
    expect(encodeBackupValue({ latitude: 45, longitude: 9 })).toEqual({ latitude: 45, longitude: 9 });
  });

  it('writes a reference by its path', () => {
    const ref = { id: 'a1', path: 'assets/a1', isEqual: () => false };
    expect(encodeBackupValue(ref)).toEqual({ __type: 'reference', path: 'assets/a1' });
  });

  it('walks maps and arrays, drops undefined fields, keeps nulls', () => {
    const encoded = encodeBackupValue({
      amount: 2500,
      note: null,
      gone: undefined,
      byAsset: [{ ticker: 'ABC', date: new Timestamp(0, 0) }],
    });
    expect(encoded).toEqual({
      amount: 2500,
      note: null,
      byAsset: [{ ticker: 'ABC', date: { __type: 'timestamp', seconds: 0, nanoseconds: 0, iso: '1970-01-01T00:00:00.000Z' } }],
    });
  });

  it('keeps the numbers JSON cannot hold', () => {
    expect(encodeBackupValue(Number.NaN)).toEqual({ __type: 'number', value: 'NaN' });
    expect(encodeBackupValue(-Infinity)).toEqual({ __type: 'number', value: '-Infinity' });
  });

  it('writes bytes in base64', () => {
    expect(encodeBackupValue(new Uint8Array([1, 2, 3]))).toEqual({ __type: 'bytes', base64: 'AQID' });
  });
});

describe('buildBackupFile', () => {
  it('counts documents with their subcollections and lists the exclusions', () => {
    const file = buildBackupFile(
      'owner-1',
      {
        expenses: [
          { id: 'e1', data: { amount: 50 } },
          { id: 'e2', data: { amount: 1120 } },
        ],
        budgetHistory: [{ id: 'owner-1', data: {}, missing: true, subcollections: { months: [{ id: '2026-01', data: {} }, { id: '2026-02', data: {} }] } }],
      },
      new Date('2026-10-25T10:00:00Z')
    );
    expect(file.format).toBe('net-worth-tracker-backup');
    expect(file.counts.expenses).toBe(2);
    expect(file.counts.budgetHistory).toBe(2);
    expect(file.counts.assets).toBe(0);
    expect(file.excluded.map((entry) => entry.collection)).toContain('assistantThreads');
    expect(countBackupDocuments([])).toBe(0);
  });

  it('names the file on the Italian day', () => {
    expect(backupFileName(new Date('2026-10-24T22:30:00Z'))).toBe('networth-backup-2026-10-25.json');
  });
});
