/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSealedSave } from '@nebula/link';
import { appsReadingSealedSaves, readSaveText, sealKnownBackups } from '../../src/electron/saves';
import type { CatalogApp } from '../../src/shared/catalog';
import type { InstalledView } from '../../src/shared/installed-view';

const APP = {
  id: 'nebula.sample',
  windows: { preOperationBackup: { argument: '--backup=', documentsFolder: 'Sample', filePrefix: 'sample-backup', format: 'finterest-backup-v1', sealedSince: '1.2.0' } },
} as unknown as CatalogApp;

function installed(version: string | null): InstalledView {
  return { state: 'ready', detectedAt: null, apps: version ? [{ appId: 'nebula.sample', version, scope: 'user', location: 'C:\\x', exeFound: true, running: false }] : [] };
}

describe('sealed saves in the Hub (ADR-040)', () => {
  it('seals backups only for apps whose installed version reads them back', () => {
    expect(appsReadingSealedSaves([APP], installed('1.2.0'))).toEqual([APP]);
    expect(appsReadingSealedSaves([APP], installed('1.1.9'))).toEqual([]);
    expect(appsReadingSealedSaves([APP], installed(null))).toEqual([]);
    const noSince = { ...APP, windows: { preOperationBackup: { ...APP.windows.preOperationBackup!, sealedSince: undefined } } } as unknown as CatalogApp;
    expect(appsReadingSealedSaves([noSince], installed('9.0.0'))).toEqual([]);
  });

  (process.platform === 'win32' ? it : it.skip)('seals the plain backups of Documents and the copy folder, and still reads them', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-saves-'));
    try {
      const keyFile = path.join(dir, 'save-key.json');
      const documents = path.join(dir, 'Documents');
      const copy = path.join(dir, 'Copy');
      for (const root of [path.join(documents, 'Sample'), path.join(copy, 'Sample')]) {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(path.join(root, 'sample-backup-1.json'), '{"app":"Sample","secret":"plain"}');
        fs.writeFileSync(path.join(root, 'notes.txt'), 'not a backup');
      }
      expect(await sealKnownBackups([APP], { documents, copy }, keyFile)).toBe(2);
      const file = path.join(documents, 'Sample', 'sample-backup-1.json');
      expect(isSealedSave(fs.readFileSync(file))).toBe(true);
      expect(fs.readFileSync(path.join(documents, 'Sample', 'notes.txt'), 'utf8')).toBe('not a backup');
      expect(await readSaveText(file, keyFile)).toBe('{"app":"Sample","secret":"plain"}');
      // Already sealed: nothing to do the second time.
      expect(await sealKnownBackups([APP], { documents, copy }, keyFile)).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
