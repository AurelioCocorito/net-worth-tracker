/**
 * The browser-chrome colour (lib/utils/themeColor.ts, 2026-10-17): the two defaults the HTML
 * ships are the conversion of the default theme's two `--background` tokens, and the resolver
 * reads every form `getComputedStyle` can serve.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLORS, resolveThemeColor } from '@/lib/utils/themeColor';

describe('resolveThemeColor', () => {
  it('turns the default theme\'s two --background tokens into the shipped defaults', () => {
    // `:root` and `.dark` in app/globals.css.
    expect(resolveThemeColor('oklch(1 0 0)')).toBe(DEFAULT_THEME_COLORS.light);
    expect(resolveThemeColor('oklch(0.145 0 0)')).toBe(DEFAULT_THEME_COLORS.dark);
  });

  it('reads the served forms too — lab(), #hex, rgb() — and trims the token', () => {
    // Chrome serves a down-levelled token as lab(); same colour, same hex.
    expect(resolveThemeColor(' lab(100% 0 0) ')).toBe(DEFAULT_THEME_COLORS.light);
    expect(resolveThemeColor('#0a0a0a')).toBe('#0a0a0a');
    expect(resolveThemeColor('rgb(255, 255, 255)')).toBe('#ffffff');
  });

  it('is null for a token it cannot read, so the metas keep their last colour', () => {
    expect(resolveThemeColor('')).toBeNull();
    expect(resolveThemeColor('transparent')).toBeNull();
  });
});
