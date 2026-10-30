'use client';

import { useEffect } from 'react';
import { ErrorNotice } from '@/components/ui/error-notice';
import {
  AUTO_RELOAD_KEY,
  describePageCrash,
  isStaleDeployError,
  shouldAutoReload,
} from '@/lib/utils/pageCrash';

/** The last automatic reload, or null when there is none or the storage cannot be read. */
function readLastAutoReload(): number | null {
  try {
    const raw = sessionStorage.getItem(AUTO_RELOAD_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * What an error boundary shows instead of a blank page (lib/utils/pageCrash.ts): the failure in
 * the tile's own material (`ErrorNotice`) with ONE action — «Riprova» re-renders the segment,
 * «Ricarica» (a chunk of an older deploy) reloads the tab. A stale chunk reloads by itself once.
 */
export function PageCrash({ error, retry }: Readonly<{ error: unknown; retry: () => void }>) {
  const stale = isStaleDeployError(error);

  useEffect(() => {
    console.error('[pageCrash] A page stopped while rendering:', error);
    const now = Date.now();
    if (!shouldAutoReload(error, readLastAutoReload(), now)) return;
    try {
      sessionStorage.setItem(AUTO_RELOAD_KEY, String(now));
    } catch {
      // Without a stamp a second failure would reload again: leave it to the button.
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <ErrorNotice notice={describePageCrash(error)} onRetry={stale ? () => window.location.reload() : retry} />
    </div>
  );
}
