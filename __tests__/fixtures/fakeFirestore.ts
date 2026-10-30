/**
 * An in-memory stand-in for the client `firebase/firestore` module, for the suites that must see
 * what a save leaves behind — not only what it called. A transaction or a batch stages its writes
 * and applies them only at commit; `failNextCommit()` makes the next commit throw (code
 * `unavailable`, as a lost connection does) and apply nothing, which is what «all or nothing»
 * means. A `tx.get` after a write throws, as Firestore does (AGENTS.md § Firestore Writes).
 *
 * Usage — the factory and the suite import the same module, so they share `fakeFirestore`:
 *   import { fakeFirestore as fake } from './fixtures/fakeFirestore';
 *   vi.mock('firebase/firestore', async () => (await import('./fixtures/fakeFirestore')).fakeFirestore.module);
 */

export const DELETE_FIELD = '__deleteField__';

type Data = Record<string, unknown>;
interface Ref {
  path: string;
  id: string;
  collectionName: string;
}
interface Constraint {
  field: string;
  op: string;
  value: unknown;
}
type Op = { kind: 'set'; ref: Ref; data: Data } | { kind: 'update'; ref: Ref; data: Data } | { kind: 'delete'; ref: Ref };

export function createFakeFirestore() {
  const store = new Map<string, Data>();
  let minted = 0;
  let failures = 0;
  let commits = 0;

  const fakeTimestamp = (date: Date) => ({ toDate: () => date, __date: date });

  function snapshot(ref: Ref) {
    const data = store.get(ref.path);
    return { id: ref.id, ref, exists: () => data !== undefined, data: () => (data ? { ...data } : undefined) };
  }

  function apply(ops: Op[]) {
    commits += 1;
    if (failures > 0) {
      failures -= 1;
      throw Object.assign(new Error('Failed to commit: the client is offline'), { code: 'unavailable' });
    }
    // Validate first: an update on a missing document fails the whole commit.
    for (const op of ops) {
      if (op.kind === 'update' && !store.has(op.ref.path)) {
        throw Object.assign(new Error(`No document to update: ${op.ref.path}`), { code: 'not-found' });
      }
    }
    for (const op of ops) {
      if (op.kind === 'delete') store.delete(op.ref.path);
      else if (op.kind === 'set') store.set(op.ref.path, stripDeletes({ ...op.data }));
      else store.set(op.ref.path, stripDeletes({ ...store.get(op.ref.path)!, ...op.data }));
    }
  }

  /** A cleared field goes; a `Date` comes back as a Timestamp, as from Firestore. */
  function stripDeletes(data: Data): Data {
    for (const [key, value] of Object.entries(data)) {
      if (value === DELETE_FIELD) delete data[key];
      else if (value instanceof Date) data[key] = fakeTimestamp(value);
    }
    return data;
  }

  function stager() {
    const ops: Op[] = [];
    return {
      ops,
      set: (ref: Ref, data: Data) => void ops.push({ kind: 'set', ref, data }),
      update: (ref: Ref, data: Data) => void ops.push({ kind: 'update', ref, data }),
      delete: (ref: Ref) => void ops.push({ kind: 'delete', ref }),
    };
  }

  const firestoreModule = {
    collection: (_db: unknown, name: string) => ({ collectionName: name }),
    doc: (parent: { collectionName?: string }, name?: string, id?: string): Ref => {
      if (typeof name === 'string') return { path: `${name}/${id}`, id: id!, collectionName: name };
      const newId = `minted-${++minted}`;
      return { path: `${parent.collectionName}/${newId}`, id: newId, collectionName: parent.collectionName! };
    },
    getDoc: async (ref: Ref) => snapshot(ref),
    getDocs: async (q: { ref: { collectionName: string }; constraints: Constraint[] }) => {
      const prefix = `${q.ref.collectionName}/`;
      const docs = [...store.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => {
          const id = path.slice(prefix.length);
          return snapshot({ path, id, collectionName: q.ref.collectionName });
        })
        .filter((snap) =>
          q.constraints.every((c) => {
            const value = (snap.data() as Data)[c.field];
            if (c.op === '==') return value === c.value;
            if (c.op === 'in') return (c.value as unknown[]).includes(value);
            return true;
          })
        );
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: (field: string) => ({ field, op: 'orderBy', value: undefined }),
    limit: (n: number) => ({ field: '', op: 'limit', value: n }),
    addDoc: async (parent: { collectionName: string }, data: Data) => {
      const ref = firestoreModule.doc(parent);
      apply([{ kind: 'set', ref, data }]);
      return ref;
    },
    updateDoc: async (ref: Ref, data: Data) => apply([{ kind: 'update', ref, data }]),
    deleteDoc: async (ref: Ref) => apply([{ kind: 'delete', ref }]),
    writeBatch: () => {
      const staged = stager();
      return { ...staged, commit: async () => apply(staged.ops) };
    },
    runTransaction: async <T>(_db: unknown, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const staged = stager();
      const tx = {
        get: async (ref: Ref) => {
          if (staged.ops.length > 0) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          return snapshot(ref);
        },
        set: staged.set,
        update: staged.update,
        delete: staged.delete,
      };
      const result = await fn(tx);
      apply(staged.ops);
      return result;
    },
    deleteField: () => DELETE_FIELD,
    Timestamp: { now: () => fakeTimestamp(new Date()), fromDate: fakeTimestamp },
  };

  return {
    module: firestoreModule,
    store,
    /** The next commit (batch, transaction or single write) throws and applies nothing. */
    failNextCommit: () => {
      failures += 1;
    },
    commitCount: () => commits,
    reset: () => {
      store.clear();
      minted = 0;
      failures = 0;
      commits = 0;
    },
    put: (path: string, data: Data) => store.set(path, data),
    get: (path: string) => store.get(path),
    /** The documents of a collection, by id. */
    all: (collectionName: string) =>
      new Map([...store.entries()].filter(([path]) => path.startsWith(`${collectionName}/`)).map(([path, data]) => [path.slice(collectionName.length + 1), data])),
    timestamp: fakeTimestamp,
  };
}

/** The one instance a suite shares with its `vi.mock` factory. */
export const fakeFirestore = createFakeFirestore();
