import type { CatalogApp } from './catalog';
import type { InstalledApp } from './installed-view';
import { compareSemver, isSemver } from './semver';

/**
 * Extensions kept running in the background by the Hub (ADR-034), e.g. Nebula News, whose
 * articles appear in the other apps. Pure rules; `apps/extension-keeper.ts` applies them.
 */

/** A start counts as "in progress" this long: the process list may not show the app yet. */
export const STARTING_MS = 30_000;
/** At most this many background starts of one extension in `START_WINDOW_MS` (no crash loop). */
export const MAX_STARTS = 3;
export const START_WINDOW_MS = 10 * 60_000;

export type BackgroundStartBlocker = 'not-extension' | 'not-installed' | 'running' | 'too-old' | 'busy' | 'starting' | 'too-many-starts';

/** Why the Hub does not start this extension in the background now (null: start it). */
export function backgroundStartBlocker(app: CatalogApp, installed: InstalledApp | undefined, recentStarts: readonly number[], now: number, busy: boolean): BackgroundStartBlocker | null {
  if (!app.extension) return 'not-extension';
  if (!installed?.exeFound) return 'not-installed';
  if (installed.running) return 'running';
  // An older version would open its window at every start of the Hub instead of staying hidden.
  if (!installed.version || !isSemver(installed.version) || compareSemver(installed.version, app.extension.minVersion) < 0) return 'too-old';
  if (busy) return 'busy';
  const recent = recentStarts.filter((at) => now - at < START_WINDOW_MS);
  if (recent.some((at) => now - at < STARTING_MS)) return 'starting';
  if (recent.length >= MAX_STARTS) return 'too-many-starts';
  return null;
}

/** Extensions open inside the Hub, never in their own window, while the Hub runs. */
export function isExtension(app: Pick<CatalogApp, 'extension'> | undefined): boolean {
  return Boolean(app?.extension);
}
