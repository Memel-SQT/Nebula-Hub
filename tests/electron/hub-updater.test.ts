/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HubUpdater, type HubUpdaterDeps } from '../../src/electron/install/hub-updater';
import { DownloadError, verifyFile, type DownloadOptions } from '../../src/electron/net/download';
import type { CatalogEntry } from '../../src/shared/catalog-view';
import { hubEntry, type HubUpdateView } from '../../src/shared/hub-update';
import { entries } from '../renderer/fixtures';

const CONTENT = Buffer.from('MZ Nebula Hub 0.2.1 '.repeat(400));
const SHA512 = createHash('sha512').update(CONTENT).digest('base64');

function hub(): CatalogEntry {
  const entry = hubEntry(entries())!;
  return { ...entry, release: { version: '0.2.1', tag: 'v0.2.1', name: 'Nebula Hub 0.2.1', publishedAt: '2026-10-02T18:00:00Z', notes: '', prerelease: false, installer: { fileName: 'Nebula-Hub-Setup-0.2.1.exe', size: CONTENT.length, sha512: SHA512, url: 'https://github.com/Memel-SQT/Nebula-Hub/releases/download/v0.2.1/Nebula-Hub-Setup-0.2.1.exe' } } };
}

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-self-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const writes = (content: Buffer) => jest.fn(async (_url: string, part: string, options: DownloadOptions) => {
  await fs.writeFile(part, content);
  options.onProgress?.(content.length, content.length);
  return { resumed: false };
});

function updater(overrides: Partial<HubUpdaterDeps> = {}) {
  const deps: HubUpdaterDeps = {
    entry: () => hub(),
    currentVersion: '0.2.0',
    packaged: true,
    busy: () => false,
    download: writes(CONTENT),
    verify: verifyFile,
    workDir: path.join(root, 'hub'),
    launch: jest.fn(async () => undefined),
    quit: jest.fn(),
    busyPollMs: 5,
    ...overrides,
  };
  const instance = new HubUpdater(deps);
  const phases: string[] = [];
  instance.onChange((view) => phases.push(view.phase));
  /** Resolves on the first view in one of these phases. */
  const reach = (...wanted: string[]) => new Promise<HubUpdateView>((resolve) => {
    const off = instance.onChange((view) => {
      if (wanted.includes(view.phase)) {
        off();
        resolve(view);
      }
    });
  });
  return { instance, deps, phases, reach };
}

describe('HubUpdater (ADR-029)', () => {
  it('shows the newer version, and refuses to start without the user’s yes', () => {
    const { instance, deps } = updater();
    expect(instance.view()).toMatchObject({ current: '0.2.0', available: '0.2.1', size: CONTENT.length, phase: 'idle', blocked: null });
    expect(instance.start(false)).toBe('unconfirmed');
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('downloads, verifies, starts the installer detached with --updated /S --force-run, then quits', async () => {
    const { instance, deps, phases, reach } = updater();
    const restarting = reach('restarting');
    expect(instance.start(true)).toBe('started');
    await restarting;
    await new Promise((resolve) => setImmediate(resolve));
    const file = path.join(root, 'hub', 'Nebula-Hub-Setup-0.2.1.exe');
    expect(deps.launch).toHaveBeenCalledWith(file, ['--updated', '/S', '--force-run']);
    expect(deps.quit).toHaveBeenCalledTimes(1);
    expect((await fs.readFile(file)).equals(CONTENT)).toBe(true);
    expect(phases).toEqual(expect.arrayContaining(['downloading', 'verifying', 'restarting']));
    expect(instance.start(true)).toBe('in-progress');
  });

  it('never runs a file that does not match latest.yml (R02), and deletes it', async () => {
    const { instance, deps, reach } = updater({ download: writes(Buffer.from('tampered installer')) });
    const failed = reach('failed');
    instance.start(true);
    expect(await failed).toMatchObject({ failure: 'verify', blocked: null });
    expect(deps.launch).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
    expect(await fs.readdir(path.join(root, 'hub'))).toEqual([]);
  });

  it('reports a failed download and can be tried again', async () => {
    const download = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const { instance, deps, reach } = updater({ download });
    const failed = reach('failed');
    instance.start(true);
    expect(await failed).toMatchObject({ failure: 'download' });
    expect(deps.launch).not.toHaveBeenCalled();
    expect(instance.view().blocked).toBeNull();
  });

  it('waits for a running app operation before restarting', async () => {
    let busy = true;
    const { instance, deps, reach } = updater({ busy: () => busy });
    const waiting = reach('waiting');
    instance.start(true);
    await waiting;
    expect(deps.launch).not.toHaveBeenCalled();
    const restarting = reach('restarting');
    busy = false;
    await restarting;
    await new Promise((resolve) => setImmediate(resolve));
    expect(deps.launch).toHaveBeenCalled();
    expect(deps.quit).toHaveBeenCalled();
  });

  it('can be cancelled while it downloads: nothing is kept, nothing runs', async () => {
    const download = jest.fn((_url: string, part: string, options: DownloadOptions) => new Promise<{ resumed: boolean }>((resolve, reject) => {
      void fs.writeFile(part, 'partial');
      options.signal?.addEventListener('abort', () => reject(new DownloadError('cancelled')));
    }));
    const { instance, deps, reach } = updater({ download });
    const downloading = reach('downloading');
    instance.start(true);
    await downloading;
    const idle = reach('idle');
    expect(instance.cancel()).toBe(true);
    await idle;
    expect(deps.launch).not.toHaveBeenCalled();
    expect(await fs.readdir(path.join(root, 'hub'))).toEqual([]);
  });

  it('stays put if the installer cannot start', async () => {
    const { instance, deps, reach } = updater({ launch: jest.fn(async () => { throw new Error('ENOENT'); }) });
    const failed = reach('failed');
    instance.start(true);
    expect(await failed).toMatchObject({ failure: 'launch' });
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('never installs from a development build or a throwaway profile', () => {
    const { instance, deps } = updater({ packaged: false });
    expect(instance.view().blocked).toBe('not-packaged');
    expect(instance.start(true)).toBe('not-packaged');
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('has nothing to do when the running Hub is the latest', () => {
    const { instance } = updater({ currentVersion: '0.2.1' });
    expect(instance.view()).toMatchObject({ available: null, size: null, blocked: 'no-update' });
    expect(instance.start(true)).toBe('no-update');
  });
});
