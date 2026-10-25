/**
 * The bottom nav's «+» (`isAddExpenseFabShown`): Cashflow › Tracciamento alone, never in demo.
 * Seen red on 2026-10-12, in the retirement of the Cashflow composition's spec, with the demo
 * clause removed — until that day the FAB was the one add control the demo did not gate, and a
 * save from it wrote to the shared account.
 */

import { describe, expect, it } from 'vitest';
import { isAddExpenseFabShown, isNavItemActive, resolveActiveNavHref } from '@/lib/utils/navUtils';

describe('isAddExpenseFabShown', () => {
  it('draws the FAB on Tracciamento only: the tab absent or `tracking`, on the Cashflow route', () => {
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: null, isDemo: false })).toBe(true);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'tracking', isDemo: false })).toBe(true);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'dividends', isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'budget', isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard', tab: null, isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow-x', tab: null, isDemo: false })).toBe(false);
  });

  it('never draws it in demo, Tracciamento included', () => {
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: null, isDemo: true })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'tracking', isDemo: true })).toBe(false);
  });
});

describe('isNavItemActive', () => {
  it('matches /dashboard exactly and every other item by prefix', () => {
    expect(isNavItemActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavItemActive('/dashboard', '/dashboard/cashflow')).toBe(false);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflow')).toBe(true);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflow/x')).toBe(true);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflows')).toBe(false);
  });
});

describe('resolveActiveNavHref', () => {
  const tools = [
    '/dashboard/settings',
    '/dashboard/settings?tab=condivisione&sezione=backup',
    '/dashboard/settings?tab=spese&sezione=import',
  ];

  it('lights ONE row of «Strumenti»: the tab picks Backup or Import CSV, any other tab Impostazioni', () => {
    expect(resolveActiveNavHref(tools, '/dashboard/settings', 'condivisione')).toBe(tools[1]);
    expect(resolveActiveNavHref(tools, '/dashboard/settings', 'spese')).toBe(tools[2]);
    expect(resolveActiveNavHref(tools, '/dashboard/settings', 'aspetto')).toBe(tools[0]);
    expect(resolveActiveNavHref(tools, '/dashboard/settings', null)).toBe(tools[0]);
  });

  it('lights none off the settings route, and keeps the prefix rule for plain rows', () => {
    expect(resolveActiveNavHref(tools, '/dashboard/cashflow', 'spese')).toBeNull();
    expect(resolveActiveNavHref(['/dashboard', '/dashboard/assets'], '/dashboard/assets/123', null)).toBe('/dashboard/assets');
    expect(resolveActiveNavHref(['/dashboard', '/dashboard/assets'], '/dashboard', null)).toBe('/dashboard');
  });
});
