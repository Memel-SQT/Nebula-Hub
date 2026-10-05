import type { ResolvedTheme } from './theme';

/**
 * A theme from an appearance pack (@nebula/link, docs/NEBULA_LINK.md § 18), applied over a built-in
 * theme: `data-theme` keeps the built-in theme of the same scheme (so every selector of the shared
 * styles still matches), `data-pack-theme` names the pack theme, and its tokens are inline custom
 * properties on the root, which win over the token blocks. Accent presets never apply to it.
 */
export interface PackThemeTokens {
  id: string;
  scheme: 'dark' | 'light';
  tokens: Record<string, string>;
}

const applied = new WeakMap<HTMLElement, string[]>();

/** The built-in theme a pack theme is drawn over. */
export function packBaseTheme(scheme: PackThemeTokens['scheme']): ResolvedTheme {
  return scheme === 'light' ? 'nebula-light' : 'nebula-dark';
}

/** Applies a pack theme (or removes the previous one with `null`); call it after `applyAppearance`. */
export function applyPackTheme(root: HTMLElement, theme: PackThemeTokens | null): void {
  for (const name of applied.get(root) ?? []) {
    root.style.removeProperty(name);
  }
  applied.delete(root);
  if (!theme) {
    delete root.dataset.packTheme;
    root.style.removeProperty('color-scheme');
    return;
  }
  const names = Object.keys(theme.tokens).filter((name) => name.startsWith('--'));
  for (const name of names) {
    root.style.setProperty(name, theme.tokens[name]);
  }
  applied.set(root, names);
  root.dataset.packTheme = theme.id;
  root.style.setProperty('color-scheme', theme.scheme);
}
