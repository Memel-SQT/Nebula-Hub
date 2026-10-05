import { useEffect, useLayoutEffect, useState } from 'react';
import { applyAppearance, type Appearance } from './appearance';
import { applyPackTheme, type PackThemeTokens } from './pack-theme';
import { configureSounds } from './sound';
import { DARK_QUERY, resolveTheme, type ResolvedTheme, type Theme } from './theme';

/**
 * Resolves `system` (and follows OS changes live) and writes `data-theme` on `<html>` in a
 * layout effect, so the first paint already has the right palette. Storage is the caller's.
 * Adapted from `useTheme` in Nebula Finterest v0.1.36.
 */
export function useResolvedTheme(theme: Theme): ResolvedTheme {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    if (theme !== 'system') {
      return;
    }
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setPrefersDark(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const resolved = resolveTheme(theme, prefersDark);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}

/** Applies accents, background and motion attributes, and configures sounds. */
export function useAppliedAppearance(appearance: Appearance, theme: ResolvedTheme): void {
  useLayoutEffect(() => {
    applyAppearance(document.documentElement, appearance, theme);
  }, [appearance, theme]);

  useEffect(() => {
    configureSounds({ enabled: appearance.soundEnabled, volume: appearance.soundVolume });
  }, [appearance.soundEnabled, appearance.soundVolume]);
}

/**
 * Applies a pack theme over the built-in one (`pack-theme.ts`). Declared after
 * `useAppliedAppearance` and re-run with the appearance, so an accent change never clears it.
 */
export function usePackTheme(theme: PackThemeTokens | null, appearance: Appearance): void {
  useLayoutEffect(() => {
    applyPackTheme(document.documentElement, theme);
  }, [theme, appearance]);
}
