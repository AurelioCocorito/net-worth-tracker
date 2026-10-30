'use client';

import { useEffect } from 'react';
import { describePageCrash, isStaleDeployError } from '@/lib/utils/pageCrash';

/**
 * The root layout itself threw (its providers, the theme): nothing of the app is left to draw
 * with, so this page brings its own document and its own few styles, in the system's light or
 * dark (Next.js: global-error replaces the root layout and loads no global CSS). Same words as
 * every other boundary (lib/utils/pageCrash.ts); its one action reloads the tab.
 */
export default function GlobalError({ error }: Readonly<{ error: unknown; retry: () => void }>) {
  const notice = describePageCrash(error);

  useEffect(() => {
    console.error('[pageCrash] The app shell stopped while rendering:', error);
  }, [error]);

  return (
    <html lang="it" style={{ colorScheme: 'light dark' }}>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: 'Canvas', color: 'CanvasText' }}>
        <title>Portfolio Tracker</title>
        <main role="alert" style={{ maxWidth: 560, margin: '15vh auto 0', padding: '0 16px', lineHeight: 1.45 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#dc2626', margin: 0 }}>
            {notice.eyebrow}
          </p>
          <p style={{ fontSize: 15, margin: '8px 0 4px' }}>{notice.message}</p>
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>{notice.reassurance}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, minHeight: 44, padding: '0 16px', fontSize: 14, borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            {isStaleDeployError(error) ? 'Ricarica' : 'Ricarica la pagina'}
          </button>
        </main>
      </body>
    </html>
  );
}
