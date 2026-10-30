/**
 * A page that throws while it renders (2026-10-28): what the error boundaries
 * (`app/error.tsx`, `app/dashboard/error.tsx`, `app/global-error.tsx`) say and do instead of the
 * blank «Application error» screen the app showed until then.
 *
 * Two causes, two answers:
 * - **A new deploy under an open tab.** The tab asks for a chunk of the build it was loaded from,
 *   Vercel no longer serves it, and the page dies on a lazy tab or a dialog. Nothing is broken: a
 *   reload loads the new build. The boundary reloads ONCE by itself (`shouldAutoReload`), and
 *   never twice in a minute, so a chunk that really is missing cannot loop the tab.
 * - **Anything else** — a bug. The boundary shows the notice below with «Riprova».
 *
 * A render error touches no data: the saves are writes awaited before their toast, never a render.
 */

import type { ReadFailureNotice } from '@/lib/utils/statesNarrative';

/** The messages a missing chunk throws in Chrome/Firefox (webpack, Turbopack) and Safari. */
const STALE_DEPLOY_PATTERNS = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to load chunk/i,
];

/** True when the thrown value is a chunk of an older build that can no longer be loaded. */
export function isStaleDeployError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`;
  return STALE_DEPLOY_PATTERNS.some((pattern) => pattern.test(text));
}

/** The sessionStorage key of the last automatic reload. */
export const AUTO_RELOAD_KEY = 'nwt:pageCrash:autoReloadAt';

/** Two automatic reloads closer than this are a loop, not a deploy: the second one waits for a click. */
export const AUTO_RELOAD_COOLDOWN_MS = 60 * 1000;

/**
 * Whether the boundary reloads the page by itself: a stale chunk, and no automatic reload in the
 * last minute (`lastReloadAt` from sessionStorage, null when none or unreadable).
 */
export function shouldAutoReload(error: unknown, lastReloadAt: number | null, now: number): boolean {
  if (!isStaleDeployError(error)) return false;
  return lastReloadAt === null || now - lastReloadAt >= AUTO_RELOAD_COOLDOWN_MS;
}

/** The words of a page that stopped, in the shape every failure notice speaks (`ErrorNotice`). */
export function describePageCrash(error: unknown): ReadFailureNotice {
  if (isStaleDeployError(error)) {
    return {
      eyebrow: 'App aggiornata',
      message: "È uscita una versione nuova dell'app mentre questa pagina era aperta.",
      reassurance: 'Ricarica la pagina per passare alla versione nuova. I tuoi dati non sono stati toccati.',
      retryLabel: 'Ricarica',
    };
  }
  return {
    eyebrow: 'Pagina interrotta',
    message: 'Questa pagina si è fermata per un errore imprevisto.',
    reassurance: "L'errore riguarda solo la visualizzazione: i dati salvati non sono stati toccati. Se si ripete, ricarica la pagina.",
    retryLabel: 'Riprova',
  };
}
