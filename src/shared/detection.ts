import type { CatalogApp } from './catalog';
import { regString, type RegKey } from './reg-file';
import { isSemver } from './semver';

/**
 * Detection of installed Nebula apps from the registry (brief §7.1, ADR-003): pure functions over
 * the parsed `reg export` output. Matching uses the catalog's `productName` against
 * `DisplayName` (electron-builder writes `<productName> <version>`), never hard-coded GUIDs.
 * `InstallLocation` lives in `Software\<uninstall key name>`, not in the Uninstall key.
 */
export type Hive = 'HKCU' | 'HKLM';

export interface UninstallEntry {
  hive: Hive;
  /** Name of the Uninstall subkey (electron-builder: UUIDv5 of the appId). */
  keyName: string;
  displayName: string;
  displayVersion: string | null;
  uninstallString: string | null;
  quietUninstallString: string | null;
  displayIcon: string | null;
  publisher: string | null;
}

const UNINSTALL_PATH = /^HKEY_(CURRENT_USER|LOCAL_MACHINE)\\Software\\(?:WOW6432Node\\)?Microsoft\\Windows\\CurrentVersion\\Uninstall\\([^\\]+)$/i;

/** Direct subkeys of an exported Uninstall tree that carry a DisplayName. */
export function uninstallEntries(keys: RegKey[]): UninstallEntry[] {
  const entries: UninstallEntry[] = [];
  for (const key of keys) {
    const match = UNINSTALL_PATH.exec(key.path);
    const displayName = regString(key, 'DisplayName');
    if (!match || !displayName) continue;
    entries.push({
      hive: match[1].toUpperCase() === 'CURRENT_USER' ? 'HKCU' : 'HKLM',
      keyName: match[2],
      displayName: displayName.trim(),
      displayVersion: regString(key, 'DisplayVersion')?.trim() || null,
      uninstallString: regString(key, 'UninstallString'),
      quietUninstallString: regString(key, 'QuietUninstallString'),
      displayIcon: regString(key, 'DisplayIcon'),
      publisher: regString(key, 'Publisher'),
    });
  }
  return entries;
}

/** `DisplayName` is the product name, alone or followed by a space (and the version). */
export function matchesProduct(displayName: string, productName: string): boolean {
  return displayName === productName || displayName.startsWith(`${productName} `);
}

/**
 * The registry entry of a catalog app: per-user first (the family installs per user), then
 * per-machine. Null when the app is not registered.
 */
export function findEntry(app: CatalogApp, entries: UninstallEntry[]): UninstallEntry | null {
  const matches = entries.filter((entry) => matchesProduct(entry.displayName, app.windows.productName));
  return matches.find((entry) => entry.hive === 'HKCU') ?? matches[0] ?? null;
}

/** The executable of a command line: the quoted path, or everything up to `.exe`. */
export function executableOf(command: string | null): string | null {
  if (!command) return null;
  const trimmed = command.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 1 ? trimmed.slice(1, end) : null;
  }
  const match = /^(.+?\.exe)(?:\s|$)/i.exec(trimmed);
  return match ? match[1] : null;
}

/** Parent folder of a Windows path (no Node `path` here: this module also runs in tests). */
export function parentFolder(windowsPath: string): string {
  const index = windowsPath.replace(/[\\/]+$/, '').search(/[\\/][^\\/]*$/);
  return index > 0 ? windowsPath.slice(0, index) : windowsPath;
}

/** `InstallLocation` from `Software\<key>`, else the folder of the uninstaller. */
export function installLocation(entry: UninstallEntry, installKeyLocation: string | null): string | null {
  const location = installKeyLocation?.trim();
  if (location) return location.replace(/[\\/]+$/, '');
  const uninstaller = executableOf(entry.uninstallString) ?? executableOf(entry.quietUninstallString);
  return uninstaller ? parentFolder(uninstaller) : null;
}

/** The installed version when it is a usable semantic version. */
export function installedVersion(entry: UninstallEntry): string | null {
  return entry.displayVersion && isSemver(entry.displayVersion) ? entry.displayVersion : null;
}
