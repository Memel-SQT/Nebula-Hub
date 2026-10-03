/**
 * @jest-environment node
 */
import { closeNebulaApps, type QuitNebulaDeps } from '../../src/electron/apps/quit-nebula';

const APPS = ['Nebula Finterest.exe', 'Nebula Clock.exe', 'Nebula News.exe'];

/** Finterest and News close when asked; Clock only hides to the tray. */
function system(running: string[], closesWhenAsked = ['nebula finterest.exe', 'nebula news.exe']) {
  const processes = new Set(running.map((name) => name.toLowerCase()));
  const calls: string[] = [];
  const deps: QuitNebulaDeps = {
    exeNames: APPS,
    running: async () => new Set(processes),
    requestClose: async (name) => {
      calls.push(`close ${name}`);
      if (closesWhenAsked.includes(name.toLowerCase())) processes.delete(name.toLowerCase());
    },
    forceClose: async (name) => {
      calls.push(`force ${name}`);
      processes.delete(name.toLowerCase());
    },
    sleep: async () => undefined,
    graceMs: 2000,
    pollMs: 500,
  };
  return { deps, calls, processes };
}

describe('Quit Nebula (ADR-030)', () => {
  it('asks every running app to close, then stops only the ones still running', async () => {
    const { deps, calls, processes } = system(['nebula finterest.exe', 'NEBULA CLOCK.EXE', 'nebula news.exe', 'explorer.exe']);
    const report = await closeNebulaApps(deps);
    expect(report).toEqual({ closed: ['Nebula Finterest.exe', 'Nebula News.exe'], forced: ['Nebula Clock.exe'] });
    expect(calls).toEqual(['close Nebula Finterest.exe', 'close Nebula Clock.exe', 'close Nebula News.exe', 'force Nebula Clock.exe']);
    expect([...processes]).toEqual(['explorer.exe']);
  });

  it('never forces an app that closed by itself', async () => {
    const { deps, calls } = system(['nebula finterest.exe']);
    expect(await closeNebulaApps(deps)).toEqual({ closed: ['Nebula Finterest.exe'], forced: [] });
    expect(calls.some((call) => call.startsWith('force'))).toBe(false);
  });

  it('does nothing when no Nebula app is running, and never names another program', async () => {
    const { deps, calls } = system(['explorer.exe', 'nebula hub.exe']);
    expect(await closeNebulaApps(deps)).toEqual({ closed: [], forced: [] });
    expect(calls).toEqual([]);
  });

  it('gives the apps the whole grace period before stopping them', async () => {
    const { deps } = system(['nebula clock.exe'], []);
    const sleeps: number[] = [];
    deps.sleep = async (ms) => {
      sleeps.push(ms);
    };
    await closeNebulaApps(deps);
    expect(sleeps.reduce((total, ms) => total + ms, 0)).toBe(2000);
  });
});
