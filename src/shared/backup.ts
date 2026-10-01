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
export type BackupProblem = 'missing' | 'empty' | 'too-large' | 'invalid' | 'unknown-format' | 'timeout' | 'not-started';

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
  return `${base}\\${backup.documentsFolder}\\${backupFileName(backup.filePrefix, now)}`;
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
