/**
 * @jest-environment node
 */
import type { Manifest } from '@nebula/link';
import { WidgetBoard } from '../../src/electron/link/widgets';
import { APP_START_GRACE_MS, graceLeft } from '../../src/shared/widgets';

const NEWS: Manifest = {
  schema: 1,
  appId: 'nebula.news',
  provides: [{ id: 'news.tech.today', kind: 'widget', sensitivity: 'public', title: { fr: 'Tech du jour' }, description: { fr: 'Trois articles tech.' }, resultSchema: 'WidgetV1', refreshSeconds: 900 }],
  consumes: [],
  deepLinks: [],
} as unknown as Manifest;

function board(since: number) {
  const queries: string[] = [];
  const instance = new WidgetBoard({
    manifests: () => [NEWS],
    connected: () => ['nebula.news'],
    query: async (capability) => {
      queries.push(capability);
      return { result: { title: 'Tech du jour', updatedAt: new Date().toISOString() } };
    },
    connectedSince: () => since,
    onChange: () => undefined,
    now: () => Date.now(),
  });
  return { instance, queries };
}

describe('Home widgets: start grace of a just started app (user request 2026-10-05)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-05T09:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes the time left before an app may be read', () => {
    const now = Date.now();
    expect(APP_START_GRACE_MS).toBe(25_000);
    expect(graceLeft(now, now)).toBe(25_000);
    expect(graceLeft(now - 10_000, now)).toBe(15_000);
    expect(graceLeft(now - 30_000, now)).toBe(0);
    expect(graceLeft(undefined, now)).toBe(0);
  });

  it('reads nothing during the first 25 s after the app connected, then reads it on its own', async () => {
    const { instance, queries } = board(Date.now());
    instance.sync();
    await jest.advanceTimersByTimeAsync(24_000);
    expect(queries).toEqual([]);
    expect(instance.views()[0].state).toBe('loading');
    await jest.advanceTimersByTimeAsync(2_000);
    expect(queries).toEqual(['news.tech.today']);
    expect(instance.views()[0].state).toBe('ready');
  });

  it('keeps the refresh button quiet during the grace too', async () => {
    const { instance, queries } = board(Date.now());
    instance.sync();
    await jest.advanceTimersByTimeAsync(5_000);
    await instance.refresh('news.tech.today');
    expect(queries).toEqual([]);
    await jest.advanceTimersByTimeAsync(26_000);
    expect(queries).toEqual(['news.tech.today']);
  });

  it('reads an app that has been running for a while at once', async () => {
    const { instance, queries } = board(Date.now() - 60_000);
    instance.sync();
    await jest.advanceTimersByTimeAsync(0);
    expect(queries).toEqual(['news.tech.today']);
  });
});
