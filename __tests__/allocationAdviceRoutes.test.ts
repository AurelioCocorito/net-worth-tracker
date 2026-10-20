/**
 * The Consulente's routes: `POST /api/allocation-advice/run` (auth, the key, the answers'
 * schema, the SSE events) and `POST /api/allocation-advice/applied` (auth, the schema, no
 * report → 409, the patch).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, accountAccessDocGetMock, runMock, getAdviceMock, patchAdviceMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  accountAccessDocGetMock: vi.fn(),
  runMock: vi.fn(),
  getAdviceMock: vi.fn(),
  patchAdviceMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
// The run module reaches the client SDK through the context service: mocked away at import.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn(() => ({ allowed: true })) }));
vi.mock('@/lib/server/rateLimit', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'account-access') return { doc: vi.fn(() => ({ get: accountAccessDocGetMock })) };
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));
vi.mock('@/lib/server/allocationAdvice/run', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/allocationAdvice/run')>('@/lib/server/allocationAdvice/run');
  return { runAllocationAdviceStage: runMock, AllocationAdviceStageError: actual.AllocationAdviceStageError };
});
vi.mock('@/lib/server/allocationAdvice/store', () => ({
  getAllocationAdviceAdmin: getAdviceMock,
  patchAllocationAdviceAdmin: patchAdviceMock,
}));

import { POST as runRoute } from '@/app/api/allocation-advice/run/route';
import { POST as appliedRoute } from '@/app/api/allocation-advice/applied/route';
import { AllocationAdviceStageError } from '@/lib/server/allocationAdvice/run';

const ANSWERS = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'media',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: '',
  distributionPolicy: 'accumulazione',
  goals: [],
  goalsReflectReality: true,
  newGoalsNote: '',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'frozen',
  keepAssets: [],
  avoid: '',
  esg: false,
  notes: '',
};

function post(url: string, body: unknown, authorized = true): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer valid-token' } : {}) },
    body: JSON.stringify(body),
  });
}

async function readSse(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

describe('POST /api/allocation-advice/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  });

  it('refuses an unauthenticated call and a call on another account', async () => {
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }, false))).status).toBe(401);
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-2', answers: ANSWERS }))).status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('answers 503 without the key and 400 on answers the schema refuses', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }))).status).toBe(503);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: { ...ANSWERS, age: 5 } }))).status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('streams the stages and the document on success', async () => {
    runMock.mockImplementation(async ({ onStage }: { onStage: (stage: string) => void }) => {
      onStage('context');
      onStage('strategy');
      return { userId: 'user-1', status: 'ready' };
    });
    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const events = await readSse(response);
    expect(events).toEqual([
      { type: 'stage', stage: 'context' },
      { type: 'stage', stage: 'strategy' },
      { type: 'done', document: { userId: 'user-1', status: 'ready' } },
    ]);
    // No stage named is the first one, and the first one counts against the limit.
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'strategy', answers: ANSWERS });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  // ── One request per stage (Vercel Hobby's 300 s, 2026-10-20) ────────────────────────────

  it('runs the stage the body names without answers, outside the rate limit, and refuses one it does not know', async () => {
    runMock.mockResolvedValue({ userId: 'user-1', status: 'running', stage: 'instruments' });
    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'instruments' }));
    expect(response.status).toBe(200);
    const events = await readSse(response);
    expect(events.at(-1)).toMatchObject({ type: 'done', document: { stage: 'instruments' } });
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'instruments', answers: undefined });
    expect(rateLimitMock).not.toHaveBeenCalled();

    const review = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'review' }));
    expect(review.status).toBe(200);
    expect(runMock.mock.calls[1][0]).toMatchObject({ stage: 'review' });

    const unknown = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'context' }));
    expect(unknown.status).toBe(400);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('revise needs the request, passes it on, and counts against the limit like a run', async () => {
    runMock.mockResolvedValue({ userId: 'user-1', status: 'ready' });
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise' }))).status).toBe(400);
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: '   ' }))).status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();

    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: ' solo bond singoli ' }));
    expect(response.status).toBe(200);
    await readSse(response);
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'revise', request: 'solo bond singoli' });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it('streams a stage failure as an error event in the product\'s words', async () => {
    runMock.mockRejectedValue(new AllocationAdviceStageError('instruments', 'Il servizio AI non ha risposto.', true));
    const events = await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS })));
    expect(events).toEqual([{ type: 'error', error: 'Il servizio AI non ha risposto.', retryable: true }]);
  });
});

describe('POST /api/allocation-advice/applied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    patchAdviceMock.mockResolvedValue(undefined);
  });

  const applied = { targetsWritten: true, rolesChanged: 1, goalsWritten: 2 };

  it('refuses a bad body and a document with no report', async () => {
    expect((await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied: { targetsWritten: 'yes' } }))).status).toBe(400);
    getAdviceMock.mockResolvedValue(null);
    expect((await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied }))).status).toBe(409);
    expect(patchAdviceMock).not.toHaveBeenCalled();
  });

  it('marks the document applied with what was written', async () => {
    getAdviceMock.mockResolvedValue({ userId: 'user-1', status: 'ready', report: { markdown: 'x', proposal: null } });
    const response = await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied }));
    expect(response.status).toBe(200);
    expect(patchAdviceMock).toHaveBeenCalledWith('user-1', { status: 'applied', applied: expect.objectContaining({ ...applied, at: expect.any(Date) }) });
  });
});
