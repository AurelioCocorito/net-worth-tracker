/**
 * The client invalidation of the Panoramica's summary never makes a save wait (2026-10-28): the
 * call returns before its POST answers, calls for one owner while a POST is in flight coalesce
 * into ONE trailing POST, and the overview read waits for the queue (or for its ceiling) before it
 * asks the server — or it would get the summary from before the save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { calls, gates } = vi.hoisted(() => ({
  calls: [] as { ownerId: string; reason: string; keepalive: boolean | undefined }[],
  gates: [] as (() => void)[],
}));

vi.mock('@/lib/utils/authFetch', () => ({
  authenticatedFetch: vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { ownerId: string; reason: string };
    calls.push({ ...body, keepalive: init.keepalive });
    // Each POST hangs until the test opens its gate: the network, held.
    return new Promise<Response>((resolve) => gates.push(() => resolve(new Response('{"ok":true}'))));
  }),
}));

import {
  invalidateDashboardOverviewSummary,
  settleDashboardOverviewInvalidations,
  OVERVIEW_INVALIDATION_WAIT_MS,
} from '@/lib/services/dashboardOverviewInvalidation';
import { authenticatedFetch } from '@/lib/utils/authFetch';

/** Let every pending microtask and promise callback run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Answer the POSTs in flight, one by one, until the queue is empty. */
async function drainAll() {
  while (gates.length > 0) {
    gates.shift()!();
    await flush();
  }
}

beforeEach(() => {
  calls.length = 0;
  gates.length = 0;
  vi.mocked(authenticatedFetch).mockClear();
});

afterEach(async () => {
  vi.useRealTimers();
  await drainAll();
});

describe('invalidateDashboardOverviewSummary', () => {
  it('returns before its POST answers', async () => {
    let returned = false;
    await invalidateDashboardOverviewSummary('owner-a', 'expense_updated').then(() => { returned = true; });
    expect(returned).toBe(true);
    expect(calls).toHaveLength(1);
    expect(gates).toHaveLength(1); // still in flight
    expect(calls[0]).toEqual({ ownerId: 'owner-a', reason: 'expense_updated', keepalive: true });
  });

  it('coalesces the calls made while a POST is in flight into ONE trailing POST with the last reason', async () => {
    await invalidateDashboardOverviewSummary('owner-a', 'expense_updated');
    await invalidateDashboardOverviewSummary('owner-a', 'cash_asset_balance_updated');
    await invalidateDashboardOverviewSummary('owner-a', 'debt_repayment_edited');
    expect(calls.map((c) => c.reason)).toEqual(['expense_updated']);

    gates.shift()!();
    await flush();
    expect(calls.map((c) => c.reason)).toEqual(['expense_updated', 'debt_repayment_edited']);

    await drainAll();
    expect(calls).toHaveLength(2);
  });

  it('keeps one queue per owner', async () => {
    await invalidateDashboardOverviewSummary('owner-a', 'asset_updated');
    await invalidateDashboardOverviewSummary('owner-b', 'asset_updated');
    expect(calls.map((c) => c.ownerId)).toEqual(['owner-a', 'owner-b']);
  });

  it('opens a new queue once the previous one has drained', async () => {
    await invalidateDashboardOverviewSummary('owner-a', 'asset_updated');
    await drainAll();
    await invalidateDashboardOverviewSummary('owner-a', 'asset_created');
    expect(calls.map((c) => c.reason)).toEqual(['asset_updated', 'asset_created']);
  });

  it('stays best-effort: a failed POST is warned, and the trailing one still goes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(authenticatedFetch).mockImplementationOnce(async () => { throw new Error('offline'); });
    await invalidateDashboardOverviewSummary('owner-a', 'expense_created');
    await invalidateDashboardOverviewSummary('owner-a', 'cash_asset_balance_updated');
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.reason)).toEqual(['cash_asset_balance_updated']);
    warn.mockRestore();
  });
});

describe('settleDashboardOverviewInvalidations', () => {
  it('resolves at once when nothing is in flight', async () => {
    let settled = false;
    void settleDashboardOverviewInvalidations('owner-a').then(() => { settled = true; });
    await flush();
    expect(settled).toBe(true);
  });

  it('waits for the trailing POST, not only the first', async () => {
    await invalidateDashboardOverviewSummary('owner-a', 'expense_updated');
    await invalidateDashboardOverviewSummary('owner-a', 'cash_asset_balance_updated');
    let settled = false;
    void settleDashboardOverviewInvalidations('owner-a').then(() => { settled = true; });

    gates.shift()!(); // the first answers; the trailing one leaves
    await flush();
    expect(settled).toBe(false);

    gates.shift()!();
    await flush();
    expect(settled).toBe(true);
  });

  it('does not wait for another owner', async () => {
    await invalidateDashboardOverviewSummary('owner-b', 'asset_updated');
    let settled = false;
    void settleDashboardOverviewInvalidations('owner-a').then(() => { settled = true; });
    await flush();
    expect(settled).toBe(true);
  });

  it('gives up after its ceiling: a hung POST never hangs the overview', async () => {
    vi.useFakeTimers();
    await invalidateDashboardOverviewSummary('owner-a', 'expense_updated');
    let settled = false;
    void settleDashboardOverviewInvalidations('owner-a').then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(OVERVIEW_INVALIDATION_WAIT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });
});
