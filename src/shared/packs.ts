import type { PackLabel, PackTheme } from '@nebula/link';
import type { CatalogView } from './catalog-view';
import type { InstalledView } from './installed-view';

/**
 * Appearance packs as the renderer sees them (docs/NEBULA_LINK.md § 18): the themes, display names
 * and mark an installed family app shares. The owner's executable path stays in the main process.
 */
export interface PackView {
  id: string;
  ownerAppId: string;
  themes: PackTheme[];
  names: Record<string, string>;
  /** The Hub's mark as a `data:image/svg+xml` URL, shown in an `<img>` only. */
  markUrl: string | null;
  /** Each app's logo (by app id) as a `data:image/svg+xml` URL, in place of its catalog icon. */
  iconUrls: Record<string, string>;
}

export type { PackLabel, PackTheme };

/**
 * Packs whose owner the detection sees installed. Until the first detection completes the packs are
 * trusted on their owner's executable alone, so a saved pack theme does not flash at startup.
 */
export function installedPacks(packs: readonly PackView[], installed: InstalledView): PackView[] {
  if (installed.state !== 'ready') return [...packs];
  return packs.filter((pack) => installed.apps.some((app) => app.appId === pack.ownerAppId && app.exeFound));
}

export interface ActivePack {
  pack: PackView;
  theme: PackTheme;
}

/** The pack theme the user chose, if its pack is still there; otherwise the built-in theme applies. */
export function activePack(packs: readonly PackView[], packTheme: string | null): ActivePack | null {
  if (!packTheme) return null;
  for (const pack of packs) {
    const theme = pack.themes.find((candidate) => candidate.id === packTheme);
    if (theme) return { pack, theme };
  }
  return null;
}

export function packLabel(label: PackLabel, language: string): string {
  return (language === 'en' ? label.en : undefined) ?? label.fr;
}

/** Display name of an app while a pack is active (install names never change). */
export function displayName(appId: string, name: string, active: ActivePack | null): string {
  return active?.pack.names[appId] ?? name;
}

/** The catalog with the pack's display names and logos (what every screen shows). */
export function namedCatalog(view: CatalogView, active: ActivePack | null): CatalogView {
  if (!active) return view;
  const { names, iconUrls } = active.pack;
  if (!view.entries.some((entry) => names[entry.app.id] || iconUrls[entry.app.id])) return view;
  return {
    ...view,
    entries: view.entries.map((entry) => ({
      ...entry,
      icon: iconUrls[entry.app.id] ?? entry.icon,
      app: names[entry.app.id] ? { ...entry.app, name: names[entry.app.id] } : entry.app,
    })),
  };
}

/** Pairs [catalog name, pack name], longest first, to rename the apps inside sentences. */
export function renamePairs(apps: ReadonlyArray<{ id: string; name: string }>, active: ActivePack | null): Array<[string, string]> {
  if (!active) return [];
  return apps
    .filter((app) => active.pack.names[app.id] && active.pack.names[app.id] !== app.name)
    .map((app): [string, string] => [app.name, active.pack.names[app.id]])
    .sort((left, right) => right[0].length - left[0].length);
}

export function renameIn(text: string, pairs: ReadonlyArray<[string, string]>): string {
  if (pairs.length === 0) return text;
  // One pass over the original text: a replacement is never renamed again.
  const pattern = new RegExp(pairs.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const targets = new Map(pairs);
  return text.replace(pattern, (match) => targets.get(match) ?? match);
}
