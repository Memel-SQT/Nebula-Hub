import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultSaveKeyFile, importRecoveryCode, loadSaveKeyring, openSave, isSealedSave, recoveryCode, sealFileInPlace, type SaveKeyring } from '@nebula/link';
import type { CatalogApp } from '../shared/catalog';
import type { InstalledView } from '../shared/installed-view';
import { compareSemver } from '../shared/semver';

/**
 * Sealed saves in the Hub (ADR-040, NEBULA_LINK.md § 19): the family's save key, the backups the
 * Hub checks before an operation (R04) opened with it, and the retroactive sealing of the plain
 * backups it knows about. A throwaway data folder gets its own key file.
 */
let keyring: Promise<SaveKeyring> | null = null;

export function saveKeyFile(env: NodeJS.ProcessEnv, userData: string): string {
  return env.NEBULA_HUB_USER_DATA_DIR ? path.join(userData, 'link', 'save-key.json') : defaultSaveKeyFile();
}

export function saveKeyring(file: string): Promise<SaveKeyring> {
  keyring ??= loadSaveKeyring({ file }).catch((error) => {
    keyring = null;
    throw error;
  });
  return keyring;
}

/** The text of a save, sealed or (older) plain; throws when a sealed one cannot be opened. */
export async function readSaveText(file: string, keyFile: string): Promise<string> {
  const bytes = await fs.readFile(file);
  return isSealedSave(bytes) ? openSave(bytes, await saveKeyring(keyFile)).plain.toString('utf8') : bytes.toString('utf8');
}

export async function saveRecoveryCode(keyFile: string): Promise<string> {
  return recoveryCode(await saveKeyring(keyFile));
}

export async function importSaveRecoveryCode(code: string, keyFile: string): Promise<boolean> {
  const added = await importRecoveryCode(code, { file: keyFile });
  if (added) keyring = null;
  return added;
}

/** The apps whose installed version reads sealed saves (catalog `sealedSince`): only their backups are sealed. */
export function appsReadingSealedSaves(apps: readonly CatalogApp[], installed: InstalledView): CatalogApp[] {
  return apps.filter((app) => {
    const since = app.windows.preOperationBackup?.sealedSince;
    const version = installed.apps.find((candidate) => candidate.appId === app.id)?.version;
    return Boolean(since && version && compareSemver(version, since) >= 0);
  });
}

/**
 * Seals, where they are, the plain backups of the apps that back up their data
 * (`Documents\<app folder>` and the copy folder): the update protects older files too. Only for
 * apps that can read them back (`appsReadingSealedSaves`). Returns how many were sealed; never throws.
 */
export async function sealKnownBackups(apps: readonly CatalogApp[], folders: { documents: string; copy: string | null }, keyFile: string): Promise<number> {
  let sealed = 0;
  let ring: SaveKeyring;
  try {
    ring = await saveKeyring(keyFile);
  } catch {
    return 0;
  }
  for (const app of apps) {
    const backup = app.windows.preOperationBackup;
    if (!backup) continue;
    const roots = [path.join(folders.documents, backup.documentsFolder)];
    if (folders.copy) roots.push(path.join(folders.copy, backup.documentsFolder));
    for (const root of roots) {
      let names: string[];
      try {
        names = await fs.readdir(root);
      } catch {
        continue;
      }
      for (const name of names.filter((candidate) => candidate.toLowerCase().endsWith('.json'))) {
        if (sealFileInPlace(path.join(root, name), ring, { app: app.id, kind: 'backup' })) sealed += 1;
      }
    }
  }
  return sealed;
}
