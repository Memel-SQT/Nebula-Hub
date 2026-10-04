/**
 * @jest-environment node
 */
import { ExtensionKeeper } from '../../src/electron/apps/extension-keeper';
import type { InstalledApp, InstalledView } from '../../src/shared/installed-view';
import { CATALOG } from '../renderer/fixtures';

function setup(news: Partial<InstalledApp> | null = {}, options: { enabled?: boolean; busy?: boolean } = {}) {
  const launches: Array<[string, readonly string[]]> = [];
  let now = 1_000_000;
  const apps: InstalledApp[] = news ? [{ appId: 'nebula.news', version: '0.5.0', scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\Nebula News', exeFound: true, running: false, ...news }] : [];
  const view: InstalledView = { state: 'ready', detectedAt: '2026-10-04T18:00:00Z', apps };
  const keeper = new ExtensionKeeper({
    apps: () => CATALOG.apps,
    installedView: () => view,
    busy: () => options.busy ?? false,
    enabled: () => options.enabled ?? true,
    launch: async (appId, args) => {
      launches.push([appId, args]);
      return true;
    },
    now: () => now,
  });
  return { keeper, launches, view, advance: (ms: number) => (now += ms) };
}

describe('ExtensionKeeper (ADR-034)', () => {
  it('starts Nebula News hidden, with its background switch, and nothing else', async () => {
    const { keeper, launches } = setup();
    expect(await keeper.check()).toEqual(['nebula.news']);
    expect(launches).toEqual([['nebula.news', ['--background']]]);
  });

  it('does not start it twice while it is starting, but restarts it if it stopped', async () => {
    const { keeper, launches, advance } = setup();
    await keeper.check();
    await keeper.check();
    expect(launches).toHaveLength(1);
    advance(60_000);
    await keeper.check();
    expect(launches).toHaveLength(2);
  });

  it('gives up after three starts in ten minutes (a crashing app is not restarted forever)', async () => {
    const { keeper, launches, advance } = setup();
    for (let index = 0; index < 5; index += 1) {
      await keeper.check();
      advance(60_000);
    }
    expect(launches).toHaveLength(3);
  });

  it('starts nothing when the setting is off, during an operation, after "Quit Nebula", or before the detection', async () => {
    expect((await setup({}, { enabled: false }).keeper.check())).toEqual([]);
    expect((await setup({}, { busy: true }).keeper.check())).toEqual([]);
    const suspended = setup();
    suspended.keeper.suspend();
    expect(await suspended.keeper.check()).toEqual([]);
    const loading = setup();
    loading.view.state = 'loading';
    expect(await loading.keeper.check()).toEqual([]);
  });

  it('leaves alone a running, missing or too old News', async () => {
    expect(await setup({ running: true }).keeper.check()).toEqual([]);
    expect(await setup(null).keeper.check()).toEqual([]);
    expect(await setup({ version: '0.4.1' }).keeper.check()).toEqual([]);
  });
});
