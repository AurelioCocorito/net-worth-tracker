/**
 * The start page — where the app opens on THIS device (2026-10-25).
 *
 * Panoramica opens on the net worth in its biggest type; an owner who opens the app among other
 * people may want it to open on Cashflow instead, where the month's spending is the first figure.
 * The choice is per device (localStorage, like the light/dark mode), never on the account: a phone
 * may open on Cashflow while the desk computer keeps Panoramica.
 *
 * Where it applies: the landing («/») and Accesso / Registrazione send a signed-in user to
 * `resolveStartPath`, and Panoramica itself redirects ONCE per browser tab when the tab was opened
 * on `/dashboard` (a bookmark, the home-screen icon) — `shouldRedirectToStart`. Every later visit
 * to Panoramica in the same tab, from the menu, stays on Panoramica.
 *
 * The default, when this device has never chosen, is Cashflow (2026-10-26, the owner's request: the
 * app opens on Cashflow without picking it on every device); «Panoramica» in Aspetto opts back out.
 * The emulator builds (E2E, perf and mobile census, the mirror tour) keep Panoramica as their
 * default, so every harness that opens `/dashboard` still measures Panoramica.
 *
 * Every storage access is wrapped: a private window or blocked site data answer the default.
 */

export type StartPage = 'panoramica' | 'cashflow';

export const START_PAGE_PATHS: Record<StartPage, string> = {
  panoramica: '/dashboard',
  cashflow: '/dashboard/cashflow',
};

export const DEFAULT_START_PAGE: StartPage =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ? 'panoramica' : 'cashflow';

export const START_PAGE_STORAGE_KEY = 'nwt-start-page';
/** The path the browser tab first opened inside the dashboard (sessionStorage). */
export const SESSION_ENTRY_STORAGE_KEY = 'nwt-session-entry';
/** Set once the tab has been sent to the start page (sessionStorage). */
export const START_APPLIED_STORAGE_KEY = 'nwt-start-applied';

export function parseStartPage(
  value: string | null | undefined,
  fallback: StartPage = DEFAULT_START_PAGE
): StartPage {
  return value === 'cashflow' || value === 'panoramica' ? value : fallback;
}

export function resolveStartPath(page: StartPage): string {
  return START_PAGE_PATHS[page];
}

/**
 * Panoramica's one redirect: only toward Cashflow, only when the tab was opened on Panoramica,
 * only once per tab.
 */
export function shouldRedirectToStart(page: StartPage, sessionEntry: string | null, alreadyApplied: boolean): boolean {
  return page === 'cashflow' && sessionEntry === START_PAGE_PATHS.panoramica && !alreadyApplied;
}

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage blocked: the choice simply does not persist.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export function readStartPage(): StartPage {
  if (typeof window === 'undefined') return DEFAULT_START_PAGE;
  return parseStartPage(safeGet(local, START_PAGE_STORAGE_KEY));
}

const listeners = new Set<() => void>();

export function writeStartPage(page: StartPage): void {
  safeSet(local, START_PAGE_STORAGE_KEY, page);
  listeners.forEach((listener) => listener());
}

export function subscribeStartPage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record where this tab entered the dashboard — the first call wins. */
export function recordSessionEntry(pathname: string): void {
  if (typeof window === 'undefined') return;
  if (safeGet(session, SESSION_ENTRY_STORAGE_KEY) === null) safeSet(session, SESSION_ENTRY_STORAGE_KEY, pathname);
}

/**
 * Panoramica's check, consumed: true at most once per tab, and only when the device opens on
 * Cashflow and the tab entered on Panoramica.
 */
export function takeStartRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  const redirect = shouldRedirectToStart(
    readStartPage(),
    safeGet(session, SESSION_ENTRY_STORAGE_KEY),
    safeGet(session, START_APPLIED_STORAGE_KEY) !== null
  );
  safeSet(session, START_APPLIED_STORAGE_KEY, '1');
  return redirect;
}
