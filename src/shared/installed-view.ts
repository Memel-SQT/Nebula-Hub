import type { CatalogEntry } from './catalog-view';
import type { Hive } from './detection';
import { isNewerVersion, isSemver } from './semver';

/** What the renderer knows about an installed app (uninstall commands stay in the main process). */
export interface InstalledApp {
  appId: string;
  /** `DisplayVersion` as registered; null if missing or not a semantic version. */
  version: string | null;
  scope: 'user' | 'machine';
  location: string;
  /** The executable exists at `location\exeName`; false means a broken install. */
  exeFound: boolean;
  running: boolean;
}

export interface InstalledView {
  state: 'loading' | 'ready' | 'error';
  apps: InstalledApp[];
  detectedAt: string | null;
}

export const EMPTY_INSTALLED_VIEW: InstalledView = { state: 'loading', apps: [], detectedAt: null };

export function scopeOf(hive: Hive): InstalledApp['scope'] {
  return hive === 'HKCU' ? 'user' : 'machine';
}

/** Brief 7.5: an update exists only when the release is strictly newer than `DisplayVersion`. */
export function updateAvailable(entry: CatalogEntry | undefined, installed: InstalledApp | undefined): boolean {
  const release = entry?.release?.version;
  if (!release || !installed?.version || !isSemver(release)) return false;
  return isNewerVersion(release, installed.version);
}

export type LaunchResult = 'launched' | 'not-installed' | 'missing-exe' | 'is-hub' | 'failed';
