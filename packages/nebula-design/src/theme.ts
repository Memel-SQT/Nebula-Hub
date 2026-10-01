/**
 * Nebula themes.
 *
 * Ported from Nebula Finterest v0.1.36 `src/renderer/theme.ts`. Differences: the frozen
 * `old-*` themes are Finterest-only and are not part of the shared set; storage is the host
 * app's business (the Store keeps it in settings.json, not localStorage), so this module only
 * holds the pure rules. The React hook lives in `hooks.ts`.
 *
 * `nebula-*` are the identity, `glass-*` the same palette rendered as translucent
 * "liquid glass" surfaces over the animated background.
 */
export type Theme = 'nebula-dark' | 'nebula-light' | 'glass-dark' | 'glass-light' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;

export const THEMES: readonly Theme[] = ['nebula-dark', 'nebula-light', 'glass-dark', 'glass-light', 'system'];
export const DEFAULT_THEME: Theme = 'system';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** `system` follows the OS between the two Nebula themes. */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return prefersDark ? 'nebula-dark' : 'nebula-light';
  }
  return theme;
}

export function isLightTheme(theme: ResolvedTheme): boolean {
  return theme.endsWith('-light');
}

export function isGlassTheme(theme: ResolvedTheme): boolean {
  return theme.startsWith('glass-');
}
