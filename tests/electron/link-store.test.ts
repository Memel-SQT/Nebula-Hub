/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSession } from '@nebula/link';
import { HubDatabase } from '../../src/electron/db';
import { LinkStore } from '../../src/electron/link/link-store';
import { parseSid, pipeForUser, readInstalledManifest, removeSession, writeSession } from '../../src/electron/link/session';

const AT = '2026-10-02T08:00:00.000Z';

async function store(): Promise<LinkStore> {
  const db = HubDatabase.inMemory();
  await db.initialize();
  const links = new LinkStore(db, 10);
  links.load();
  return links;
}

describe('LinkStore', () => {
  it('records, changes and forgets consents', async () => {
    const links = await store();
    await links.setConsent('nebula.hub', 'finterest.budget.remaining', 'granted', AT);
    expect(links.consent('nebula.hub', 'finterest.budget.remaining')).toBe('granted');
    await links.setConsent('nebula.hub', 'finterest.budget.remaining', 'denied', AT);
    expect(links.consent('nebula.hub', 'finterest.budget.remaining')).toBe('denied');
    await links.setConsent('nebula.hub', 'finterest.budget.remaining', null, AT);
    expect(links.consent('nebula.hub', 'finterest.budget.remaining')).toBeNull();
  });

  it('archives an uninstalled app’s pairs and restores them on reinstall', async () => {
    const links = await store();
    await links.setConsent('nebula.hub', 'finterest.budget.remaining', 'granted', AT);
    await links.setConsent('nebula.finterest', 'nebula.appearance.changed', 'granted', AT);
    await links.setConsent('nebula.news', 'clock.break.started', 'granted', AT);
    await links.archiveApp('nebula.finterest', 'finterest', AT);
    expect(links.consent('nebula.hub', 'finterest.budget.remaining')).toBeNull();
    expect(links.consent('nebula.finterest', 'nebula.appearance.changed')).toBeNull();
    expect(links.consent('nebula.news', 'clock.break.started')).toBe('granted');
    await links.restoreApp('nebula.finterest', 'finterest');
    expect(links.consent('nebula.hub', 'finterest.budget.remaining')).toBe('granted');
    expect(links.consent('nebula.finterest', 'nebula.appearance.changed')).toBe('granted');
  });

  it('journals exchanges in batches, without content, and knows the last exchange per pair', async () => {
    const links = await store();
    links.audit({ at: AT, consumer: 'nebula.hub', provider: 'nebula.finterest', capability: 'finterest.budget.remaining', kind: 'widget', outcome: 'delivered', bytes: 64 });
    links.audit({ at: '2026-10-02T09:00:00.000Z', consumer: 'nebula.hub', provider: 'nebula.finterest', capability: 'finterest.budget.remaining', kind: 'widget', outcome: 'consent-required', bytes: 0 });
    // Not flushed yet, already visible.
    expect(links.lastExchanges().get('nebula.hub|finterest.budget.remaining')).toBe(AT);
    await links.flush();
    expect(links.lastExchanges().get('nebula.hub|finterest.budget.remaining')).toBe(AT);
  });

  it('keeps notifications, erases them by app or all, and purges after 30 days', async () => {
    const links = await store();
    const base = { notificationId: null, deepLink: null, category: null };
    await links.addNotification('nebula.finterest', { ...base, title: 'Prélèvement', body: 'Demain', sensitivity: 'private' }, '2026-08-01T00:00:00.000Z');
    await links.addNotification('nebula.finterest', { ...base, title: 'Budget', body: 'OK', sensitivity: 'public' }, AT);
    await links.addNotification('nebula.news', { ...base, title: 'Briefing', body: '3 sujets', sensitivity: 'public' }, AT);
    expect(links.listNotifications().map((item) => item.title)).toEqual(['Briefing', 'Budget', 'Prélèvement']);
    await links.purge(new Date(AT));
    expect(links.listNotifications().map((item) => item.title)).toEqual(['Briefing', 'Budget']);
    await links.deleteNotifications('nebula.finterest');
    expect(links.listNotifications().map((item) => item.title)).toEqual(['Briefing']);
    await links.deleteNotifications();
    expect(links.listNotifications()).toEqual([]);
  });
});

describe('Link session', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-link-session-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('names the pipe after the user’s SID', () => {
    expect(parseSid('"pc\\noe","S-1-5-21-1111-2222-3333-1001"\r\n')).toBe('S-1-5-21-1111-2222-3333-1001');
    expect(parseSid('garbage')).toBeNull();
    const pipe = pipeForUser('S-1-5-21-1111-2222-3333-1001');
    expect(pipe).toMatch(/^\\\\\.\\pipe\\nebula-link-[0-9a-f]{16}$/);
    expect(pipeForUser('S-1-5-21-1111-2222-3333-1002')).not.toBe(pipe);
  });

  it('writes a fresh session each start and removes only its own', async () => {
    const first = await writeSession(dir, pipeForUser('S-1-5-21-1'), '0.2.0');
    const file = path.join(dir, 'session.json');
    expect(parseSession(JSON.parse(fs.readFileSync(file, 'utf8')))).toEqual(first);
    const second = await writeSession(dir, pipeForUser('S-1-5-21-1'), '0.2.0');
    expect(second.token).not.toBe(first.token);
    await removeSession(dir, first.token);
    expect(fs.existsSync(file)).toBe(true);
    await removeSession(dir, second.token);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('reads the manifest from the install folder only, and only the app’s own', async () => {
    const location = path.join(dir, 'app');
    fs.mkdirSync(path.join(location, 'resources'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', 'link-harness', 'apps', 'alpha', 'nebula.app.json'), path.join(location, 'resources', 'nebula.app.json'));
    const admitted = await readInstalledManifest('nebula.alpha', location, 'nebula.app.json');
    expect(admitted?.manifest.provides).toHaveLength(6);
    expect(admitted?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await readInstalledManifest('nebula.beta', location, 'nebula.app.json')).toBeNull();
    expect(await readInstalledManifest('nebula.alpha', location, '..\\secrets.json')).toBeNull();
    expect(await readInstalledManifest('nebula.alpha', path.join(dir, 'nowhere'), 'nebula.app.json')).toBeNull();
  });
});
