/**
 * The colour the BROWSER paints around the page — `<meta name="theme-color">`, read by Chrome on
 * Android for its address bar and the system bars, by Safari for its tab bar — and the two
 * defaults the HTML ships before any script runs.
 *
 * Why it exists (owner, 2026-10-17): with dark mode following the system, the bar under the app
 * was sometimes white. The app declared no `theme-color`, no `color-scheme` and no background on
 * `<html>` (only on `<body>`), so the browser's own chrome and the overscroll canvas kept their
 * defaults. The CSS half is in `app/globals.css` (`html { background; color-scheme }`), the meta
 * half here: `app/layout.tsx` ships `DEFAULT_THEME_COLORS` as a light/dark pair keyed on
 * `prefers-color-scheme` — right for the default colour theme in system mode, before hydration —
 * and `ThemeColorSync` (components/providers) rewrites the metas from the RESOLVED `--background`
 * once the theme is known: a forced light/dark mode and the eleven other colour themes included.
 *
 * `resolveThemeColor` goes through `colorToHex`, the one route from a served token (`oklch()`,
 * `lab()`, `#hex`) to the `#rrggbb` a meta tag accepts everywhere.
 */

import { colorToHex } from '@/lib/utils/cssColorToHex';

export const THEME_COLOR_META_NAME = 'theme-color';

/**
 * The default theme's `--background` as `#rrggbb` (`:root` is `oklch(1 0 0)`, `.dark` is
 * `oklch(0.145 0 0)` in `app/globals.css`): what the HTML declares for a reader whose stored theme
 * is the default and whose mode follows the system. `__tests__/themeColor.test.ts` holds them
 * equal to the conversion of those two tokens, so a retuned default theme fails the test.
 */
export const DEFAULT_THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' } as const;

/** The served `--background` as the meta's content; `null` when the token is unreadable (the metas keep their last value). */
export function resolveThemeColor(background: string): string | null {
  return colorToHex(background.trim());
}
