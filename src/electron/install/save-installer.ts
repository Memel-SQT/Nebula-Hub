import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeInstallerName } from '../../shared/installer-args';
import type { Downloader } from '../net/download';

/**
 * "Download the installer" (user request, ADR-026): the same download and the same checks as an
 * install (allowlist on every hop, size cap, SHA-512 of the release), then the verified file is
 * copied to a folder of the user's (Downloads by default) to install the app on its own, later or
 * on another computer. Nothing is run.
 */
export interface SaveInstallerDeps {
  download: Downloader;
  verify(filePath: string, size: number, sha512: string): Promise<void>;
  /** The Hub's own work folder; the file is only checked there, never run. */
  workDir: string;
}

export interface InstallerAsset {
  url: string;
  fileName: string;
  size: number;
  sha512: string;
}

/** `name.exe`, else `name (2).exe`, `name (3).exe`…: an existing file is never overwritten. */
export async function freeName(dir: string, fileName: string, exists: (file: string) => Promise<boolean>): Promise<string> {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = path.join(dir, index === 1 ? fileName : `${stem} (${index})${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('ERR_NO_FREE_NAME');
}

export async function saveInstaller(deps: SaveInstallerDeps, asset: InstallerAsset, targetDir: string, options: { signal?: AbortSignal; onProgress?: (received: number, total: number) => void } = {}): Promise<string> {
  if (!isSafeInstallerName(asset.fileName)) throw new Error('ERR_UNSAFE_INSTALLER_NAME');
  const work = path.join(deps.workDir, 'saved');
  await fs.mkdir(work, { recursive: true });
  // A partial download stays for a later resume; a file that fails its check is deleted by verify.
  const part = path.join(work, `${asset.fileName}.part`);
  await deps.download(asset.url, part, { expectedSize: asset.size, signal: options.signal, onProgress: options.onProgress });
  await deps.verify(part, asset.size, asset.sha512);
  await fs.mkdir(targetDir, { recursive: true });
  const target = await freeName(targetDir, asset.fileName, (file) => fs.stat(file).then(() => true, () => false));
  await fs.copyFile(part, target);
  await fs.rm(part, { force: true });
  return target;
}
