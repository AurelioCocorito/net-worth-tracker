/**
 * The start page (lib/utils/startPage.ts): where the app opens on this device, and Panoramica's
 * one redirect per tab toward Cashflow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseStartPage,
  readStartPage,
  recordSessionEntry,
  resolveStartPath,
  shouldRedirectToStart,
  takeStartRedirect,
  writeStartPage,
  subscribeStartPage,
} from '@/lib/utils/startPage';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

describe('pure rules', () => {
  it('reads a device that never chose as Cashflow, and the emulator builds as Panoramica', () => {
    expect(parseStartPage('cashflow')).toBe('cashflow');
    expect(parseStartPage('panoramica')).toBe('panoramica');
    expect(parseStartPage(null)).toBe('cashflow');
    expect(parseStartPage('altro')).toBe('cashflow');
    expect(parseStartPage(null, 'panoramica')).toBe('panoramica');
    expect(parseStartPage('cashflow', 'panoramica')).toBe('cashflow');
  });

  it('maps each page to its path', () => {
    expect(resolveStartPath('panoramica')).toBe('/dashboard');
    expect(resolveStartPath('cashflow')).toBe('/dashboard/cashflow');
  });

  it('redirects only toward Cashflow, only from a tab opened on Panoramica, only once', () => {
    expect(shouldRedirectToStart('cashflow', '/dashboard', false)).toBe(true);
    expect(shouldRedirectToStart('cashflow', '/dashboard', true)).toBe(false);
    expect(shouldRedirectToStart('cashflow', '/dashboard/assets', false)).toBe(false);
    expect(shouldRedirectToStart('panoramica', '/dashboard', false)).toBe(false);
  });
});

describe('storage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists the choice and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartPage(listener);
    expect(readStartPage()).toBe('cashflow');
    writeStartPage('panoramica');
    expect(readStartPage()).toBe('panoramica');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('sends a device that never chose from Panoramica to Cashflow', () => {
    recordSessionEntry('/dashboard');
    expect(takeStartRedirect()).toBe(true);
  });

  it('takes the redirect once per tab, and never when the tab entered elsewhere', () => {
    writeStartPage('cashflow');
    recordSessionEntry('/dashboard');
    recordSessionEntry('/dashboard/cashflow'); // the first entry wins
    expect(takeStartRedirect()).toBe(true);
    expect(takeStartRedirect()).toBe(false);

    vi.stubGlobal('window', { localStorage: window.localStorage, sessionStorage: memoryStorage() });
    recordSessionEntry('/dashboard/assets');
    expect(takeStartRedirect()).toBe(false);
  });

  it('answers the default and no redirect when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    vi.stubGlobal('window', { localStorage: blocked, sessionStorage: blocked });
    writeStartPage('panoramica');
    expect(readStartPage()).toBe('cashflow');
    expect(takeStartRedirect()).toBe(false);
  });
});
