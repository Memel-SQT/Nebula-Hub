/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freeName, saveInstaller } from '../../src/electron/install/save-installer';
import { verifyFile, type DownloadOptions } from '../../src/electron/net/download';

const CONTENT = Buffer.from('MZ verified installer '.repeat(500));
const SHA512 = createHash('sha512').update(CONTENT).digest('base64');
const ASSET = { url: 'https://github.com/Memel-SQT/nebula-clock/releases/download/v1.1.3/x.exe', fileName: 'Nebula-Clock-Setup-1.1.3.exe', size: CONTENT.length, sha512: SHA512 };

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-save-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const download = (content: Buffer) => async (_url: string, part: string, options: DownloadOptions) => {
  await fs.writeFile(part, content);
  options.onProgress?.(content.length, content.length);
  return { resumed: false };
};

describe('saveInstaller', () => {
  it('downloads, verifies and copies the installer next to the others, never overwriting', async () => {
    const deps = { download: download(CONTENT), verify: verifyFile, workDir: path.join(root, 'work') };
    const target = path.join(root, 'Downloads');
    const first = await saveInstaller(deps, ASSET, target);
    const second = await saveInstaller(deps, ASSET, target);
    expect(path.basename(first)).toBe('Nebula-Clock-Setup-1.1.3.exe');
    expect(path.basename(second)).toBe('Nebula-Clock-Setup-1.1.3 (2).exe');
    expect((await fs.readFile(second)).equals(CONTENT)).toBe(true);
    expect(await fs.readdir(path.join(root, 'work', 'saved'))).toEqual([]);
  });

  it('copies nothing when the file does not match the release (R02)', async () => {
    const deps = { download: download(Buffer.from('tampered')), verify: verifyFile, workDir: path.join(root, 'work') };
    await expect(saveInstaller(deps, ASSET, path.join(root, 'Downloads'))).rejects.toMatchObject({ code: 'size-mismatch' });
    await expect(fs.readdir(path.join(root, 'Downloads'))).rejects.toThrow();
  });

  it('refuses an unsafe file name', async () => {
    const deps = { download: download(CONTENT), verify: verifyFile, workDir: path.join(root, 'work') };
    await expect(saveInstaller(deps, { ...ASSET, fileName: '..\\evil.exe' }, root)).rejects.toThrow('ERR_UNSAFE_INSTALLER_NAME');
  });

  it('finds a free name', async () => {
    const taken = new Set([path.join('D:', 'a.exe'), path.join('D:', 'a (2).exe')]);
    expect(await freeName('D:', 'a.exe', async (file) => taken.has(file))).toBe(path.join('D:', 'a (3).exe'));
  });
});
