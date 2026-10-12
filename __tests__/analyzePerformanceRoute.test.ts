import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('server-only', () => ({}));

// The route refuses to run without a key, before it ever reaches the SDK.
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

vi.mock('@/lib/server/apiAuth', () => ({
  requireFirebaseAuth: vi.fn(async () => ({ uid: 'user-1' })),
  assertCanAccessAccount: vi.fn(async () => undefined),
  getApiAuthErrorResponse: vi.fn(() => null),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

import { POST } from '@/app/api/ai/analyze-performance/route';
import { PERFORMANCE_ANALYSIS_MODEL, SERVER_SIDE_FALLBACK_BETA } from '@/lib/constants/aiModels';

const OVERLOADED_MESSAGE = 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.';

// The envelope the API returns on a 529, exactly as the SDK receives it.
const OVERLOADED_ENVELOPE = {
  type: 'error',
  error: { type: 'overloaded_error', message: 'Overloaded' },
};

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/analyze-performance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify({
      userId: 'user-1',
      timePeriod: '1Y',
      metrics: {
        startDate: '2025-01-01T12:00:00.000Z',
        endDate: '2025-12-31T12:00:00.000Z',
        startNetWorth: 100000,
        endNetWorth: 110000,
        netCashFlow: 5000,
        roi: 5,
        cagr: 5,
        timeWeightedReturn: 5,
        moneyWeightedReturn: 5,
        volatility: 8,
        sharpeRatio: 0.6,
        maxDrawdown: -4,
        maxDrawdownDate: '2025-04-30T12:00:00.000Z',
        drawdownDuration: 2,
        recoveryTime: 1,
        numberOfMonths: 12,
        currentYield: 2,
        currentYieldNet: 1.5,
        yocGross: 2.2,
        yocNet: 1.7,
      },
    }),
  });
}

/**
 * Posts one analysis whose upstream call rejects with `failure`. The SDK client is built at
 * module load, so the rejection is injected on the shared `Beta.Messages.prototype.create` (every Sonnet call goes through the beta endpoint for the server-side fallback).
 */
async function postWithUpstreamFailure(failure: unknown) {
  vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockRejectedValue(failure);
  const response = await POST(buildRequest());
  return { status: response.status, body: await response.json() };
}

/**
 * Posts one analysis whose upstream answers with `events`, and returns the SSE payloads the
 * dialog would read, in order: each `data:` line parsed, `[DONE]` kept as the string.
 */
async function postWithUpstreamEvents(events: unknown[]) {
  async function* upstream() {
    for (const event of events) yield event;
  }
  vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(upstream() as never);
  const response = await POST(buildRequest());
  const body = await response.text();
  return body
    .split('\n\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .map((data) => (data === '[DONE]' ? data : JSON.parse(data)));
}

const textDelta = (text: string) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});

const stopWith = (stopReason: string) => ({
  type: 'message_delta',
  delta: { stop_reason: stopReason, stop_sequence: null },
  usage: { output_tokens: 10 },
});

describe('POST /api/ai/analyze-performance refusals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says the model declined, before [DONE], when it refuses with no text', async () => {
    // Sonnet 5.5 declines with HTTP 200 and `stop_reason: 'refusal'`: without the error event
    // the dialog closed on a bare [DONE] and showed an empty report as a finished one.
    const payloads = await postWithUpstreamEvents([stopWith('refusal')]);

    expect(payloads).toEqual([
      { error: 'Il modello ha rifiutato di scrivere questo report. Clicca «Rigenera» per riprovare.' },
      '[DONE]',
    ]);
  });

  it('says the report is incomplete when the model refuses after writing part of it', async () => {
    const payloads = await postWithUpstreamEvents([textDelta('Il portafoglio'), stopWith('refusal')]);

    expect(payloads).toEqual([
      { text: 'Il portafoglio' },
      {
        error:
          'Il modello ha interrotto il report rifiutandosi di continuare: il testo qui sotto è incompleto. Clicca «Rigenera» per riprovare.',
      },
      '[DONE]',
    ]);
  });

  it('says the report is incomplete when it is cut at max_tokens after some text', async () => {
    // The 16000-token ceiling covers thinking AND text: a cut closed on [DONE] read as a
    // finished report until 2026-10-12.
    const payloads = await postWithUpstreamEvents([textDelta('Il portafoglio'), stopWith('max_tokens')]);

    expect(payloads).toEqual([
      { text: 'Il portafoglio' },
      {
        error:
          'Il report ha raggiunto la lunghezza massima e si è interrotto: il testo qui sotto è incompleto. Clicca «Rigenera» per riprovare.',
      },
      '[DONE]',
    ]);
  });

  it('says the report was not written when the ceiling is spent before any text', async () => {
    const payloads = await postWithUpstreamEvents([stopWith('max_tokens')]);

    expect(payloads).toEqual([
      {
        error:
          'Il report ha esaurito lo spazio prima di essere scritto. Clicca «Rigenera» per riprovare.',
      },
      '[DONE]',
    ]);
  });

  it('adds nothing to a report that ends normally', async () => {
    const payloads = await postWithUpstreamEvents([textDelta('Il portafoglio'), stopWith('end_turn')]);

    expect(payloads).toEqual([{ text: 'Il portafoglio' }, '[DONE]']);
  });
});

describe('POST /api/ai/analyze-performance upstream failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 503 «sovraccarichi» on the real SDK overload error', async () => {
    // Regression: with sdk 0.110 the inner type lives on `error.type` and `error.error` is
    // the whole envelope, so a read of `error.error.type` saw 'error' and fell through to 500.
    const sdkError = Anthropic.APIError.generate(529, OVERLOADED_ENVELOPE, 'Overloaded', new Headers());

    const { status, body } = await postWithUpstreamFailure(sdkError);

    expect(status).toBe(503);
    expect(body).toEqual({ error: OVERLOADED_MESSAGE, retryable: true });
  });

  it('answers 503 «sovraccarichi» on the raw envelope shape the mocks throw', async () => {
    const rawEnvelope = { error: { type: 'overloaded_error', message: 'Overloaded' } };

    const { status, body } = await postWithUpstreamFailure(rawEnvelope);

    expect(status).toBe(503);
    expect(body).toEqual({ error: OVERLOADED_MESSAGE, retryable: true });
  });

  it('reports the inner body message of any other SDK failure', async () => {
    const sdkError = Anthropic.APIError.generate(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Boom' } },
      undefined,
      new Headers()
    );

    const { status, body } = await postWithUpstreamFailure(sdkError);

    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Errore nella chiamata AI: Boom', retryable: false });
  });
});

describe('POST /api/ai/analyze-performance server-side fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the beta endpoint for the default server-side fallback', async () => {
    async function* empty() {}
    const create = vi
      .spyOn(Anthropic.Beta.Messages.prototype, 'create')
      .mockResolvedValue(empty() as never);

    await (await POST(buildRequest())).text();

    expect(create.mock.calls[0][0]).toMatchObject({
      model: PERFORMANCE_ANALYSIS_MODEL,
      betas: [SERVER_SIDE_FALLBACK_BETA],
      fallbacks: 'default',
      stream: true,
    });
  });

  it('names the model serving the stream, and the one that took over after a decline', async () => {
    // A mid-stream decline keeps the text already written and continues on the fallback model:
    // the dialog prints the LAST model named, not the constant it asked for.
    const payloads = await postWithUpstreamEvents([
      { type: 'message_start', message: { model: PERFORMANCE_ANALYSIS_MODEL } },
      textDelta('Il portafoglio'),
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'fallback',
          from: { model: PERFORMANCE_ANALYSIS_MODEL },
          to: { model: 'claude-sonnet-5' },
        },
      },
      textDelta(' cresce.'),
      stopWith('end_turn'),
    ]);

    expect(payloads).toEqual([
      { model: PERFORMANCE_ANALYSIS_MODEL },
      { text: 'Il portafoglio' },
      { model: 'claude-sonnet-5' },
      { text: ' cresce.' },
      '[DONE]',
    ]);
  });
});
