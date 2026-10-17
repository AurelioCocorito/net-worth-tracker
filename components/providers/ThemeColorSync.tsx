'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { resolveThemeColor, THEME_COLOR_META_NAME } from '@/lib/utils/themeColor';

/**
 * Keeps every `<meta name="theme-color">` equal to the page's RESOLVED `--background`, so the
 * browser's chrome (Chrome for Android's bars, Safari's tab bar) is the page's colour whatever the
 * light/dark mode — forced or following the system — and whichever of the twelve colour themes is
 * on (lib/utils/themeColor.ts). Renders nothing.
 *
 * Timing is doc/guide/temi.md's: `useEffect` + `requestAnimationFrame`, keyed on the colour theme
 * and on next-themes' `resolvedTheme` — a read during render, or in the same tick as the change,
 * runs before `.dark` and `data-theme` are on `<html>` and serves the previous theme's colour. The
 * metas rendered by `app/layout.tsx` (a light/dark pair) are all set to the one resolved colour:
 * whichever the browser picks, it is the right one.
 */
export function ThemeColorSync() {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const background = getComputedStyle(document.documentElement).getPropertyValue('--background');
      const color = resolveThemeColor(background);
      if (!color) return;
      document.querySelectorAll<HTMLMetaElement>(`meta[name="${THEME_COLOR_META_NAME}"]`).forEach((meta) => {
        meta.setAttribute('content', color);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme]);

  return null;
}
