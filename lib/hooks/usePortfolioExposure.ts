'use client';

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { computeExposure } from '@/lib/utils/exposureEngine';
import { profileRequestsSignature, selectProfileRequests } from '@/lib/utils/exposureRequests';
import type { Asset } from '@/types/assets';
import type { InstrumentProfile, InstrumentProfilesResponse } from '@/types/exposure';

async function fetchInstrumentProfiles(ownerId: string, force: boolean): Promise<InstrumentProfilesResponse> {
  const url = `/api/portfolio/instrument-profiles?userId=${encodeURIComponent(ownerId)}${force ? '&force=true' : ''}`;
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch instrument profiles');
  }
  return response.json() as Promise<InstrumentProfilesResponse>;
}

/** Stable, so a portfolio with nothing to ask computes once and not on every render. */
const NO_PROFILES: Record<string, InstrumentProfile> = {};

export interface PortfolioExposureOptions {
  /**
   * Whether the profiles may be read at all (default `true`). Below `desktop:` the Esposizione is
   * a closed row and the page passes `false` until the row has been opened once: React Query
   * fetches a key as soon as ONE observer of it is enabled, so the hook inside the tile has to be
   * off, not just its content unmounted (2026-10-15, doc/guide/allocazione.md § Composizione
   * mobile). Off, `profiles` is `undefined` and the engine does not run, whatever the signature.
   */
  enabled?: boolean;
}

/**
 * The Esposizione of the OWNER's Allocazione portfolio: the route answers only the Yahoo profiles
 * of the tickers in view (`/api/portfolio/instrument-profiles`, one shared cache per ticker), and
 * the weighing runs here, in the browser, on the assets the page already holds
 * (`computeExposure`) — so the euros are Per classe's by construction and
 * an edited asset recomputes the tile without a third invalidation.
 *
 * The query key carries the SIGNATURE of the tickers in view («AAPL:stock|VWCE.DE:fund»): a new
 * ticker changes the key and the read restarts by itself. Nothing to ask (no quoted instrument
 * with a module) means no request at all — the engine still runs, so a portfolio of bonds and
 * crypto reads «non letto» with the names rather than a spinner. `staleTime` is an hour: the
 * server's TTL is 30 days per module, and `refresh()` («Aggiorna») passes `force=true` to it.
 *
 * The tile waits on the ENGINE's silence, not on a query flag: it shows its skeleton while
 * `exposure` is null and nothing failed, because with an empty signature the query is disabled —
 * never `isLoading` — and the engine has already answered. `isLoading` (never `isPending`, which
 * stays true forever on a disabled query, AGENTS.md § React Query) is still returned for a caller
 * with a request in flight; the tile does not read it.
 */
export function usePortfolioExposure(ownerId: string | undefined, assets: Asset[], options: PortfolioExposureOptions = {}) {
  const enabled = options.enabled ?? true;
  const signature = useMemo(() => profileRequestsSignature(selectProfileRequests(assets)), [assets]);

  // Set to true by `refresh()` and consumed on the next queryFn call — a ref, not state, so
  // flipping it does not re-render.
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.portfolio.instrumentProfiles(ownerId ?? '', signature),
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      return fetchInstrumentProfiles(ownerId!, force);
    },
    enabled: enabled && !!ownerId && signature !== '',
    staleTime: 60 * 60 * 1000,
  });

  // React Query keeps the last payload through a failed refresh, so a stale list beats an empty
  // tile; with nothing to ask the profiles are simply empty and the engine runs at once — but
  // only while the hook is on: a closed row computes nothing.
  const profiles = !enabled ? undefined : signature === '' ? NO_PROFILES : query.data?.profiles;
  const exposure = useMemo(() => (profiles ? computeExposure(assets, profiles) : null), [assets, profiles]);

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return {
    exposure,
    profiles,
    oldestFetchedAt: query.data?.oldestFetchedAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    refresh,
  };
}

/**
 * What the PAGE needs of the profiles' read without reading them: whether the last attempt failed
 * (the Esposizione row's `failed`, its red eyebrow) and whether a payload was ever read (a failed
 * «Aggiorna» over profiles already read keeps the tile; a failed first read is an `ErrorNotice`
 * row). An observer on the SAME key as `usePortfolioExposure`'s with `enabled: false` — it
 * downloads nothing by itself, and `refetch()` on it («Riprova») fetches regardless of `enabled`,
 * so the row's hook sees the answer the moment it lands (2026-10-15).
 */
export function useInstrumentProfilesState(ownerId: string | undefined, assets: Asset[]) {
  const signature = useMemo(() => profileRequestsSignature(selectProfileRequests(assets)), [assets]);
  const query = useQuery({
    queryKey: queryKeys.portfolio.instrumentProfiles(ownerId ?? '', signature),
    queryFn: () => fetchInstrumentProfiles(ownerId!, false),
    enabled: false,
    staleTime: 60 * 60 * 1000,
  });
  return { isError: query.isError, hasProfiles: query.data !== undefined, refetch: query.refetch };
}
