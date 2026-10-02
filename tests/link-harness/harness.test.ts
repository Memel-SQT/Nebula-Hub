/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NebulaLink, newToken, parseManifestBytes, PROTOCOL } from '@nebula/link';
import { HUB_ID } from '../../src/shared/consent';
import { writeSession } from '../../src/electron/link/session';
import { WidgetBoard } from '../../src/electron/link/widgets';
import { DockController } from '../../src/electron/link/dock';
import type { WidgetView } from '../../src/shared/widgets';
import { alpha, beta, eventually } from './fake-apps';
import { rawAuth, rawConnect } from './raw-client';
import { APPEARANCE, manifestOf, startTestHub, type TestHub } from './test-hub';

// The M6 demonstration (brief § 17): every kind of capability with the fake apps, refusals,
// absent Hub, fake Hub, fake clients and invalid messages — over real named pipes.

let hub: TestHub;
const links: NebulaLink[] = [];
const track = <T extends { link: NebulaLink }>(app: T): T => {
  links.push(app.link);
  return app;
};

beforeEach(async () => {
  hub = await startTestHub();
});

afterEach(async () => {
  for (const link of links.splice(0)) link.dispose();
  await hub.stop();
});

describe('handshake', () => {
  it('connects an installed app with its installed manifest', async () => {
    const { link } = track(alpha(hub.sessionFile));
    expect(await link.connect()).toBe('connected');
    await eventually(() => hub.server.connectedApps().some((app) => app.appId === 'nebula.alpha'));
    expect(link.appearance).toEqual(APPEARANCE);
  });

  it('stays offline, silently, when the Hub is absent — then connects when it appears (R09)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-link-absent-'));
    const sessionFile = path.join(dir, 'session.json');
    const { link } = track(alpha(sessionFile));
    const statuses: string[] = [];
    link.onStatus((status) => statuses.push(status));
    await expect(link.connect()).resolves.toBe('offline');
    expect(await link.query('alpha.time')).toEqual({ ok: false, error: 'offline' });
    expect(link.emit('alpha.tick', { kind: 'long', durationMin: 15 })).toBe(false);
    expect(await link.notify({ title: 'x', body: 'y', sensitivity: 'public' })).toEqual({ ok: false, error: 'offline' });
    // The Hub starts: same pipe and token are published in this session file.
    fs.copyFileSync(hub.sessionFile, sessionFile);
    await eventually(() => link.status === 'connected', 5000);
    expect(statuses).toEqual(['connected']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to talk to a Hub that cannot prove the token (squatted pipe, stale session)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-link-fake-'));
    const fake = await writeSession(dir, hub.pipe, '1.0.0');
    expect(fake.token).not.toBe(hub.token);
    const { link } = track(alpha(path.join(dir, 'session.json')));
    expect(await link.connect()).toBe('offline');
    expect(hub.server.connectedApps()).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['a wrong token', 'nebula.alpha', 'alpha', 'other'],
    ['an app that is not installed', 'nebula.gamma', 'alpha', null],
    ['a manifest different from the installed one', 'nebula.alpha', 'tampered', null],
  ])('refuses a client with %s', async (_label, appId, manifest, token) => {
    let file = manifestOf('alpha');
    if (manifest === 'tampered') {
      file = path.join(hub.dir, 'tampered.json');
      fs.writeFileSync(file, `${fs.readFileSync(manifestOf('alpha'), 'utf8')}\n`);
    }
    const client = await rawConnect(hub.pipe);
    const auth = await rawAuth(client, hub.token, appId, file, token === 'other' ? newToken() : hub.token);
    expect(auth.error).toEqual({ code: -32001, message: 'unauthenticated' });
    await client.waitClosed();
    expect(hub.server.connectedApps()).toEqual([]);
  });

  it('answers nothing but the handshake before authentication', async () => {
    const client = await rawConnect(hub.pipe);
    client.send({ jsonrpc: '2.0', id: 1, method: 'link.query', params: { capability: 'alpha.secret' } });
    const answer = await client.waitFor((message) => message.id === 1);
    expect(answer.error).toEqual({ code: -32001, message: 'unauthenticated' });
    await client.waitClosed();
    expect(client.messages).toHaveLength(1);
  });

  it('refuses another protocol version', async () => {
    const client = await rawConnect(hub.pipe);
    client.send({ jsonrpc: '2.0', id: 1, method: 'link.hello', params: { protocol: 'nebula-link/9', appId: 'nebula.alpha', appVersion: '1', manifestHash: 'a'.repeat(64), clientNonce: 'b'.repeat(43) } });
    expect((await client.waitFor((message) => message.id === 1)).error).toBeDefined();
    await client.waitClosed();
    expect(PROTOCOL).toBe('nebula-link/1');
  });
});

describe('query (public and private)', () => {
  it('relays a public query', async () => {
    track(alpha(hub.sessionFile));
    const { link } = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    await eventually(() => hub.audit.length >= 0 && hub.server.connectedApps().length === 2);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const result = await link.query<{ value: string }>('alpha.time');
    expect(result).toMatchObject({ ok: true, value: { title: 'Heure d’Alpha', value: '12:00' } });
    expect(hub.audit.some((entry) => entry.capability === 'alpha.time' && entry.outcome === 'delivered' && entry.consumer === 'nebula.beta')).toBe(true);
  });

  it('asks before a private query, then follows the answer, and the journal never holds the value', async () => {
    track(alpha(hub.sessionFile));
    const { link } = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await link.query('alpha.secret')).toEqual({ ok: false, error: 'consent-required' });
    expect(hub.consentRequests).toContainEqual({ consumer: 'nebula.beta', capability: 'alpha.secret' });
    hub.grant('nebula.beta', 'alpha.secret');
    expect(await link.query('alpha.secret')).toMatchObject({ ok: true, value: { value: '412,50 €' } });
    hub.deny('nebula.beta', 'alpha.secret');
    expect(await link.query('alpha.secret')).toEqual({ ok: false, error: 'consent-denied' });
    expect(JSON.stringify(hub.audit)).not.toContain('412,50');
  });

  it('says when the provider is not connected', async () => {
    const { link } = track(beta(hub.sessionFile));
    await link.connect();
    expect(await link.query('alpha.time')).toEqual({ ok: false, error: 'provider-offline' });
  });

  it('refuses what the caller does not declare', async () => {
    track(alpha(hub.sessionFile));
    const { link } = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    expect(await link.query('alpha.status')).toEqual({ ok: false, error: 'unknown-capability' });
    expect(() => link.provide('beta.anything', () => null)).toThrow('ERR_LINK_UNDECLARED_CAPABILITY');
  });

  it('never forwards a result of the wrong shape', async () => {
    track(alpha(hub.sessionFile, { secret: () => ({ title: 'x', html: '<img onerror=alert(1)>', updatedAt: new Date().toISOString() }) }));
    const { link } = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    hub.grant('nebula.beta', 'alpha.secret');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await link.query('alpha.secret')).toEqual({ ok: false, error: 'invalid-result' });
  });

  it('passes "nothing to show" through (e.g. no account unlocked)', async () => {
    track(alpha(hub.sessionFile, { secret: () => null }));
    const { link } = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    hub.grant('nebula.beta', 'alpha.secret');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await link.query('alpha.secret')).toEqual({ ok: true, value: null });
  });
});

describe('widget (the Hub as consumer)', () => {
  it('needs the user’s yes for a private widget, then reads it', async () => {
    const { link } = track(alpha(hub.sessionFile));
    await link.connect();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await hub.server.queryAs(HUB_ID, 'alpha.status')).toEqual({ error: 'consent-required' });
    hub.grant(HUB_ID, 'alpha.status');
    expect(await hub.server.queryAs(HUB_ID, 'alpha.status')).toMatchObject({ result: { title: 'État', value: 'OK' } });
    // The Hub only reads widgets, not queries.
    expect(await hub.server.queryAs(HUB_ID, 'alpha.time')).toEqual({ error: 'unknown-capability' });
  });
});

describe('events', () => {
  it('delivers a public event to its subscribers', async () => {
    const provider = track(alpha(hub.sessionFile));
    const consumer = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(provider.link.emit('alpha.tick', { kind: 'long', durationMin: 15 })).toBe(true);
    await eventually(() => consumer.events.some((event) => event.event === 'alpha.tick'));
    expect(consumer.events.find((event) => event.event === 'alpha.tick')).toEqual({ event: 'alpha.tick', payload: { kind: 'long', durationMin: 15 }, source: 'nebula.alpha' });
  });

  it('holds a private event until both the app and the Hub are allowed', async () => {
    const provider = track(alpha(hub.sessionFile));
    const consumer = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const alert = { title: 'Prélèvement demain', body: 'Loyer : 750 €', sensitivity: 'private' };
    provider.link.emit('alpha.alert', alert);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(consumer.events.some((event) => event.event === 'alpha.alert')).toBe(false);
    expect(hub.notifications).toEqual([]);
    expect(hub.consentRequests).toEqual(expect.arrayContaining([{ consumer: 'nebula.beta', capability: 'alpha.alert' }, { consumer: HUB_ID, capability: 'alpha.alert' }]));
    hub.grant('nebula.beta', 'alpha.alert');
    hub.grant(HUB_ID, 'alpha.alert');
    provider.link.emit('alpha.alert', alert);
    await eventually(() => consumer.events.some((event) => event.event === 'alpha.alert') && hub.notifications.length === 1);
    expect(hub.notifications[0]).toEqual({ appId: 'nebula.alpha', notification: alert });
  });

  it('drops a payload that breaks its schema (SDK and Hub)', async () => {
    const provider = track(alpha(hub.sessionFile));
    await provider.link.connect();
    expect(provider.link.emit('alpha.tick', { kind: 'forever', durationMin: 15 })).toBe(false);
    const client = await rawConnect(hub.pipe);
    await rawAuth(client, hub.token, 'nebula.alpha', manifestOf('alpha'));
    client.send({ jsonrpc: '2.0', method: 'link.emit', params: { event: 'alpha.tick', payload: { kind: 'forever' } } });
    await eventually(() => hub.audit.some((entry) => entry.outcome === 'invalid'));
  });

  it('sends the appearance (I1) at once and on every change, and the Hub presence (I6)', async () => {
    const consumer = track(beta(hub.sessionFile));
    await consumer.link.connect();
    await eventually(() => consumer.events.some((event) => event.event === 'nebula.appearance.changed') && consumer.events.some((event) => event.event === 'nebula.hub.present'));
    expect(consumer.events.find((event) => event.event === 'nebula.hub.present')?.payload).toEqual({ hubVersion: '9.9.9-test', protocol: 'nebula-link/1', managesUpdates: true });
    hub.server.broadcast('nebula.appearance.changed', { ...APPEARANCE, theme: 'glass-light' });
    await eventually(() => consumer.events.some((event) => (event.payload as { theme?: string }).theme === 'glass-light'));
    // An appearance object of the wrong shape is never broadcast.
    hub.server.broadcast('nebula.appearance.changed', { theme: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(consumer.events.filter((event) => event.event === 'nebula.appearance.changed')).toHaveLength(2);
  });

  it('stops a public event the user turned off', async () => {
    const provider = track(alpha(hub.sessionFile));
    const consumer = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    hub.deny('nebula.beta', 'alpha.tick');
    await new Promise((resolve) => setTimeout(resolve, 80));
    provider.link.emit('alpha.tick', { kind: 'short', durationMin: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(consumer.events.some((event) => event.event === 'alpha.tick')).toBe(false);
  });
});

describe('notifications (I5)', () => {
  it('accepts public notifications and asks before private ones', async () => {
    const { link } = track(alpha(hub.sessionFile));
    await link.connect();
    expect(await link.notify({ title: 'Briefing prêt', body: '3 sujets', sensitivity: 'public', deepLink: 'nebula://alpha/panel?tab=a' })).toEqual({ ok: true, value: { accepted: true } });
    expect(await link.notify({ title: 'Prélèvement', body: 'Demain', sensitivity: 'private' })).toEqual({ ok: false, error: 'consent-required' });
    expect(hub.consentRequests).toContainEqual({ consumer: HUB_ID, capability: 'alpha.notify' });
    hub.grant(HUB_ID, 'alpha.notify');
    expect(await link.notify({ title: 'Prélèvement', body: 'Demain', sensitivity: 'private' })).toEqual({ ok: true, value: { accepted: true } });
    expect(hub.notifications.map((entry) => entry.notification.title)).toEqual(['Briefing prêt', 'Prélèvement']);
  });
});

describe('intents and deep links', () => {
  it('delivers an intent to a connected app', async () => {
    const provider = track(alpha(hub.sessionFile));
    const consumer = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    expect(await consumer.link.intent('nebula.alpha', '/panel', { tab: 'a' })).toEqual({ ok: true, value: { delivered: 'link' } });
    expect(provider.intents).toEqual([{ path: '/panel', params: { tab: 'a' }, source: 'nebula.beta' }]);
  });

  it('refuses an undeclared path or parameter value', async () => {
    track(alpha(hub.sessionFile));
    const consumer = track(beta(hub.sessionFile));
    await Promise.all(links.map((one) => one.connect()));
    expect(await consumer.link.intent('nebula.alpha', '/panel', { tab: 'c' })).toEqual({ ok: false, error: 'invalid-params' });
    expect(await consumer.link.intent('nebula.alpha', '/admin', {})).toEqual({ ok: false, error: 'invalid-params' });
  });

  it('launches an installed app that is not connected, with --nebula-intent', async () => {
    const consumer = track(beta(hub.sessionFile));
    await consumer.link.connect();
    expect(await consumer.link.intent('nebula.alpha', '/calendar', { date: '2026-10-15' })).toEqual({ ok: true, value: { delivered: 'launched' } });
    expect(hub.launches).toEqual([{ appId: 'nebula.alpha', intent: { path: '/calendar', params: { date: '2026-10-15' }, source: 'nebula.beta' } }]);
  });

  it('routes nebula:// links opened from Windows', async () => {
    const provider = track(alpha(hub.sessionFile));
    await provider.link.connect();
    expect(await hub.server.routeDeepLink('nebula://alpha/calendar?date=2026-10-15')).toBe('link');
    expect(provider.intents).toEqual([{ path: '/calendar', params: { date: '2026-10-15' }, source: HUB_ID }]);
    expect(await hub.server.routeDeepLink('nebula://hub/downloads')).toBe('link');
    expect(hub.hubOpens).toEqual([{ path: '/downloads', params: {} }]);
    expect(await hub.server.routeDeepLink('nebula://gamma/')).toBe('store');
    expect(hub.pages).toEqual(['nebula.gamma']);
    expect(await hub.server.routeDeepLink('nebula://alpha/calendar?date=tomorrow')).toBe('invalid');
    expect(await hub.server.routeDeepLink('nebula://unknown/')).toBe('invalid');
    expect(await hub.server.routeDeepLink('javascript:alert(1)')).toBe('invalid');
  });

  it('opens the Hub on request (I2)', async () => {
    const consumer = track(beta(hub.sessionFile));
    await consumer.link.connect();
    expect(await consumer.link.intent(HUB_ID, '/app', { id: 'nebula.alpha' })).toEqual({ ok: true, value: { delivered: 'link' } });
    expect(hub.hubOpens).toEqual([{ path: '/app', params: { id: 'nebula.alpha' } }]);
  });
});

describe('invalid messages', () => {
  it('answers each invalid message, and closes after three', async () => {
    const client = await rawConnect(hub.pipe);
    await rawAuth(client, hub.token, 'nebula.beta', manifestOf('beta'));
    client.sendText('{ not json\n');
    await client.waitFor((message) => (message.error as { code?: number } | undefined)?.code === -32700);
    client.send({ jsonrpc: '2.0', id: 'x', method: 'Not A Method' });
    await client.waitFor((message) => (message.error as { code?: number } | undefined)?.code === -32600);
    client.send({ jsonrpc: '2.0', id: 'y', method: 'link.teleport', params: {} });
    await client.waitFor((message) => message.id === 'y');
    await client.waitClosed();
  });

  it('refuses a message over 256 KiB without losing the stream', async () => {
    const client = await rawConnect(hub.pipe);
    await rawAuth(client, hub.token, 'nebula.beta', manifestOf('beta'));
    client.sendText(`${JSON.stringify({ jsonrpc: '2.0', id: 'big', method: 'link.ping', params: { pad: 'x'.repeat(300 * 1024) } })}\n`);
    await client.waitFor((message) => (message.error as { code?: number } | undefined)?.code === -32007);
    client.send({ jsonrpc: '2.0', id: 'after', method: 'link.ping', params: {} });
    expect((await client.waitFor((message) => message.id === 'after')).result).toEqual({});
  });

  it('limits the rate of messages', async () => {
    const client = await rawConnect(hub.pipe);
    await rawAuth(client, hub.token, 'nebula.beta', manifestOf('beta'));
    for (let index = 0; index < 150; index += 1) client.send({ jsonrpc: '2.0', id: `p${index}`, method: 'link.ping', params: {} });
    await client.waitFor((message) => (message.error as { code?: number } | undefined)?.code === -32009);
  });
});

describe('Home widgets (M7)', () => {
  const alphaManifest = () => {
    const parsed = parseManifestBytes(fs.readFileSync(manifestOf('alpha')));
    if (!parsed.ok) throw new Error('alpha manifest');
    return parsed.manifest;
  };

  it('reads a private widget only after the user says yes, and forgets its value when hidden', async () => {
    const seen: WidgetView[][] = [];
    const board = new WidgetBoard({
      manifests: () => [alphaManifest()],
      connected: () => hub.server.connectedApps().map((app) => app.appId),
      query: (capability) => hub.server.queryAs(HUB_ID, capability),
      onChange: (widgets) => seen.push(widgets),
    });
    board.sync();
    expect(board.views()).toMatchObject([{ id: 'alpha.status', state: 'offline', sensitivity: 'private' }]);

    const { link } = track(alpha(hub.sessionFile));
    await link.connect();
    await eventually(() => hub.server.connectedApps().some((app) => app.appId === 'nebula.alpha'));
    board.connectionsChanged();
    await eventually(() => board.views()[0].state === 'consent-required');
    expect(hub.consentRequests).toContainEqual({ consumer: HUB_ID, capability: 'alpha.status' });

    hub.grant(HUB_ID, 'alpha.status');
    // Granted is not enough: Alpha must also have declared its widgets ready (link.ready).
    for (let tries = 0; tries < 300 && 'error' in (await hub.server.queryAs(HUB_ID, 'alpha.status')); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    board.consentChanged('alpha.status');
    await eventually(() => board.views()[0].state === 'ready');
    expect(board.views()[0].data).toMatchObject({ title: 'État', value: 'OK' });

    board.setVisible(false);
    expect(board.views()[0]).toMatchObject({ state: 'loading', data: null });
    board.setVisible(true);
    await eventually(() => board.views()[0].state === 'ready');
    expect(seen.length).toBeGreaterThan(3);
  });

  it('marks the widget offline when its app leaves', async () => {
    const board = new WidgetBoard({
      manifests: () => [alphaManifest()],
      connected: () => hub.server.connectedApps().map((app) => app.appId),
      query: (capability) => hub.server.queryAs(HUB_ID, capability),
      onChange: () => undefined,
    });
    hub.grant(HUB_ID, 'alpha.status');
    const { link } = track(alpha(hub.sessionFile));
    await link.connect();
    await eventually(() => hub.server.connectedApps().length === 1);
    // Connected is not ready yet: wait until Alpha has declared its widgets (link.ready).
    for (let tries = 0; tries < 300 && 'error' in (await hub.server.queryAs(HUB_ID, 'alpha.status')); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    board.sync();
    await eventually(() => board.views()[0].state === 'ready');
    link.dispose();
    await eventually(() => hub.server.connectedApps().length === 0);
    board.connectionsChanged();
    expect(board.views()[0]).toMatchObject({ state: 'offline', data: null });
  });
});

describe('Hub mode (ADR-027)', () => {
  it('tells a docked app where to be, only that app, and follows the Hub window', async () => {
    const { link, events } = track(beta(hub.sessionFile));
    await link.connect();
    await eventually(() => hub.server.subscribersOf('nebula.hub.dock').includes('nebula.beta'));
    expect(hub.server.subscribersOf('nebula.hub.dock')).toEqual(['nebula.beta']);
    expect(hub.server.sendTo('nebula.alpha', 'nebula.hub.dock', { state: 'released' })).toBe(false);
    expect(hub.server.sendTo('nebula.beta', 'nebula.hub.dock', { state: 'docked', visible: true })).toBe(false);

    let content: { x: number; y: number; width: number; height: number } | null = { x: 100, y: 80, width: 1280, height: 860 };
    const dock = new DockController({
      dockable: () => ['nebula.beta'],
      subscribed: () => hub.server.subscribersOf('nebula.hub.dock'),
      send: (appId, payload) => hub.server.sendTo(appId, 'nebula.hub.dock', payload),
      content: () => content,
      launch: async () => true,
      onChange: () => undefined,
    });
    // The renderer reports the area of the docked screen, then the app is shown there.
    dock.setArea({ x: 236, y: 0, width: 1044, height: 860 });
    await dock.show('nebula.beta');
    const docks = () => events.filter((entry) => entry.event === 'nebula.hub.dock').map((entry) => entry.payload);
    await eventually(() => docks().length === 1);
    expect(docks()[0]).toEqual({ state: 'docked', visible: true, raise: true, bounds: { x: 336, y: 80, width: 1044, height: 860 } });

    content = { x: 400, y: 80, width: 1280, height: 860 };
    dock.windowChanged();
    content = null;
    dock.windowChanged();
    dock.release('nebula.beta');
    await eventually(() => docks().length === 4);
    expect(docks().slice(1)).toEqual([
      { state: 'docked', visible: true, raise: false, bounds: { x: 636, y: 80, width: 1044, height: 860 } },
      { state: 'docked', visible: false, raise: false, bounds: { x: 0, y: 0, width: 0, height: 0 } },
      { state: 'released' },
    ]);
  });

  it('does not send the Hub mode to an app whose pair the user turned off', async () => {
    const { link, events } = track(beta(hub.sessionFile));
    await link.connect();
    await eventually(() => hub.server.subscribersOf('nebula.hub.dock').includes('nebula.beta'));
    hub.deny('nebula.beta', 'nebula.hub.dock');
    expect(hub.server.sendTo('nebula.beta', 'nebula.hub.dock', { state: 'released' })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.some((entry) => entry.event === 'nebula.hub.dock')).toBe(false);
  });
});
