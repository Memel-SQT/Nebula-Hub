import type { PreOperationBackup } from './catalog';

/**
 * Backup made by the app itself before an update, a repair or an uninstall (brief §7.6, ADR-016,
 * ADR-022). The Hub runs `"<exe>" <argument><file>`, then checks the file: Finterest swallows
 * every error and always exits with 0, so the exit code proves nothing.
 *
 * The check only looks at the **shape** of the file (which app, which format, a list of accounts
 * with a name and a snapshot) and counts the accounts; the Hub never keeps, shows or sends the
 * content (R07).
 */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export type BackupCheck = { ok: true; accounts: number } | { ok: false; reason: BackupProblem };
export type BackupProblem = 'missing' | 'empty' | 'too-large' | 'invalid' | 'unknown-format' | 'timeout' | 'not-started' | 'key-unknown';

/**
 * Why a backup file could not be read (ADR-040): a save sealed on another computer needs that
 * computer's recovery key (`key-unknown`, the user can add it), a file that vanished is `missing`,
 * anything else (damaged seal, unreadable bytes) is `invalid`.
 */
export function saveReadProblem(error: unknown): BackupProblem {
  if (error instanceof Error && error.message === 'ERR_SAVE_KEY_UNKNOWN') return 'key-unknown';
  if ((error as { code?: unknown } | null)?.code === 'ENOENT') return 'missing';
  return 'invalid';
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `finterest-store-backup-2026-10-01_21-15-03.json` (local time, sortable, never overwritten). */
export function backupFileName(prefix: string, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${prefix}-${date}_${time}.json`;
}

/** `<Documents>\<folder>\<file>`: every part was validated with the catalog. */
export function backupPath(documentsDir: string, backup: PreOperationBackup, now: Date): string {
  const base = documentsDir.replace(/[\\/]+$/, '');
  const sep = separatorOf(base);
  return `${base}${sep}${backup.documentsFolder}${sep}${backupFileName(backup.filePrefix, now)}`;
}

/**
 * The separator of the folder a path is built in: `\` for a Windows path (drive letter, UNC or any
 * backslash), `/` otherwise, so the same pure helpers give real paths in the tests on Linux and on
 * macOS instead of file names full of backslashes. Windows paths are unchanged.
 */
function separatorOf(dir: string): '\\' | '/' {
  return /^[A-Za-z]:|\\/.test(dir) ? '\\' : '/';
}

/**
 * The second copy (ADR-026): `<chosen folder>\<app folder>\<same file name>`. The file in
 * Documents stays the reference the app reads first; the copy is only a duplicate elsewhere.
 */
export function backupCopyPath(copyDir: string, backup: PreOperationBackup, file: string): string {
  const base = copyDir.replace(/[\\/]+$/, '');
  const name = file.split(/[\\/]/).pop() ?? file;
  const sep = separatorOf(base);
  return `${base}${sep}${backup.documentsFolder}${sep}${name}`;
}

/** Outcome of "Export my data" (a backup outside of any operation). */
export type ExportDataResult =
  | { ok: true; path: string; accounts: number; copyPath: string | null; copyState: 'ok' | 'failed' | null }
  | { ok: false; reason: BackupProblem | 'unsupported' | 'not-installed' | 'busy' };

/**
 * Outcome of "Import my data": the user picked a backup (the Hub only checks its shape, R07); the app
 * opens on its import screen when it declares an import switch (`launched`), otherwise the Hub
 * shows the file and the steps to follow in the app (`manual`).
 */
export type ImportDataResult =
  | { mode: 'launched' | 'manual'; file: string; accounts: number }
  | { mode: 'cancelled' }
  | { mode: 'invalid'; reason: BackupProblem }
  | { mode: 'unsupported' | 'not-installed' | 'busy' | 'failed' };

/** Outcome of "Download the installer". */
export type SaveInstallerResult = { ok: true; path: string } | { ok: false; reason: 'no-installer' | 'busy' | 'failed' };

/** Progress of a "Download the installer". */
export interface InstallerSaveProgress {
  appId: string;
  received: number;
  total: number;
}

/** The single command-line argument that asks the app for its backup. */
export function backupArgument(backup: PreOperationBackup, file: string): string {
  return `${backup.argument}${file}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** `finterest-backup-v1`: `{ app: 'Finterest', version: 1, exportedAt, accounts: [{ name, snapshot }] }`. */
export function validateBackup(format: PreOperationBackup['format'], text: string): BackupCheck {
  if (!text.trim()) return { ok: false, reason: 'empty' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const root = asRecord(value);
  if (format !== 'finterest-backup-v1' || !root) return { ok: false, reason: 'unknown-format' };
  if (root.app !== 'Finterest' || root.version !== 1 || typeof root.exportedAt !== 'string') return { ok: false, reason: 'unknown-format' };
  if (!Array.isArray(root.accounts)) return { ok: false, reason: 'invalid' };
  const wellFormed = root.accounts.every((account) => {
    const record = asRecord(account);
    return Boolean(record) && typeof record!.name === 'string' && Boolean(asRecord(record!.snapshot));
  });
  return wellFormed ? { ok: true, accounts: root.accounts.length } : { ok: false, reason: 'invalid' };
}
