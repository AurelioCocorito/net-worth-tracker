'use client';

import { authenticatedFetch } from '@/lib/utils/authFetch';

/**
 * Mark the materialized dashboard overview summary as stale after a client-side mutation.
 *
 * The summary document is server-owned, so client-side mutations must go through
 * a private API route rather than writing the materialized collection directly.
 *
 * This helper is intentionally best-effort: overview invalidation should never make
 * the primary user action fail after the underlying Firestore write already succeeded.
 *
 * It never makes the action WAIT either (2026-10-28): the call returns at once and the POST runs
 * behind it. A save used to await one round trip to a Vercel function per write it made — two on
 * an expense with an account, four with a fee and a loan, each a cold start away on a quiet
 * evening — before its toast. Calls for the same owner while a POST is in flight COALESCE into
 * ONE trailing POST, sent when the first answers: one save is at most two requests, and the last
 * one always lands after the save's last write, so a recompute that read between two writes of
 * the same save is still refused (doc/guide/panoramica.md § The materialized summary).
 *
 * The one reader that must see the invalidation first — `GET /api/dashboard/overview`, the
 * refetch a save triggers — waits for it with `settleDashboardOverviewInvalidations(ownerId)`.
 */

/** One owner's queue: the POSTs in flight, and the reason of the trailing one still owed. */
interface OwnerQueue {
  drained: Promise<void>;
  pendingReason: string | null;
}

const queues = new Map<string, OwnerQueue>();

/**
 * The longest the overview read waits for an invalidation in flight: past this it reads anyway,
 * as it did before the queue existed when the POST failed (best-effort, never a hung page).
 */
export const OVERVIEW_INVALIDATION_WAIT_MS = 5000;

async function postInvalidation(ownerId: string, reason: string): Promise<void> {
  try {
    // Send the data-owner id so the endpoint invalidates the OWNER's summary,
    // not the caller's — a shared-account delegate mutates the owner's data.
    await authenticatedFetch('/api/dashboard/overview/invalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ownerId, reason }),
      // A save closes its dialog before this answers: the request outlives a tab closed right after.
      keepalive: true,
    });
  } catch (error) {
    console.warn('[dashboardOverviewInvalidation] Failed to mark summary stale:', error);
  }
}

/**
 * Queue the invalidation of `ownerId`'s summary and return at once. Still `async` so the callers'
 * `await` stays harmless: it resolves on the next microtask, never on the network.
 */
export async function invalidateDashboardOverviewSummary(
  ownerId: string,
  reason: string
): Promise<void> {
  const queue = queues.get(ownerId);
  if (queue) {
    // A POST is in flight: the trailing one carries the latest reason, and only one is owed.
    queue.pendingReason = reason;
    return;
  }

  const entry: OwnerQueue = { drained: Promise.resolve(), pendingReason: reason };
  queues.set(ownerId, entry);
  entry.drained = (async () => {
    while (entry.pendingReason !== null) {
      const next = entry.pendingReason;
      entry.pendingReason = null;
      await postInvalidation(ownerId, next);
    }
    // Synchronous after the last check: a call landing now opens a new queue, never a lost one.
    queues.delete(ownerId);
  })();
}

/**
 * Resolves when every invalidation queued for `ownerId` has been answered, or after
 * `OVERVIEW_INVALIDATION_WAIT_MS` — at once when none is in flight. Never rejects.
 */
export function settleDashboardOverviewInvalidations(ownerId: string): Promise<void> {
  const queue = queues.get(ownerId);
  if (!queue) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, OVERVIEW_INVALIDATION_WAIT_MS);
  });
  return Promise.race([queue.drained, timeout]).finally(() => clearTimeout(timer));
}
