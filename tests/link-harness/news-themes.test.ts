/**
 * @jest-environment node
 */
import fs from 'node:fs';
import { NebulaLink, parseManifestBytes } from '@nebula/link';
import { HUB_ID } from '../../src/shared/consent';
import { WidgetBoard } from '../../src/electron/link/widgets';
import { shownOnHome } from '../../src/shared/widgets';
import { eventually, news, type NewsWidgets } from './fake-apps';
import { manifestOf, startTestHub, type TestHub } from './test-hub';

// The News themes on the Hub's Home (ADR-031), over real named pipes with a fake Nebula News
// that carries the real manifest of News 0.4.0.

let hub: TestHub;
const links: NebulaLink[] = [];

beforeEach(async () => {
  hub = await startTestHub({ installed: { 'nebula.news': manifestOf('news') } });
});

afterEach(async () => {
  for (const link of links.splice(0)) link.dispose();
  await hub.stop();
});

function newsManifest() {
  const parsed = parseManifestBytes(fs.readFileSync(manifestOf('news')));
  if (!parsed.ok) throw new Error('news manifest');
  return parsed.manifest;
}

/** The Hub's Home board, with the user's Home choices. */
function board(choices: Record<string, boolean> = {}) {
  return new WidgetBoard({
    manifests: () => [newsManifest()],
    connected: () => hub.server.connectedApps().map((app) => app.appId),
    query: (capability) => hub.server.queryAs(HUB_ID, capability),
    shown: (capability) => shownOnHome(capability, choices),
    onChange: () => undefined,
  });
}

async function connectNews(widgets: NewsWidgets = {}) {
  const { link } = news(hub.sessionFile, widgets);
  links.push(link);
  await link.connect();
  await eventually(() => hub.server.connectedApps().some((app) => app.appId === 'nebula.news'));
  // Connected is not ready yet: wait until News has declared its widgets (link.ready).
  for (let tries = 0; tries < 300 && 'error' in (await hub.server.queryAs(HUB_ID, 'news.tech.today')); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('News 0.4.0 themes on the Hub (ADR-031)', () => {
  it('accepts the real News 0.4.0 manifest: four public widgets, the briefing intent, five deep links', async () => {
    const manifest = newsManifest();
    expect(manifest.provides.filter((capability) => capability.kind === 'widget').map((capability) => [capability.id, capability.sensitivity, capability.refreshSeconds])).toEqual([
      ['news.headlines.today', 'public', 900],
      ['news.focus.today', 'public', 900],
      ['news.finance.today', 'public', 900],
      ['news.tech.today', 'public', 900],
    ]);
    expect(manifest.deepLinks.map((link) => link.path)).toEqual(['/', '/briefing', '/theme/focus', '/theme/finance', '/theme/tech']);
    for (const theme of ['focus', 'finance', 'tech']) {
      expect(await hub.server.routeDeepLink(`nebula://news/theme/${theme}`)).not.toBe('invalid');
    }
    expect(await hub.server.routeDeepLink('nebula://news/theme/sports')).toBe('invalid');
  });

  it('shows only "Today’s tech" on the Home by default, and reads nothing else', async () => {
    const asked: string[] = [];
    await connectNews();
    const home = new WidgetBoard({
      manifests: () => [newsManifest()],
      connected: () => hub.server.connectedApps().map((app) => app.appId),
      query: (capability) => {
        asked.push(capability);
        return hub.server.queryAs(HUB_ID, capability);
      },
      shown: (capability) => shownOnHome(capability, {}),
      onChange: () => undefined,
    });
    home.sync();
    await eventually(() => home.views()[0]?.state === 'ready');
    expect(home.views().map((widget) => widget.id)).toEqual(['news.tech.today']);
    expect(home.views()[0].data).toMatchObject({ title: 'Tech du jour', deepLink: 'nebula://news/theme/tech' });
    expect(new Set(asked)).toEqual(new Set(['news.tech.today']));
  });

  it('shows a theme the user turned on in Integrations, and drops "Top stories" when turned off', async () => {
    await connectNews();
    const home = board({ 'news.finance.today': true, 'news.tech.today': false });
    home.sync();
    await eventually(() => home.views()[0]?.state === 'ready');
    expect(home.views().map((widget) => widget.id)).toEqual(['news.finance.today']);
  });

  it('hides the card content when the theme is empty (null) and when News is closed, without error', async () => {
    const { link } = news(hub.sessionFile, { 'news.tech.today': () => null });
    links.push(link);
    await link.connect();
    await eventually(() => hub.server.connectedApps().length === 1);
    for (let tries = 0; tries < 300 && 'error' in (await hub.server.queryAs(HUB_ID, 'news.tech.today')); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const home = board();
    home.sync();
    await eventually(() => home.views()[0]?.state === 'empty');
    expect(home.views()[0].data).toBeNull();

    link.dispose();
    await eventually(() => hub.server.connectedApps().length === 0);
    home.connectionsChanged();
    expect(home.views()[0]).toMatchObject({ state: 'offline', data: null });
  });

  it('never lets a News widget open another app', async () => {
    await connectNews({ 'news.tech.today': () => ({ title: 'Tech du jour', deepLink: 'nebula://finterest/month', updatedAt: new Date().toISOString() }) });
    const home = board();
    home.sync();
    await eventually(() => home.views()[0]?.state === 'ready');
    expect(home.views()[0].data).toEqual({ title: 'Tech du jour', updatedAt: expect.any(String) });
  });

  it('refuses a payload that is not a WidgetV1 (HTML-length text, unknown field)', async () => {
    await connectNews({ 'news.tech.today': () => ({ title: 'x'.repeat(81), updatedAt: new Date().toISOString(), html: '<b>no</b>' }) });
    const home = board();
    home.sync();
    await eventually(() => home.views()[0]?.state === 'error');
    expect(home.views()[0].data).toBeNull();
  });
});
