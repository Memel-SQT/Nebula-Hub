/**
 * @jest-environment node
 */
import { DockController } from '../../src/electron/link/dock';
import type { DockPayload, DockView, Rect } from '../../src/shared/dock';

function harness(options: { dockable?: string[]; launch?: boolean } = {}) {
  const state = {
    subscribed: new Set<string>(),
    content: { x: 0, y: 0, width: 1280, height: 860 } as Rect | null,
    sent: [] as Array<{ appId: string; payload: DockPayload }>,
    launches: [] as string[],
    views: [] as DockView[],
  };
  const dock = new DockController({
    dockable: () => options.dockable ?? ['nebula.finterest', 'nebula.clock'],
    subscribed: () => [...state.subscribed],
    send: (appId, payload) => {
      if (!state.subscribed.has(appId)) return false;
      state.sent.push({ appId, payload });
      return true;
    },
    content: () => state.content,
    launch: async (appId) => {
      state.launches.push(appId);
      return options.launch ?? true;
    },
    onChange: (view) => state.views.push(view),
  });
  return { dock, state, last: (appId: string) => [...state.sent].reverse().find((entry) => entry.appId === appId)?.payload };
}

const AREA = { x: 236, y: 0, width: 1044, height: 860 };

describe('DockController (Hub mode)', () => {
  it('launches a closed app, then gives it its place once it subscribes, raised once', async () => {
    const { dock, state, last } = harness();
    expect(await dock.show('nebula.finterest')).toBe(true);
    expect(state.launches).toEqual(['nebula.finterest']);
    dock.setArea(AREA);
    expect(state.sent).toEqual([]);
    state.subscribed.add('nebula.finterest');
    dock.connectionsChanged();
    expect(last('nebula.finterest')).toEqual({ state: 'docked', visible: true, raise: true, bounds: { x: 236, y: 0, width: 1044, height: 860 } });
    expect(dock.view()).toEqual({ dockable: ['nebula.finterest', 'nebula.clock'], open: [{ appId: 'nebula.finterest', connected: true }], active: 'nebula.finterest' });
  });

  it('follows the Hub window and hides the app when the Hub is minimized or shows another screen', async () => {
    const { dock, state, last } = harness();
    state.subscribed.add('nebula.finterest');
    await dock.show('nebula.finterest');
    dock.setArea(AREA);
    state.content = { x: 300, y: 200, width: 1280, height: 860 };
    dock.windowChanged();
    expect(last('nebula.finterest')).toMatchObject({ visible: true, bounds: { x: 536, y: 200 } });
    const count = state.sent.length;
    dock.windowChanged();
    expect(state.sent).toHaveLength(count);
    state.content = null;
    dock.windowChanged();
    expect(last('nebula.finterest')).toMatchObject({ visible: false });
    state.content = { x: 300, y: 200, width: 1280, height: 860 };
    dock.windowChanged(true);
    expect(last('nebula.finterest')).toMatchObject({ visible: true, raise: true });
    dock.setArea(null);
    expect(last('nebula.finterest')).toMatchObject({ visible: false });
  });

  it('raises the app every time the Hub comes back to the front, even when nothing moved', async () => {
    const { dock, state } = harness();
    state.subscribed.add('nebula.clock');
    await dock.show('nebula.clock');
    dock.setArea(AREA);
    const raises = () => state.sent.filter((entry) => entry.payload.state === 'docked' && entry.payload.raise).length;
    expect(raises()).toBe(1);
    // The user clicks in the app, then on the Hub again, twice: the Hub covers the app each time.
    dock.windowChanged(true);
    dock.windowChanged(true);
    expect(raises()).toBe(3);
    // A plain geometry event without a move sends nothing.
    const count = state.sent.length;
    dock.windowChanged();
    expect(state.sent).toHaveLength(count);
  });

  it('shows one docked app at a time, like tabs', async () => {
    const { dock, state, last } = harness();
    state.subscribed.add('nebula.finterest').add('nebula.clock');
    await dock.show('nebula.finterest');
    dock.setArea(AREA);
    await dock.show('nebula.clock');
    expect(last('nebula.clock')).toMatchObject({ visible: true });
    expect(last('nebula.finterest')).toMatchObject({ visible: false });
    expect(state.launches).toEqual([]);
  });

  it('releases an app back to its own window, and every app when the Hub quits', async () => {
    const { dock, state, last } = harness();
    state.subscribed.add('nebula.finterest').add('nebula.clock');
    await dock.show('nebula.finterest');
    await dock.show('nebula.clock');
    dock.release('nebula.clock');
    expect(last('nebula.clock')).toEqual({ state: 'released' });
    expect(dock.view()).toMatchObject({ open: [{ appId: 'nebula.finterest' }], active: null });
    dock.releaseAll();
    expect(last('nebula.finterest')).toEqual({ state: 'released' });
    expect(dock.view().open).toEqual([]);
  });

  it('forgets an app the user quit, but waits for one that is still starting', async () => {
    const { dock, state } = harness();
    await dock.show('nebula.finterest');
    dock.connectionsChanged();
    expect(dock.view().open).toEqual([{ appId: 'nebula.finterest', connected: false }]);
    state.subscribed.add('nebula.finterest');
    dock.connectionsChanged();
    state.subscribed.delete('nebula.finterest');
    dock.connectionsChanged();
    expect(dock.view()).toMatchObject({ open: [], active: null });
  });

  it('refuses an app that does not support the Hub mode, and gives up when the launch fails', async () => {
    const { dock, state } = harness({ dockable: ['nebula.finterest'], launch: false });
    expect(await dock.show('nebula.news')).toBe(false);
    expect(state.launches).toEqual([]);
    expect(await dock.show('nebula.finterest')).toBe(false);
    expect(dock.view()).toMatchObject({ open: [], active: null });
  });
});
