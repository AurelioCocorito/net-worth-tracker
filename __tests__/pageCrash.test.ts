/**
 * The error boundaries' rule (lib/utils/pageCrash.ts, 2026-10-28): a chunk of an older deploy is
 * told apart from a bug, reloads the tab by itself at most once a minute, and both speak the
 * failure notice's shape.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_RELOAD_COOLDOWN_MS,
  describePageCrash,
  isStaleDeployError,
  shouldAutoReload,
} from '@/lib/utils/pageCrash';

const chunkError = Object.assign(new Error('Loading chunk 4821 failed.\n(error: /_next/static/chunks/4821.js)'), { name: 'ChunkLoadError' });
const bug = new TypeError("Cannot read properties of undefined (reading 'amount')");

describe('isStaleDeployError', () => {
  it.each([
    ['webpack', chunkError],
    ['Chrome, a dynamic import', new TypeError('Failed to fetch dynamically imported module: https://example.com/_next/static/chunks/a.js')],
    ['Firefox', new TypeError('error loading dynamically imported module')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['a CSS chunk', new Error('Loading CSS chunk 77 failed.')],
    ['Turbopack', new Error('Failed to load chunk /_next/static/chunks/b.js')],
  ])('recognises a missing chunk (%s)', (_label, error) => {
    expect(isStaleDeployError(error)).toBe(true);
  });

  it('leaves a bug and a non-Error alone', () => {
    expect(isStaleDeployError(bug)).toBe(false);
    expect(isStaleDeployError('Loading chunk 1 failed')).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});

describe('shouldAutoReload', () => {
  const now = 1_000_000;

  it('reloads a stale chunk once', () => {
    expect(shouldAutoReload(chunkError, null, now)).toBe(true);
  });

  it('never twice within the cooldown — a chunk that is really missing must not loop the tab', () => {
    expect(shouldAutoReload(chunkError, now - AUTO_RELOAD_COOLDOWN_MS + 1, now)).toBe(false);
    expect(shouldAutoReload(chunkError, now - AUTO_RELOAD_COOLDOWN_MS, now)).toBe(true);
  });

  it('never for a bug', () => {
    expect(shouldAutoReload(bug, null, now)).toBe(false);
  });
});

describe('describePageCrash', () => {
  it('a bug: «Riprova», and the data reassured', () => {
    const notice = describePageCrash(bug);
    expect(notice.eyebrow).toBe('Pagina interrotta');
    expect(notice.retryLabel).toBe('Riprova');
    expect(notice.reassurance).toContain('non sono stati toccati');
  });

  it('a new deploy: «Ricarica», never called an error of the reader', () => {
    const notice = describePageCrash(chunkError);
    expect(notice.eyebrow).toBe('App aggiornata');
    expect(notice.retryLabel).toBe('Ricarica');
  });
});
