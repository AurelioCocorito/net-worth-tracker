/**
 * Returns true when the given nav item href matches the current pathname.
 * Uses exact match for /dashboard to avoid treating every sub-route as active,
 * and prefix match for all other routes so nested paths stay highlighted.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * The ONE active href of a group whose items may carry a `?tab=` (the «Strumenti» group: three
 * rows on the same route). An item with a tab is active when the route AND the tab match; a plain
 * item by `isNavItemActive`, unless a sibling with a tab already claimed the route. Null = none.
 */
export function resolveActiveNavHref(hrefs: string[], pathname: string, tab: string | null): string | null {
  const parsed = hrefs.map((href) => {
    const [path, query = ''] = href.split('?');
    return { href, path, tab: new URLSearchParams(query).get('tab') };
  });
  const byTab = parsed.find((item) => item.tab !== null && item.path === pathname && item.tab === tab);
  if (byTab) return byTab.href;
  const plain = parsed.find((item) => item.tab === null && isNavItemActive(item.path, pathname));
  return plain ? plain.href : null;
}

/**
 * Whether the bottom nav draws the «+» that adds an expense: on Cashflow › Tracciamento alone
 * (`?tab=` absent or `tracking` — on Dividendi and Budget the tab's own add button sits under
 * the verdict, and a FAB that still added an EXPENSE there read as the tab's add affordance)
 * and never in demo (2026-10-12: the demo account is shared by every visitor and `useDemoMode`
 * gates every mutation, but the FAB was the one add control it did not reach — a save from it
 * wrote to the shared account).
 */
export function isAddExpenseFabShown({ pathname, tab, isDemo }: { pathname: string; tab: string | null; isDemo: boolean }): boolean {
  if (isDemo) return false;
  const isOnCashflow = pathname === '/dashboard/cashflow' || pathname.startsWith('/dashboard/cashflow/');
  return isOnCashflow && (tab === null || tab === 'tracking');
}
