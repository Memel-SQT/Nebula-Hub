import type { CatalogEntry } from './catalog-view';
import { isSafeInstallerName } from './installer-args';
import { isNewerVersion, isSemver } from './semver';

/**
 * The Hub updating itself (ADR-029). Same path as an app update: the installer of the catalog's
 * Hub release is downloaded from an allowed source and must match the size and SHA-512 of its
 * latest.yml (R02); then, after the user's yes, the Hub starts it detached and quits.
 *
 * - `downloading` / `verifying`: as for an app, cancellable.
 * - `waiting`: verified, but an app operation is still running; the Hub restarts once it ends.
 * - `restarting`: the installer is started, the Hub is quitting.
 * - `failed`: says why; "Update" can be tried again.
 */
export type HubUpdatePhase = 'idle' | 'downloading' | 'verifying' | 'waiting' | 'restarting' | 'failed';

/** Why the update cannot start now. */
export type HubUpdateBlocker = 'no-update' | 'no-installer' | 'not-packaged' | 'in-progress';

export type HubUpdateFailure = 'download' | 'verify' | 'launch';

export interface HubUpdateView {
  /** The running Hub. */
  current: string;
  /** A newer release from the catalog's Hub entry, or null. */
  available: string | null;
  /** Installer size in bytes, when an update is available. */
  size: number | null;
  phase: HubUpdatePhase;
  received: number;
  total: number;
  failure: HubUpdateFailure | null;
  /** Null when "Update" can be used now. */
  blocked: HubUpdateBlocker | null;
}

export type HubUpdateStartResult = 'started' | HubUpdateBlocker | 'unconfirmed';

/**
 * Arguments of the Hub's own installer: an update (`--updated /S`, ADR-004, keeps the data, never
 * `/D`), plus `--force-run` so the one-click NSIS installer starts the new Hub when it is done
 * (what electron-updater passes for "restart after update").
 */
export const HUB_UPDATE_ARGUMENTS: readonly string[] = ['--updated', '/S', '--force-run'];

/** The catalog entry of the Hub itself (`role: 'hub'`). */
export function hubEntry(entries: readonly CatalogEntry[]): CatalogEntry | undefined {
  return entries.find((entry) => entry.app.role === 'hub');
}

/** The release version when it is strictly newer than the running Hub, else null. */
export function availableHubVersion(entry: CatalogEntry | undefined, current: string): string | null {
  const release = entry?.release?.version;
  if (!release || !isSemver(release) || !isSemver(current)) return null;
  return isNewerVersion(release, current) ? release : null;
}

/** Why "Update" is unavailable (null: it can start), from the entry, the phase and the build. */
export function hubUpdateBlocker(entry: CatalogEntry | undefined, current: string, phase: HubUpdatePhase, packaged: boolean): HubUpdateBlocker | null {
  if (phase === 'downloading' || phase === 'verifying' || phase === 'waiting' || phase === 'restarting') return 'in-progress';
  if (!availableHubVersion(entry, current)) return 'no-update';
  const installer = entry?.release?.installer;
  if (!installer || !isSafeInstallerName(installer.fileName)) return 'no-installer';
  // A development build or a throwaway data folder would replace the real installed Hub.
  if (!packaged) return 'not-packaged';
  return null;
}

/** True while the update runs (the buttons show progress instead of "Update"). */
export function isHubUpdating(phase: HubUpdatePhase): boolean {
  return phase === 'downloading' || phase === 'verifying' || phase === 'waiting' || phase === 'restarting';
}

export const EMPTY_HUB_UPDATE_VIEW: HubUpdateView = {
  current: '0.0.0',
  available: null,
  size: null,
  phase: 'idle',
  received: 0,
  total: 0,
  failure: null,
  blocked: 'no-update',
};
