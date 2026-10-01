/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InstallManager, type InstallManagerDeps } from '../../src/electron/install/install-manager';
import { spawnInstallerRunner, type InstallerResult } from '../../src/electron/install/installer-runner';
import { DownloadError, verifyFile, type DownloadOptions } from '../../src/electron/net/download';
import { NetError } from '../../src/electron/net/http';
import type { CatalogEntry } from '../../src/shared/catalog-view';
import type { DownloadsView, HistoryEntry, InstallPhase } from '../../src/shared/install-state';
import type { InstalledApp, InstalledView } from '../../src/shared/installed-view';
import { entries } from '../renderer/fixtures';

const CONTENT = Buffer.from('MZ fake Nebula installer '.repeat(2000));
const SHA512 = createHash('sha512').update(CONTENT).digest('base64');
const FILE_NAME = 'Nebula-Finterest-Setup-0.1.36.exe';

function finterest(patch: Partial<CatalogEntry> = {}, installer: Partial<NonNullable<NonNullable<CatalogEntry['release']>['installer']>> = {}): CatalogEntry {
  const base = entries().find((entry) => entry.app.id === 'nebula.finterest')!;
  return {
    ...base,
    release: { ...base.release!, version: '0.1.36', installer: { fileName: FILE_NAME, size: CONTENT.length, sha512: SHA512, url: 'https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.36/x.exe', ...installer } },
    ...patch,
  };
}

function clock(): CatalogEntry {
  const base = entries().find((entry) => entry.app.id === 'nebula.clock')!;
  return { ...base, release: { version: '1.1.3', tag: 'v1.1.3', name: 'Clock', publishedAt: '2026-10-01T00:00:00Z', notes: '', prerelease: false, installer: { fileName: 'Nebula-Clock-Setup-1.1.3.exe', size: CONTENT.length, sha512: SHA512, url: 'https://github.com/Memel-SQT/nebula-clock/releases/download/v1.1.3/x.exe' } }, releaseIssue: null };
}

interface Harness {
  manager: InstallManager;
  deps: InstallManagerDeps;
  phases: Map<string, InstallPhase[]>;
  installed: InstalledApp[];
  running: Set<string>;
  runs: Array<{ installer: string; args: readonly string[] }>;
  history: HistoryEntry[];
  downloadsDir: string;
  /** What the fake installer does: install a version (or not) and return a result. */
  installerBehaviour: { version: string | null; result: InstallerResult | Error };
  downloadBehaviour: (part: string, options: DownloadOptions) => Promise<{ resumed: boolean }>;
}

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-install-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const writeFull = async (part: string, options: DownloadOptions) => {
  options.onProgress?.(0, CONTENT.length);
  await fs.writeFile(part, CONTENT);
  options.onProgress?.(CONTENT.length, CONTENT.length);
  return { resumed: false };
};

function harness(catalog: CatalogEntry[] = [finterest(), clock()], overrides: Partial<InstallManagerDeps> = {}): Harness {
  const h = {
    phases: new Map<string, InstallPhase[]>(),
    installed: [] as InstalledApp[],
    running: new Set<string>(),
    runs: [] as Array<{ installer: string; args: readonly string[] }>,
    history: [] as HistoryEntry[],
    downloadsDir: path.join(root, 'downloads'),
    installerBehaviour: { version: '0.1.36' as string | null, result: { kind: 'exit', code: 0 } as InstallerResult | Error },
    downloadBehaviour: writeFull,
  } as Harness;
  const view = (): InstalledView => ({ state: 'ready', apps: h.installed.map((app) => ({ ...app })), detectedAt: '2026-10-01T10:00:00Z' });
  h.deps = {
    entry: (appId) => catalog.find((entry) => entry.app.id === appId),
    installedView: view,
    detect: async () => view(),
    runningProcesses: async () => new Set(h.running),
    download: (_url, part, options) => h.downloadBehaviour(part, options),
    verify: verifyFile,
    runner: {
      run: async (installer, args) => {
        h.runs.push({ installer, args });
        // The installer must exist and be the verified file when it runs.
        expect((await fs.readFile(installer)).equals(CONTENT)).toBe(true);
        const behaviour = h.installerBehaviour;
        if (behaviour.version) {
          const appId = catalog.find((entry) => installer.includes(entry.release!.installer!.fileName))!.app.id;
          h.installed = h.installed.filter((app) => app.appId !== appId);
          h.installed.push({ appId, version: behaviour.version, scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\x', exeFound: true, running: false });
        }
        if (behaviour.result instanceof Error) throw behaviour.result;
        return behaviour.result;
      },
    },
    history: {
      add: async (entry) => {
        h.history.unshift({ ...entry, id: h.history.length + 1 });
      },
      list: () => h.history,
    },
    downloadsDir: h.downloadsDir,
    installDirectory: () => null,
    appExitPollMs: 10,
    progressIntervalMs: 0,
    ...overrides,
  };
  h.manager = new InstallManager(h.deps);
  h.manager.onChange((downloads: DownloadsView) => {
    for (const operation of downloads.operations) {
      const list = h.phases.get(operation.appId) ?? [];
      if (list[list.length - 1] !== operation.phase) list.push(operation.phase);
      h.phases.set(operation.appId, list);
    }
  });
  return h;
}

const exists = (file: string) => fs.stat(file).then(() => true, () => false);
const operationOf = (h: Harness, appId: string) => h.manager.getView().operations.find((operation) => operation.appId === appId)!;

describe('InstallManager', () => {
  it('downloads, verifies, installs silently and confirms the version', async () => {
    const h = harness();
    expect(h.manager.enqueue('nebula.finterest')).toBe('queued');
    await h.manager.idle();

    expect(h.phases.get('nebula.finterest')).toEqual(['queued', 'downloading', 'verifying', 'ready', 'installing', 'verifying-install', 'installed']);
    expect(h.runs).toEqual([{ installer: path.join(h.downloadsDir, FILE_NAME), args: ['/S'] }]);
    expect(await exists(path.join(h.downloadsDir, FILE_NAME))).toBe(false);
    expect(h.history[0]).toMatchObject({ appId: 'nebula.finterest', kind: 'install', version: '0.1.36', outcome: 'success', failure: null });
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'installed', received: CONTENT.length, total: CONTENT.length });
  });

  it('installs into the folder chosen in the settings, one folder per app', async () => {
    const h = harness(undefined, { installDirectory: () => 'D:\\Apps' });
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(h.runs[0].args).toEqual(['/S', '/D=D:\\Apps\\Nebula Finterest']);
  });

  it.each([
    ['unknown-app', 'nebula.nope', [finterest()]],
    ['is-hub', 'nebula.hub', entries()],
    ['no-installer', 'nebula.finterest', [finterest({}, { fileName: '..\\evil.exe' })]],
    ['no-installer', 'nebula.finterest', [{ ...finterest(), release: null }]],
    ['requires-newer-hub', 'nebula.finterest', [finterest({ requiresNewerHub: true })]],
  ] as const)('refuses %s', (result, appId, catalog) => {
    const h = harness([...catalog]);
    expect(h.manager.enqueue(appId)).toBe(result);
    expect(h.manager.getView().operations).toEqual([]);
  });

  it('does not install an app that is already installed, nor twice', async () => {
    const h = harness();
    h.installed.push({ appId: 'nebula.clock', version: '1.1.3', scope: 'user', location: 'C:\\x', exeFound: true, running: false });
    expect(h.manager.enqueue('nebula.clock')).toBe('already-installed');
    expect(h.manager.enqueue('nebula.finterest')).toBe('queued');
    expect(h.manager.enqueue('nebula.finterest')).toBe('already-queued');
    await h.manager.idle();
  });

  it('never runs an installer whose SHA-512 does not match (R02)', async () => {
    const h = harness();
    h.downloadBehaviour = async (part) => {
      const copy = Buffer.from(CONTENT);
      copy[10] ^= 1;
      await fs.writeFile(part, copy);
      return { resumed: false };
    };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'hash-mismatch' });
    expect(h.runs).toEqual([]);
    expect(await exists(path.join(h.downloadsDir, `${FILE_NAME}.part`))).toBe(false);
    expect(h.history[0]).toMatchObject({ outcome: 'failed', failure: 'hash-mismatch' });
  });

  it('keeps the partial file after a network cut, and the retry resumes it', async () => {
    const h = harness();
    h.downloadBehaviour = async (part) => {
      await fs.writeFile(part, CONTENT.subarray(0, 1000));
      throw new NetError('ERR_NET_OFFLINE');
    };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'offline' });
    expect((await fs.stat(path.join(h.downloadsDir, `${FILE_NAME}.part`))).size).toBe(1000);

    h.downloadBehaviour = async (part) => {
      const kept = (await fs.stat(part)).size;
      await fs.appendFile(part, CONTENT.subarray(kept));
      return { resumed: kept > 0 };
    };
    expect(h.manager.enqueue('nebula.finterest')).toBe('queued');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'installed', resumed: true });
    expect(h.manager.getView().operations).toHaveLength(1);
  });

  it.each([
    ['offline', new NetError('ERR_NET_OFFLINE'), null],
    ['timeout', new NetError('ERR_NET_TIMEOUT'), null],
    ['blocked', new NetError('ERR_NET_BLOCKED'), null],
    ['http', new NetError('ERR_NET_STATUS', { status: 404 }), '404'],
    ['rate-limited', new NetError('ERR_NET_RATE_LIMITED'), null],
    ['size-mismatch', new DownloadError('size-mismatch'), null],
    ['disk', new DownloadError('disk', 'ENOSPC'), 'ENOSPC'],
  ] as const)('explains a download failure: %s', async (reason, error, detail) => {
    const h = harness();
    h.downloadBehaviour = async () => {
      throw error;
    };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: reason, failureDetail: detail });
    expect(h.runs).toEqual([]);
  });

  it('reports an installer that fails and installs nothing', async () => {
    const h = harness();
    h.installerBehaviour = { version: null, result: { kind: 'exit', code: 2 } };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'installer-exit', failureDetail: '2' });
    // Kept for a retry in this session (verified again before use), purged at the next start.
    expect(await exists(path.join(h.downloadsDir, FILE_NAME))).toBe(true);
  });

  it('trusts the registry over the exit code (ADR-004)', async () => {
    const h = harness();
    h.installerBehaviour = { version: '0.1.36', result: { kind: 'exit', code: 1 } };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
  });

  it('reports an installer that takes too long, without killing it', async () => {
    const h = harness();
    h.installerBehaviour = { version: null, result: { kind: 'timeout' } };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'installer-timeout' });
  });

  it('reports an installer that could not start', async () => {
    const h = harness();
    h.installerBehaviour = { version: null, result: Object.assign(new Error('blocked'), { code: 'EACCES' }) };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'installer-exit', failureDetail: 'EACCES' });
  });

  it('notices when the app is not found after a clean exit', async () => {
    const h = harness();
    h.installerBehaviour = { version: null, result: { kind: 'exit', code: 0 } };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').failure).toBe('not-detected');
  });

  it('notices when another version got installed', async () => {
    const h = harness();
    h.installerBehaviour = { version: '0.1.35', result: { kind: 'exit', code: 0 } };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ failure: 'version-mismatch', failureDetail: '0.1.35' });
  });

  it('waits for the user to close the app, and never closes it (R08)', async () => {
    const h = harness();
    h.running.add('nebula finterest.exe');
    h.manager.enqueue('nebula.finterest');
    for (let i = 0; i < 100 && operationOf(h, 'nebula.finterest').phase !== 'waiting-for-app-exit'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(operationOf(h, 'nebula.finterest').phase).toBe('waiting-for-app-exit');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.runs).toEqual([]);

    h.running.clear();
    await h.manager.idle();
    expect(h.phases.get('nebula.finterest')).toEqual(['queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'installed']);
  });

  it('cancels while waiting for the app to close', async () => {
    const h = harness();
    h.running.add('nebula finterest.exe');
    h.manager.enqueue('nebula.finterest');
    for (let i = 0; i < 100 && operationOf(h, 'nebula.finterest').phase !== 'waiting-for-app-exit'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(h.manager.cancel(operationOf(h, 'nebula.finterest').id)).toBe(true);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('cancelled');
    expect(h.runs).toEqual([]);
    expect(await exists(path.join(h.downloadsDir, FILE_NAME))).toBe(false);
  });

  it('cancels a download and removes the partial file', async () => {
    const h = harness();
    h.downloadBehaviour = (part, options) => new Promise((resolve, reject) => {
      void fs.writeFile(part, CONTENT.subarray(0, 500)).then(() => options.onProgress?.(500, CONTENT.length));
      options.signal?.addEventListener('abort', () => reject(new DownloadError('cancelled')));
    });
    h.manager.enqueue('nebula.finterest');
    for (let i = 0; i < 100 && operationOf(h, 'nebula.finterest').received < 500; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(h.manager.cancel(operationOf(h, 'nebula.finterest').id)).toBe(true);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('cancelled');
    expect(await exists(path.join(h.downloadsDir, `${FILE_NAME}.part`))).toBe(false);
    expect(h.history[0]).toMatchObject({ outcome: 'cancelled' });
    expect(h.runs).toEqual([]);
  });

  it('runs one operation at a time, and can cancel one still waiting in the queue', async () => {
    const h = harness();
    let release: () => void = () => undefined;
    let active = 0;
    let maxActive = 0;
    h.downloadBehaviour = async (part, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (path.basename(part).startsWith('Nebula-Finterest')) await new Promise<void>((resolve) => { release = resolve; });
      const result = await writeFull(part, options);
      active -= 1;
      return result;
    };
    h.manager.enqueue('nebula.finterest');
    h.manager.enqueue('nebula.clock');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(operationOf(h, 'nebula.clock').phase).toBe('queued');
    expect(h.manager.cancel(operationOf(h, 'nebula.clock').id)).toBe(true);
    expect(operationOf(h, 'nebula.clock').phase).toBe('cancelled');
    release();
    await h.manager.idle();
    expect(maxActive).toBe(1);
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
    expect(h.runs).toHaveLength(1);
  });

  it('never cancels a running installer', async () => {
    const h = harness();
    let finish: () => void = () => undefined;
    h.deps.runner = {
      run: () => new Promise((resolve) => {
        finish = () => resolve({ kind: 'exit', code: 0 });
      }),
    };
    h.manager.enqueue('nebula.finterest');
    for (let i = 0; i < 100 && operationOf(h, 'nebula.finterest').phase !== 'installing'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(h.manager.cancel(operationOf(h, 'nebula.finterest').id)).toBe(false);
    finish();
    await h.manager.idle();
  });

  it('lets the user dismiss a finished operation, which stays in the history', async () => {
    const h = harness();
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(h.manager.dismiss(operationOf(h, 'nebula.finterest').id)).toBe(true);
    expect(h.manager.getView().operations).toEqual([]);
    expect(h.manager.getView().history).toHaveLength(1);
  });

  it('empties the downloads folder at startup', async () => {
    const h = harness();
    await fs.mkdir(h.downloadsDir, { recursive: true });
    await fs.writeFile(path.join(h.downloadsDir, 'old.exe.part'), 'x');
    await h.manager.cleanup();
    expect(await exists(h.downloadsDir)).toBe(false);
  });
});

describe('InstallManager with a real (fake) installer process', () => {
  // A Node script standing in for an NSIS installer: it records its arguments and "registers"
  // the app in a simulated registry file, then exits with the requested code.
  const FAKE_INSTALLER = [
    "const fs = require('fs');",
    'const [registry, code, ...args] = process.argv.slice(2);',
    "fs.writeFileSync(registry, JSON.stringify({ DisplayVersion: '0.1.36', args }));",
    'process.exit(Number(code));',
  ].join('\n');

  it('runs the installer with an argument array and reads the result back', async () => {
    const script = path.join(root, 'fake-installer.js');
    const registry = path.join(root, 'registry.json');
    await fs.writeFile(script, FAKE_INSTALLER);
    const h = harness();
    h.deps.runner = {
      // The verified installer path is replaced by node + the script, the rest is untouched.
      run: (_installer, args, timeoutMs) => spawnInstallerRunner.run(process.execPath, [script, registry, '0', ...args], timeoutMs),
    };
    h.deps.detect = async () => {
      const value = JSON.parse(await fs.readFile(registry, 'utf8')) as { DisplayVersion: string };
      return { state: 'ready', detectedAt: null, apps: [{ appId: 'nebula.finterest', version: value.DisplayVersion, scope: 'user', location: 'C:\\x', exeFound: true, running: false }] };
    };
    h.manager.enqueue('nebula.finterest');
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
    expect(JSON.parse(await fs.readFile(registry, 'utf8')).args).toEqual(['/S']);
  });
});

describe('spawnInstallerRunner', () => {
  it('returns the exit code', async () => {
    expect(await spawnInstallerRunner.run(process.execPath, ['-e', 'process.exit(3)'], 10_000)).toEqual({ kind: 'exit', code: 3 });
  });

  it('passes arguments verbatim, without a shell', async () => {
    const out = path.join(root, 'args.json');
    const args = ['/D=C:\\Program Files\\Nebula & Co', '"quoted"', '$(whoami)'];
    await spawnInstallerRunner.run(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(1)))`, ...args], 10_000);
    expect(JSON.parse(await fs.readFile(out, 'utf8'))).toEqual(args);
  });

  it('stops waiting after the limit but lets the installer finish', async () => {
    const marker = path.join(root, 'finished');
    const result = await spawnInstallerRunner.run(process.execPath, ['-e', `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok'), 400)`], 100);
    expect(result).toEqual({ kind: 'timeout' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(await fs.readFile(marker, 'utf8')).toBe('ok');
  });

  it('rejects when the installer cannot start', async () => {
    await expect(spawnInstallerRunner.run(path.join(root, 'missing.exe'), [], 1000)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
