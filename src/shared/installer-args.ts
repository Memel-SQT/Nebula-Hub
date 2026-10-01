import { isSafeFileName } from './latest-yml';
import type { OperationKind } from './install-state';

/**
 * NSIS installer arguments (ADR-004), as an `execFile` array — never a command line.
 *
 * - Fresh install: the catalog's `silentArgs` (allow-listed at validation, always including
 *   `/S`), then `/D=<folder>` **last and unquoted** (NSIS convention) only when the user chose a
 *   folder.
 * - Update and repair: exactly what electron-updater's `NsisUpdater` passes, `--updated /S`, so
 *   the old uninstaller runs in update mode and keeps the app data. Never `/D` there: the
 *   installer reads the existing `InstallLocation`.
 * - `--delete-app-data` is refused everywhere.
 */
export const FORBIDDEN_ARGUMENT = '--delete-app-data';

export function installerArguments(kind: OperationKind, silentArgs: readonly string[], directory: string | null): string[] {
  if (silentArgs.some((argument) => argument.toLowerCase().startsWith(FORBIDDEN_ARGUMENT))) {
    throw new Error('ERR_FORBIDDEN_INSTALLER_ARGUMENT');
  }
  if (kind !== 'install') {
    return ['--updated', '/S'];
  }
  const args = silentArgs.filter((argument) => !/^\/D=/i.test(argument));
  if (!args.some((argument) => argument.toUpperCase() === '/S')) {
    args.unshift('/S');
  }
  if (directory !== null) {
    if (!isSafeInstallDirectory(directory)) {
      throw new Error('ERR_UNSAFE_INSTALL_DIRECTORY');
    }
    args.push(`/D=${directory}`);
  }
  return args;
}

/**
 * A folder the Hub may pass to `/D=`: an absolute local path (`C:\…`), without quotes, `..`
 * segments, control or wildcard characters. NSIS takes the rest of the command line as the
 * folder, so anything odd here would end up inside the path.
 */
export function isSafeInstallDirectory(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 180 || !/^[A-Za-z]:\\/.test(value)) return false;
  // Control characters, forward slashes and the characters Windows refuses in a path.
  if (/["*?<>|/\u0000-\u001f]/.test(value) || value.slice(2).includes(':')) return false;
  const rest = value.slice(3);
  if (rest === '') return true;
  if (rest.endsWith('\\')) return false;
  // No empty, `.` or `..` segment, and none ending with a space or a dot (Windows drops them).
  return rest.split('\\').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !/[ .]$/.test(segment));
}

/** The folder an app goes into when the user picked a base folder: `<base>\<productName>`. */
export function installTarget(baseDirectory: string, productName: string): string {
  const base = baseDirectory.endsWith('\\') ? baseDirectory.slice(0, -1) : baseDirectory;
  return `${base}\\${productName}`;
}

/** The installer file name from latest.yml, re-checked before it becomes a path on disk (R11). */
export function isSafeInstallerName(value: unknown): value is string {
  return isSafeFileName(value) && value.toLowerCase().endsWith('.exe');
}
