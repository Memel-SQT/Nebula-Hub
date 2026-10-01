import type { CatalogEntry, CatalogView } from '@shared/catalog-view';
import { isActive, type DownloadsView, type OperationView } from '@shared/install-state';
import { updateAvailable, type InstalledApp, type InstalledView } from '@shared/installed-view';
import type { LoadState } from './components/ScreenState';

/** The family apps (everything but the Hub's own entry, which only shows in My apps). */
export function familyEntries(view: CatalogView): CatalogEntry[] {
  return view.entries.filter((entry) => entry.app.role !== 'hub');
}

export function findEntry(view: CatalogView, appId: string): CatalogEntry | undefined {
  return view.entries.find((entry) => entry.app.id === appId);
}

/** Screen state for a catalog-driven screen (brief §9: loading / empty / offline / error). */
export function catalogLoadState(view: CatalogView): LoadState {
  if (view.state === 'loading') return 'loading';
  if (view.state === 'error') return 'error';
  if (familyEntries(view).length === 0) return 'empty';
  return view.state === 'offline' ? 'offline' : 'ready';
}

export function installedOf(view: InstalledView | undefined, appId: string): InstalledApp | undefined {
  return view?.apps.find((app) => app.appId === appId);
}

/** Installed family apps (not the Hub) and how many have an update. */
export function installedSummary(catalog: CatalogView, installed: InstalledView | undefined): { installed: number; updates: number } {
  const family = familyEntries(catalog);
  const found = family.map((entry) => ({ entry, app: installedOf(installed, entry.app.id) })).filter((pair) => pair.app);
  return { installed: found.length, updates: found.filter((pair) => updateAvailable(pair.entry, pair.app)).length };
}

/** The operation shown for an app: the running one, else its last finished one (until dismissed). */
export function operationOf(downloads: DownloadsView | undefined, appId: string): OperationView | undefined {
  const operations = downloads?.operations.filter((operation) => operation.appId === appId) ?? [];
  return operations.find((operation) => isActive(operation.phase)) ?? operations[operations.length - 1];
}

/** The Hub can install this app now: published Windows installer, not the Hub, Hub recent enough. */
export function installable(entry: CatalogEntry): boolean {
  return entry.app.role !== 'hub' && Boolean(entry.release?.installer) && !entry.requiresNewerHub;
}

/** Brief 7.4: the SmartScreen line is shown until the first successful install. */
export function hasInstalledOnce(downloads: DownloadsView | undefined): boolean {
  return Boolean(downloads?.history.some((entry) => entry.outcome === 'success'));
}
