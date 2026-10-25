/**
 * Tests for /api/user/backup — the caller's own account, every collection, the right scope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, store } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  // path → fields; a collection query filters the top-level docs by `userId`.
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock('server-only', () => ({}));

function docsUnder(prefix: string) {
  return [...store.entries()]
    .filter(([path]) => path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes('/'))
    .map(([path, data]) => ({ id: path.slice(prefix.length + 1), data: () => data, ref: docRef(path) }));
}

function docRef(path: string) {
  return {
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    collection: (name: string) => ({ get: async () => ({ docs: docsUnder(`${path}/${name}`) }) }),
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      where: (field: string, _op: string, value: string) => ({
        get: async () => ({ docs: docsUnder(name).filter((doc) => doc.data()?.[field] === value) }),
      }),
    }),
  },
}));

import { GET } from '@/app/api/user/backup/route';

function request(withToken = true): NextRequest {
  return new NextRequest('http://localhost/api/user/backup', {
    headers: withToken ? { authorization: 'Bearer valid-token' } : {},
  });
}

describe('/api/user/backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    verifyIdTokenMock.mockResolvedValue({ uid: 'owner-1' });
  });

  it('refuses a request without a token', async () => {
    const res = await GET(request(false));
    expect(res.status).toBe(401);
  });

  it("downloads the caller's documents and nobody else's", async () => {
    store.set('expenses/e1', { userId: 'owner-1', amount: 50, date: new Date('2026-01-15T11:00:00Z') });
    store.set('expenses/e2', { userId: 'someone-else', amount: 1120 });
    store.set('budgets/owner-1', { items: [] });
    store.set('budgets/someone-else', { items: [] });
    store.set('budgetHistory/owner-1/months/2026-01', { userId: 'owner-1' });
    store.set('assistantThreads/t1', { userId: 'owner-1' });

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="networth-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const file = await res.json();

    expect(file.ownerUid).toBe('owner-1');
    expect(file.collections.expenses).toEqual([
      {
        id: 'e1',
        data: {
          userId: 'owner-1',
          amount: 50,
          date: { __type: 'timestamp', seconds: 1768474800, nanoseconds: 0, iso: '2026-01-15T11:00:00.000Z' },
        },
      },
    ]);
    expect(file.collections.budgets).toHaveLength(1);
    // The parent document was never written; its months still travel.
    expect(file.collections.budgetHistory[0].subcollections.months[0].id).toBe('2026-01');
    expect(file.collections.budgetHistory[0].missing).toBe(true);
    expect(file.counts.budgetHistory).toBe(1);
    expect(file.collections.assistantThreads).toBeUndefined();
    expect(file.collections.assets).toEqual([]);
  });
});
