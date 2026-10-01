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
  /** What the app writes when asked for its backup (null: nothing, like a silent failure). */
  backupContent: string | null;
  backups: string[];
  /** The fake uninstaller: removes the app after this many registry checks (null: never). */
  uninstallAfterChecks: number | null;
  uninstalls: Array<{ program: string; args: readonly string[] }>;
  closeRequests: string[];
  detections: number;
}

const LOCATION = 'C:\\Users\\<user>\\AppData\\Local\\Programs\\x';
const UNINSTALLER = `${LOCATION}\\Uninstall Nebula.exe`;
const GOOD_BACKUP = JSON.stringify({ app: 'Finterest', version: 1, exportedAt: '2026-10-01T10:00:00Z', accounts: [{ name: 'Noé', snapshot: { months: [] } }] });

function installedApp(appId: string, version: string, running = false): InstalledApp {
  return { appId, version, scope: 'user', location: LOCATION, exeFound: true, running };
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
    backupContent: GOOD_BACKUP,
    backups: [],
    uninstallAfterChecks: null,
    uninstalls: [],
    closeRequests: [],
    detections: 0,
  } as unknown as Harness;
  let uninstallChecks: number | null = null;
  const view = (): InstalledView => ({ state: 'ready', apps: h.installed.map((app) => ({ ...app })), detectedAt: '2026-10-01T10:00:00Z' });
  h.deps = {
    entry: (appId) => catalog.find((entry) => entry.app.id === appId),
    installedView: view,
    record: (appId) => {
      const app = h.installed.find((candidate) => candidate.appId === appId);
      const exeName = catalog.find((entry) => entry.app.id === appId)?.app.windows.exeName ?? 'x.exe';
      return app ? { ...app, exePath: `${LOCATION}\\${exeName}`, entry: { uninstallString: `"${UNINSTALLER}" /currentuser`, quietUninstallString: `"${UNINSTALLER}" /currentuser /S` } } : undefined;
    },
    detect: async () => {
      h.detections += 1;
      // The uninstaller returned at once; the app leaves the registry a few checks later.
      if (uninstallChecks !== null) {
        uninstallChecks -= 1;
        if (uninstallChecks <= 0) {
          h.installed = [];
          uninstallChecks = null;
        }
      }
      return view();
    },
    runningProcesses: async () => new Set(h.running),
    requestClose: async (exeName) => {
      h.closeRequests.push(exeName);
    },
    download: (_url, part, options) => h.downloadBehaviour(part, options),
    verify: verifyFile,
    runner: {
      run: async (installer, args) => {
        if (args[0]?.startsWith('--backup-before-uninstall=')) {
          const file = args[0].slice('--backup-before-uninstall='.length);
          h.backups.push(file);
          if (h.backupContent !== null) {
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, h.backupContent);
          }
          // Like Finterest: always 0, whatever happened.
          return { kind: 'exit', code: 0 };
        }
        if (installer === UNINSTALLER) {
          h.uninstalls.push({ program: installer, args });
          uninstallChecks = h.uninstallAfterChecks;
          return { kind: 'exit', code: 0 };
        }
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
    documentsDir: path.join(root, 'Documents'),
    env: {},
    installDirectory: () => null,
    appExitPollMs: 10,
    registryPollMs: 0,
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

// ---- M5: update, repair, uninstall, backup (brief §7.5–7.7, ADR-022). ----

async function until(h: Harness, appId: string, phase: InstallPhase): Promise<void> {
  for (let i = 0; i < 400 && operationOf(h, appId)?.phase !== phase; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(operationOf(h, appId)?.phase).toBe(phase);
}

describe('InstallManager: updates', () => {
  it('asks for a confirmation before updating an app that backs up its data (R04)', () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    expect(h.manager.enqueue('nebula.finterest', 'update')).toBe('confirmation-required');
    expect(h.manager.getView().operations).toEqual([]);
  });

  it('backs up, then updates exactly like electron-updater (--updated /S)', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    const plan = h.manager.plan('nebula.finterest', 'update');
    expect(plan).toMatchObject({ kind: 'update', version: '0.1.36', fromVersion: '0.1.35', needsConfirmation: true, running: false, blocked: null });
    expect(plan.backupPath).toMatch(/Documents[\\/]Nebula Finterest[\\/]finterest-store-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);

    expect(h.manager.enqueue('nebula.finterest', 'update', { confirmed: true })).toBe('queued');
    await h.manager.idle();
    expect(h.phases.get('nebula.finterest')).toEqual(['queued', 'downloading', 'verifying', 'ready', 'backing-up', 'installing', 'verifying-install', 'installed']);
    // The path shown on the confirmation screen is the one used.
    expect(h.backups).toEqual([plan.backupPath]);
    expect(operationOf(h, 'nebula.finterest').backup).toMatchObject({ path: plan.backupPath, state: 'ok', accounts: 1 });
    expect(h.runs).toEqual([{ installer: path.join(h.downloadsDir, FILE_NAME), args: ['--updated', '/S'] }]);
    expect(h.history[0]).toMatchObject({ kind: 'update', version: '0.1.36', fromVersion: '0.1.35', outcome: 'success' });
  });

  it('never moves an app on update, whatever the install folder setting', async () => {
    const h = harness(undefined, { installDirectory: () => 'D:\\Apps' });
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await h.manager.idle();
    expect(h.runs[0].args).toEqual(['--updated', '/S']);
  });

  it('updates an app without backup in one click', async () => {
    const h = harness([finterest(), clock()]);
    h.installed.push(installedApp('nebula.clock', '1.1.2'));
    h.installerBehaviour = { version: '1.1.3', result: { kind: 'exit', code: 0 } };
    h.runs.length = 0;
    expect(h.manager.enqueue('nebula.clock', 'update')).toBe('queued');
    await h.manager.idle();
    expect(h.phases.get('nebula.clock')).toEqual(['queued', 'downloading', 'verifying', 'ready', 'installing', 'verifying-install', 'installed']);
    expect(h.backups).toEqual([]);
  });

  it.each([
    ['not-installed', [] as InstalledApp[]],
    ['no-update', [installedApp('nebula.finterest', '0.1.36')]],
  ] as const)('refuses an update: %s', (result, apps) => {
    const h = harness();
    h.installed.push(...apps);
    expect(h.manager.plan('nebula.finterest', 'update').blocked).toBe(result);
    expect(h.manager.enqueue('nebula.finterest', 'update', { confirmed: true })).toBe(result);
  });

  it('waits for the user to close the app, and only asks it to close when the user says so (R08)', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35', true));
    h.running.add('nebula finterest.exe');
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await until(h, 'nebula.finterest', 'waiting-for-app-exit');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.closeRequests).toEqual([]);
    const id = operationOf(h, 'nebula.finterest').id;
    expect(h.manager.requestClose(id)).toBe(true);
    expect(h.manager.requestClose(id)).toBe(false);
    expect(h.closeRequests).toEqual(['Nebula Finterest.exe']);
    expect(operationOf(h, 'nebula.finterest').closeRequested).toBe(true);
    h.running.clear();
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
    expect(h.backups).toHaveLength(1);
  });

  it('notices when the app updated itself while closing (ADR-004), without running an installer', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35', true));
    h.running.add('nebula finterest.exe');
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await until(h, 'nebula.finterest', 'waiting-for-app-exit');
    // The app's own updater installs on quit (autoInstallOnAppQuit).
    h.installed = [installedApp('nebula.finterest', '0.1.36')];
    h.running.clear();
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'installed', failureDetail: 'self-updated' });
    expect(h.runs).toEqual([]);
  });
});

describe('InstallManager: the app backup (brief §7.6)', () => {
  it.each([
    ['missing', null],
    ['empty', ''],
    ['unknown-format', JSON.stringify({ app: 'Other', version: 1, exportedAt: 'x', accounts: [] })],
    ['invalid', '{ broken'],
  ] as const)('blocks on a %s backup until the user decides', async (problem, content) => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    h.backupContent = content;
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await until(h, 'nebula.finterest', 'backup-failed');
    expect(operationOf(h, 'nebula.finterest').backup).toMatchObject({ state: 'failed', problem });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.runs).toEqual([]);
    h.manager.cancel(operationOf(h, 'nebula.finterest').id);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('cancelled');
    expect(h.runs).toEqual([]);
    expect(await exists(path.join(h.downloadsDir, FILE_NAME))).toBe(false);
  });

  it('continues without backup only after the second confirmation', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    h.backupContent = null;
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await until(h, 'nebula.finterest', 'backup-failed');
    expect(h.manager.continueWithoutBackup(operationOf(h, 'nebula.finterest').id)).toBe(true);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'installed', backup: { state: 'skipped' } });
    expect(h.runs).toHaveLength(1);
  });

  it('accepts a backup without accounts and says how many it holds', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    h.backupContent = JSON.stringify({ app: 'Finterest', version: 1, exportedAt: 'x', accounts: [] });
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').backup).toMatchObject({ state: 'ok', accounts: 0 });
  });
});

describe('InstallManager: automatic updates', () => {
  it('updates the opted-in apps that are closed, and never waits for the user', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'), installedApp('nebula.clock', '1.1.2', true));
    expect(h.manager.autoUpdate((appId) => appId === 'nebula.finterest' || appId === 'nebula.clock')).toEqual(['nebula.finterest']);
    expect(operationOf(h, 'nebula.finterest').auto).toBe(true);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
    expect(h.manager.autoUpdate(() => false)).toEqual([]);
  });

  it('gives up on a failed backup instead of blocking, and does not retry that version', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    h.backupContent = null;
    h.manager.autoUpdate(() => true);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest')).toMatchObject({ phase: 'failed', failure: 'backup-failed', failureDetail: 'missing' });
    expect(h.runs).toEqual([]);
    expect(h.manager.autoUpdate(() => true)).toEqual([]);
  });
});

describe('InstallManager: repair', () => {
  it('cannot back up an install whose executable is gone: the user confirms a second time', async () => {
    const h = harness();
    h.installed.push({ ...installedApp('nebula.finterest', '0.1.36'), exeFound: false });
    h.manager.enqueue('nebula.finterest', 'repair', { confirmed: true });
    await until(h, 'nebula.finterest', 'backup-failed');
    expect(operationOf(h, 'nebula.finterest').backup).toMatchObject({ state: 'failed', problem: 'not-started' });
    expect(h.backups).toEqual([]);
    h.manager.continueWithoutBackup(operationOf(h, 'nebula.finterest').id);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.finterest').phase).toBe('installed');
  });

  it('reinstalls the same version in update mode, after the backup', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.36'));
    expect(h.manager.enqueue('nebula.finterest', 'repair')).toBe('confirmation-required');
    expect(h.manager.enqueue('nebula.finterest', 'repair', { confirmed: true })).toBe('queued');
    await h.manager.idle();
    expect(h.phases.get('nebula.finterest')).toEqual(['repairing', 'queued', 'downloading', 'verifying', 'ready', 'backing-up', 'installing', 'verifying-install', 'installed']);
    expect(h.runs[0].args).toEqual(['--updated', '/S']);
    expect(h.history[0]).toMatchObject({ kind: 'repair', outcome: 'success' });
  });

  it('is an update, not a repair, when the release is another version', () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    expect(h.manager.enqueue('nebula.finterest', 'repair', { confirmed: true })).toBe('repair-unavailable');
  });
});

describe('InstallManager: uninstall', () => {
  it('backs up, runs the quiet uninstaller, then waits for the registry key to go', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.finterest', '0.1.36'));
    h.uninstallAfterChecks = 3;
    expect(h.manager.enqueue('nebula.finterest', 'uninstall')).toBe('confirmation-required');
    const plan = h.manager.plan('nebula.finterest', 'uninstall');
    expect(plan).toMatchObject({ version: null, fromVersion: '0.1.36', needsConfirmation: true });
    expect(h.manager.enqueue('nebula.finterest', 'uninstall', { confirmed: true })).toBe('queued');
    await h.manager.idle();
    expect(h.phases.get('nebula.finterest')).toEqual(['uninstalling', 'backing-up', 'removing', 'absent']);
    expect(h.backups).toEqual([plan.backupPath]);
    expect(h.uninstalls).toEqual([{ program: UNINSTALLER, args: ['/currentuser', '/S'] }]);
    expect(h.runs).toEqual([]);
    expect(h.history[0]).toMatchObject({ kind: 'uninstall', version: '0.1.36', outcome: 'success' });
  });

  it('uninstalls an app without backup', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.clock', '1.1.3'));
    h.uninstallAfterChecks = 1;
    h.manager.enqueue('nebula.clock', 'uninstall', { confirmed: true });
    await h.manager.idle();
    expect(h.phases.get('nebula.clock')).toEqual(['uninstalling', 'removing', 'absent']);
  });

  it('reports an uninstaller that never finishes', async () => {
    const h = harness(undefined, { uninstallTimeoutMs: 30, registryPollMs: 5 });
    h.installed.push(installedApp('nebula.clock', '1.1.3'));
    h.uninstallAfterChecks = null;
    h.manager.enqueue('nebula.clock', 'uninstall', { confirmed: true });
    await h.manager.idle();
    expect(operationOf(h, 'nebula.clock')).toMatchObject({ phase: 'failed', failure: 'uninstall-timeout' });
  });

  it('refuses an uninstall command that is not the app’s own uninstaller', () => {
    const h = harness();
    h.installed.push(installedApp('nebula.clock', '1.1.3'));
    h.deps.record = () => ({ ...installedApp('nebula.clock', '1.1.3'), exePath: 'x', entry: { uninstallString: null, quietUninstallString: '"C:\\Windows\\System32\\cmd.exe" /S' } });
    expect(h.manager.enqueue('nebula.clock', 'uninstall', { confirmed: true })).toBe('no-uninstaller');
  });

  it('waits for the app to close and can be cancelled meanwhile', async () => {
    const h = harness();
    h.installed.push(installedApp('nebula.clock', '1.1.3', true));
    h.running.add('nebula clock.exe');
    h.manager.enqueue('nebula.clock', 'uninstall', { confirmed: true });
    await until(h, 'nebula.clock', 'waiting-for-app-exit');
    h.manager.cancel(operationOf(h, 'nebula.clock').id);
    await h.manager.idle();
    expect(operationOf(h, 'nebula.clock').phase).toBe('cancelled');
    expect(h.uninstalls).toEqual([]);
  });
});

describe('InstallManager: the real backup command line', () => {
  // A Node script standing in for Finterest's --backup-before-uninstall mode: it receives the
  // whole "--flag=<path with spaces>" as one argument, writes the file and always exits 0.
  const FAKE_APP = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const flag = process.argv.find((arg) => arg.startsWith('--backup-before-uninstall='));",
    "const file = flag.slice('--backup-before-uninstall='.length);",
    'fs.mkdirSync(path.dirname(file), { recursive: true });',
    "fs.writeFileSync(file, JSON.stringify({ app: 'Finterest', version: 1, exportedAt: new Date().toISOString(), accounts: [{ name: 'Noé', snapshot: {} }, { name: 'Démo', snapshot: {} }] }));",
  ].join('\n');

  it('passes the backup path as a single argument, spaces and accents included', async () => {
    const script = path.join(root, 'fake-finterest.js');
    await fs.writeFile(script, FAKE_APP);
    const h = harness(undefined, { documentsDir: path.join(root, 'Mes Documents é') });
    h.installed.push(installedApp('nebula.finterest', '0.1.35'));
    const fake = h.deps.runner;
    h.deps.runner = {
      run: (program, args, timeoutMs) => (args[0]?.startsWith('--backup-before-uninstall=') ? spawnInstallerRunner.run(process.execPath, [script, ...args], timeoutMs) : fake.run(program, args, timeoutMs)),
    };
    h.manager.enqueue('nebula.finterest', 'update', { confirmed: true });
    await h.manager.idle();
    const operation = operationOf(h, 'nebula.finterest');
    expect(operation.backup).toMatchObject({ state: 'ok', accounts: 2 });
    expect(JSON.parse(await fs.readFile(operation.backup!.path, 'utf8')).accounts).toHaveLength(2);
  });
});
