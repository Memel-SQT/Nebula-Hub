import { isHubEntry, shouldRelay, toastContent, unreadCount } from './activity';
import { mainString, operationEntry } from './main-strings';

const item = (receivedAt: string) => ({ id: 1, appId: 'nebula.clock', receivedAt, title: 't', body: 'b', sensitivity: 'public' as const, deepLink: null, category: null });

describe('activity center rules', () => {
  it('counts what arrived after the last visit (everything if never opened)', () => {
    const items = [item('2026-10-02T10:00:00.000Z'), item('2026-10-01T10:00:00.000Z')];
    expect(unreadCount(items, '2026-10-01T12:00:00.000Z')).toBe(1);
    expect(unreadCount(items, null)).toBe(2);
  });

  it('relays to Windows only when on, not muted and the Hub is not in front', () => {
    const settings = { windowsNotifications: true, mutedApps: ['nebula.news'] };
    expect(shouldRelay({ appId: 'nebula.clock' }, settings, false)).toBe(true);
    expect(shouldRelay({ appId: 'nebula.clock' }, settings, true)).toBe(false);
    expect(shouldRelay({ appId: 'nebula.news' }, settings, false)).toBe(false);
    expect(shouldRelay({ appId: 'nebula.clock' }, { ...settings, windowsNotifications: false }, false)).toBe(false);
  });

  it('never puts the text of a private notification in Windows [CRITIQUE]', () => {
    expect(toastContent({ title: 'Prélèvement demain', body: 'Loyer 800 €', sensitivity: 'private' }, 'Nebula Finterest', 'Nouvelle notification privée')).toEqual({ title: 'Nebula Finterest', body: 'Nouvelle notification privée' });
    expect(toastContent({ title: 'Briefing prêt', body: '3 sujets', sensitivity: 'public' }, 'Nebula News', 'x')).toEqual({ title: 'Briefing prêt', body: '3 sujets' });
  });

  it('recognizes the Hub’s own entries', () => {
    expect(isHubEntry({ appId: 'nebula.hub' })).toBe(true);
    expect(isHubEntry({ appId: 'nebula.clock' })).toBe(false);
  });
});

describe('main-process strings', () => {
  it('fills parameters and leaves unknown ones visible', () => {
    expect(mainString('fr', 'trayActivity', { count: '2' })).toBe('Centre d’activité (2 non lue(s))');
    expect(mainString('en', 'trayLaunch')).toBe('Launch {name}');
  });

  it('describes finished operations, not cancelled ones', () => {
    expect(operationEntry('fr', { kind: 'update', outcome: 'success', version: '0.1.36' }, 'Nebula Finterest')).toEqual({ title: 'Nebula Finterest est à jour', body: 'Version 0.1.36.' });
    expect(operationEntry('en', { kind: 'uninstall', outcome: 'success', version: '1.0.0' }, 'Nebula Clock')?.title).toBe('Nebula Clock was uninstalled');
    expect(operationEntry('fr', { kind: 'install', outcome: 'failed', version: '1.0.0' }, 'Nebula Clock')?.title).toBe('Échec de l’opération sur Nebula Clock');
    expect(operationEntry('fr', { kind: 'install', outcome: 'cancelled', version: '1.0.0' }, 'Nebula Clock')).toBeNull();
  });
});
