/**
 * @jest-environment node
 */
import fs from 'node:fs';
import path from 'node:path';
import { InstalledAppsService, UNINSTALL_KEYS } from '../../src/electron/apps/installed-apps';
import type { SystemProbe } from '../../src/electron/apps/system-probe';
import { validateCatalog } from '../../src/shared/catalog';
import { HKCU_INSTALL_FINTEREST, HKCU_UNINSTALL, HKLM32_UNINSTALL } from '../fixtures/registry';

const result = validateCatalog(JSON.parse(fs.readFileSync(path.join(__dirname, '../../catalog/nebula-catalog.json'), 'utf8')));
if (!result.ok) throw new Error('catalog');
const APPS = result.catalog.apps;

const FINTEREST_DIR = 'C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest';

function probe(overrides: Partial<SystemProbe> & { files?: string[]; processes?: string[] } = {}) {
  const registry = new Map<string, string>([
    [UNINSTALL_KEYS[0], HKCU_UNINSTALL],
    [UNINSTALL_KEYS[2], HKLM32_UNINSTALL],
    ['HKCU\\Software\\a0d0bf64-c6cf-5893-bede-cd00c2b7eccb', HKCU_INSTALL_FINTEREST],
  ]);
  const files = new Set((overrides.files ?? [`${FINTEREST_DIR}\\Nebula Finterest.exe`, 'C:\\Users\\<user>\\AppData\\Local\\Programs\\Nebula Clock\\Nebula Clock.exe']).map((file) => file.toLowerCase()));
  const started: Array<[string, string]> = [];
  const fake: SystemProbe & { started: typeof started; exports: string[] } = {
    started,
    exports: [],
    async requestClose() {
      // Not used by the detection.
    },
    async forceClose() {
      // Not used by the detection.
    },
    async exportRegistry(key) {
      fake.exports.push(key);
      return registry.get(key) ?? null;
    },
    async runningProcesses() {
      return new Set((overrides.processes ?? ['nebula clock.exe']).map((name) => name.toLowerCase()));
    },
    async fileExists(file) {
      return files.has(file.toLowerCase());
    },
    async start(executable, cwd) {
      started.push([executable, cwd]);
    },
    ...overrides,
  };
  return fake;
}

function service(fake: SystemProbe) {
  return new InstalledAppsService({ probe: fake, apps: () => APPS, env: { PROGRAMFILES: 'C:\\Program Files' }, debounceMs: 10 });
}

describe('InstalledAppsService', () => {
  it('detects Finterest 0.1.35 with its location, and the other apps', async () => {
    const view = await service(probe()).detect();
    expect(view.state).toBe('ready');
    const finterest = view.apps.find((app) => app.appId === 'nebula.finterest');
    expect(finterest).toEqual({ appId: 'nebula.finterest', version: '0.1.35', scope: 'user', location: FINTEREST_DIR, exeFound: true, running: false });
    expect(view.apps.find((app) => app.appId === 'nebula.clock')).toMatchObject({ version: '1.1.3', scope: 'user', running: true });
    expect(view.apps.find((app) => app.appId === 'nebula.news')).toMatchObject({ version: '0.1.0', exeFound: false });
    expect(view.apps.find((app) => app.appId === 'nebula.hub')).toBeUndefined();
  });

  it('never sends uninstall commands to the renderer', async () => {
    const view = await service(probe()).detect();
    expect(JSON.stringify(view)).not.toMatch(/Uninstall .*\.exe/);
  });

  it('reports a registered app whose executable is gone as broken', async () => {
    const view = await service(probe({ files: [] })).detect();
    expect(view.apps.find((app) => app.appId === 'nebula.finterest')?.exeFound).toBe(false);
  });

  it('expands environment variables of per-machine installs', async () => {
    const fake = probe();
    fake.exportRegistry = async (key) => (key === UNINSTALL_KEYS[2] ? HKLM32_UNINSTALL : null);
    const view = await service(fake).detect();
    expect(view.apps.find((app) => app.appId === 'nebula.clock')).toMatchObject({ scope: 'machine', location: 'C:\\Program Files\\Nebula Clock', version: '1.1.2' });
  });

  it('works when nothing is installed', async () => {
    const fake = probe();
    fake.exportRegistry = async () => null;
    expect((await service(fake).detect()).apps).toEqual([]);
  });

  it('launches only the catalog executable inside the install folder', async () => {
    const fake = probe();
    const apps = service(fake);
    await apps.detect();
    expect(await apps.launch('nebula.finterest')).toBe('launched');
    expect(fake.started).toEqual([[`${FINTEREST_DIR}\\Nebula Finterest.exe`, FINTEREST_DIR]]);
    expect(await apps.launch('nebula.news')).toBe('missing-exe');
    expect(await apps.launch('nebula.hub')).toBe('is-hub');
    expect(await apps.launch('nebula.unknown')).toBe('not-installed');
  });

  it('reports a failed start', async () => {
    const fake = probe({ start: async () => { throw new Error('ENOENT'); } });
    const apps = service(fake);
    await apps.detect();
    expect(await apps.launch('nebula.finterest')).toBe('failed');
  });

  it('never runs two detections at once, and reruns once after', async () => {
    const fake = probe();
    const apps = service(fake);
    await Promise.all([apps.detect(), apps.detect(), apps.detect()]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // One run plus exactly one rerun: each run exports the 3 Uninstall trees plus one install key per found app.
    const uninstallExports = fake.exports.filter((key) => key === UNINSTALL_KEYS[0]).length;
    expect(uninstallExports).toBe(2);
  });

  it('debounces detection requests', async () => {
    const fake = probe();
    const apps = service(fake);
    apps.requestDetect(20);
    apps.requestDetect(20);
    apps.requestDetect(20);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fake.exports.filter((key) => key === UNINSTALL_KEYS[0]).length).toBe(1);
  });
});
