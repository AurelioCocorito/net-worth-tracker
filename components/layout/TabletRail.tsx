'use client';

import { usePathname } from 'next/navigation';
import { Menu, Settings } from 'lucide-react';
import { SceneLink } from '@/components/layout/SceneLink';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { isNavItemActive } from '@/lib/utils/navUtils';
import {
  primaryNav,
  analysisNav,
  planningNav,
  assistantNavItem,
  type NavItem,
} from '@/lib/constants/navigation';

/** A 44px target on the rail: the icon centred, the active route on `--sidebar-accent`. */
const RAIL_TARGET_CLASS =
  'flex size-11 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5';

function RailLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const active = isNavItemActive(item.href, pathname);
        return (
          <li key={item.href}>
            <SceneLink
              href={item.href}
              aria-label={item.name}
              aria-current={active ? 'page' : undefined}
              className={cn(RAIL_TARGET_CLASS, active && 'bg-sidebar-accent text-sidebar-foreground')}
            >
              {/* lucide marks its icons `aria-hidden`: the link's name is its `aria-label`. */}
              <item.icon />
            </SceneLink>
          </li>
        );
      })}
    </>
  );
}

/**
 * The navigation of a tablet in landscape (2026-10-16): the desktop sidebar's routes as a 56px icon
 * rail on the left, always there, in place of the 53px bar and its hamburger — the width is what a
 * landscape tablet has in excess and the height what it lacks (an Impeccable critique of 2026-10-16,
 * deleted on 2026-10-17 with every critique — `git log -- .impeccable/critique/`; the owner's choice). Every route is one tap and the current page is
 * marked, as the phone's pill does. Shown by CSS alone (`tablet-landscape:`, globals.css), so the
 * prerendered shell paints it before hydration with nothing to correct.
 *
 * The account, the theme and the logout stay in the sidebar's sheet: the last button opens it
 * (`toggleSidebar`, which below 1440 is the sheet).
 */
export function TabletRail() {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

  return (
    <nav
      aria-label="Navigazione principale"
      data-nav="rail"
      className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 tablet-landscape:flex"
    >
      <ul className="flex flex-col items-center gap-1">
        <RailLinks items={primaryNav} pathname={pathname} />
      </ul>
      <div className="my-1.5 w-7 border-t border-sidebar-border" aria-hidden="true" />
      <ul className="flex flex-col items-center gap-1">
        <RailLinks items={analysisNav} pathname={pathname} />
      </ul>
      <div className="my-1.5 w-7 border-t border-sidebar-border" aria-hidden="true" />
      <ul className="flex flex-col items-center gap-1">
        <RailLinks items={planningNav} pathname={pathname} />
        {showAssistant && <RailLinks items={[assistantNavItem]} pathname={pathname} />}
      </ul>
      <ul className="mt-auto flex flex-col items-center gap-1">
        <RailLinks items={[{ name: 'Impostazioni', href: '/dashboard/settings', icon: Settings }]} pathname={pathname} />
        <li>
          <button type="button" onClick={toggleSidebar} aria-label="Account e preferenze" className={RAIL_TARGET_CLASS}>
            <Menu aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
