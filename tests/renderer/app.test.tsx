import { act, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type HubSettings } from '../../src/shared/settings';
import type { NebulaHubBridge } from '../../src/shared/bridge';
import type { PackView } from '../../src/shared/packs';
import type { Route } from '../../src/shared/route';
import type { DownloadsView } from '../../src/shared/install-state';
import { EMPTY_LINK_VIEW } from '../../src/shared/link-view';
import type { ActivityItem } from '../../src/shared/activity';
import type { WidgetView } from '../../src/shared/widgets';
import { EMPTY_DOCK_VIEW, type DockView } from '../../src/shared/dock';
import { EMPTY_HUB_UPDATE_VIEW, type HubUpdateView } from '../../src/shared/hub-update';
import { App } from '../../src/renderer/App';
import { catalogView, downloadsView, installedView, operation } from './fixtures';

/** Renders and lets the initial catalog request resolve inside act(). */
async function render(node: JSX.Element) {
  const result = rtlRender(node);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

/** Widgets and activity the next installBridge() serves (reset after each test). */
let widgets: WidgetView[] = [];
let activity: ActivityItem[] = [];
let dockView: DockView = EMPTY_DOCK_VIEW;
const UP_TO_DATE: HubUpdateView = { ...EMPTY_HUB_UPDATE_VIEW, current: '0.1.0' };
let hubUpdateView: HubUpdateView = UP_TO_DATE;
afterEach(() => {
  widgets = [];
  activity = [];
  dockView = EMPTY_DOCK_VIEW;
  hubUpdateView = UP_TO_DATE;
});

function widget(overrides: Partial<WidgetView> = {}): WidgetView {
  return { id: 'clock.focus.today', provider: 'nebula.clock', title: { fr: 'Focus du jour', en: 'Today’s focus' }, sensitivity: 'public', state: 'ready', data: { title: 'Pomodoros', value: '3/8', updatedAt: '2026-10-02T09:00:00.000Z' }, refreshedAt: '2026-10-02T09:00:00.000Z', ...overrides };
}

function entry(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return { id: 1, appId: 'nebula.clock', receivedAt: '2026-10-02T09:00:00.000Z', title: 'Session terminée', body: '4 pomodoros aujourd’hui', sensitivity: 'public', deepLink: null, category: null, ...overrides };
}

function installBridge(overrides: Partial<HubSettings> = {}, startedHidden = true, installed = installedView(), packs: PackView[] = []) {
  let settings: HubSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const listeners: Array<(value: boolean) => void> = [];
  const downloadListeners: Array<(view: DownloadsView) => void> = [];
  const hubUpdateListeners: Array<(view: HubUpdateView) => void> = [];
  const quitAskListeners: Array<() => void> = [];
  const bridge: NebulaHubBridge = {
    getInitialState: () => ({ settings, appVersion: '0.1.0', startedHidden, packs }),
    updateAppearance: jest.fn(async (patch) => {
      settings = { ...settings, appearance: { ...settings.appearance, ...patch } };
      return settings;
    }),
    updateSettings: jest.fn(async (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    }),
    onSettingsChanged: () => () => undefined,
    onWindowVisibility: (callback) => {
      listeners.push(callback);
      return () => undefined;
    },
    openExternal: jest.fn(async () => true),
    getCatalog: jest.fn(async () => catalogView()),
    refreshCatalog: jest.fn(async () => catalogView()),
    getCatalogAsset: jest.fn(async () => null),
    onCatalogChanged: () => () => undefined,
    getInstalled: jest.fn(async () => installed),
    refreshInstalled: jest.fn(async () => installedView()),
    onInstalledChanged: () => () => undefined,
    onPacksChanged: () => () => undefined,
    launchApp: jest.fn(async () => 'launched' as const),
    showAppFolder: jest.fn(async () => true),
    installApp: jest.fn(async () => 'queued' as const),
    getDownloads: jest.fn(async () => downloadsView({ operations: [], history: [] })),
    onDownloadsChanged: (callback) => {
      downloadListeners.push(callback);
      return () => undefined;
    },
    cancelOperation: jest.fn(async () => true),
    dismissOperation: jest.fn(async () => true),
    exportHistory: jest.fn(async () => 'saved' as const),
    pickInstallDirectory: jest.fn(async () => null),
    planOperation: jest.fn(async (appId, kind) => ({ appId, kind, version: '0.1.36', fromVersion: '0.1.35', needsConfirmation: kind !== 'update' || appId === 'nebula.finterest', backupPath: appId === 'nebula.finterest' ? 'C:\\Users\\<user>\\Documents\\Nebula Finterest\\finterest-store-backup-2026-10-01_21-05-03.json' : null, backupCopyPath: null, running: false, blocked: null })),
    startOperation: jest.fn(async () => 'queued' as const),
    requestAppClose: jest.fn(async () => true),
    continueWithoutBackup: jest.fn(async () => true),
    onNavigateRequest: () => () => undefined,
    getLink: jest.fn(async () => EMPTY_LINK_VIEW),
    onLinkChanged: () => () => undefined,
    setLinkConsent: jest.fn(async () => EMPTY_LINK_VIEW),
    denyLinkApp: jest.fn(async () => EMPTY_LINK_VIEW),
    openDeepLink: jest.fn(async () => true),
    getWidgets: jest.fn(async () => widgets),
    onWidgetsChanged: () => () => undefined,
    refreshWidget: jest.fn(async () => true),
    getActivity: jest.fn(async () => activity),
    onActivityChanged: () => () => undefined,
    clearActivity: jest.fn(async () => []),
    exportAppData: jest.fn(async () => ({ ok: true as const, path: 'C:\\Users\\<user>\\Documents\\Nebula Finterest\\finterest-store-backup-2026-10-02_10-00-00.json', accounts: 2, copyPath: null, copyState: null })),
    importAppData: jest.fn(async () => ({ mode: 'manual' as const, file: 'C:\\Users\\<user>\\Documents\\Nebula Finterest\\old.json', accounts: 2 })),
    saveInstaller: jest.fn(async () => ({ ok: true as const, path: 'C:\\Users\\<user>\\Downloads\\Nebula-Clock-Setup-1.1.3.exe' })),
    onInstallerSaveProgress: () => () => undefined,
    revealFile: jest.fn(async () => true),
    pickBackupCopyDirectory: jest.fn(async () => null),
    getDock: jest.fn(async () => dockView),
    onDockChanged: () => () => undefined,
    showDocked: jest.fn(async () => true),
    setDockArea: jest.fn(),
    releaseDocked: jest.fn(async () => true),
    getHubUpdate: jest.fn(async () => hubUpdateView),
    onHubUpdateChanged: (callback) => {
      hubUpdateListeners.push(callback);
      return () => undefined;
    },
    startHubUpdate: jest.fn(async () => 'started' as const),
    cancelHubUpdate: jest.fn(async () => true),
    quitNebula: jest.fn(async () => 'quitting' as const),
    onQuitNebulaRequest: (callback) => {
      quitAskListeners.push(callback);
      return () => undefined;
    },
  };
  window.nebulaHub = bridge;
  return {
    bridge,
    setVisible: (visible: boolean) => listeners.forEach((listener) => listener(visible)),
    pushDownloads: (view: DownloadsView) => act(() => downloadListeners.forEach((listener) => listener(view))),
    pushHubUpdate: (view: HubUpdateView) => act(() => hubUpdateListeners.forEach((listener) => listener(view))),
    askQuit: () => act(() => quitAskListeners.forEach((listener) => listener())),
  };
}

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

describe('App', () => {
  it('skips the splash when started hidden in the tray and opens on Home', async () => {
    installBridge();
    await render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mes apps Nebula' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('nebula-dark');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('plays the splash on a normal start', async () => {
    installBridge({}, false);
    await render(<App />);
    expect(screen.getByRole('main', { name: 'Nebula Hub' })).toHaveClass('splash-screen');
  });

  it('navigates with the sidebar and marks the current page', async () => {
    installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Réglages' })).toHaveAttribute('aria-current', 'page');
  });

  it('applies an appearance change immediately and saves it through the bridge', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Verre clair' }));
    expect(document.documentElement.dataset.theme).toBe('glass-light');
    expect(bridge.updateAppearance).toHaveBeenCalledWith({ theme: 'glass-light' });

    await userEvent.click(screen.getByRole('radio', { name: 'Braise' }));
    expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('');

    await userEvent.click(screen.getByRole('radio', { name: 'Désactivées' }));
    expect(document.documentElement.dataset.motion).toBe('off');

    await userEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('resets the appearance to nebula-dark and the defaults', async () => {
    const { bridge } = installBridge({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: 'glass-light', accentPreset: 'ember', background: 'waves' } });
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('button', { name: /Réinitialiser l’apparence/ }));
    expect(bridge.updateAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'nebula-dark', accentPreset: 'nebula', background: 'glow', motion: 'full' }));
    expect(document.documentElement.dataset.background).toBe('glow');
  });

  it('offers the themes of an appearance pack only when one is there, with its names and back again (spec § 18)', async () => {
    const pack: PackView = {
      id: 'sample',
      ownerAppId: 'nebula.finterest',
      themes: [{ id: 'sample-dark', scheme: 'dark', label: { fr: 'Exemple nuit' }, tokens: { '--page': '#101010' }, chrome: { page: '#101010', ink: '#f0f0f0' } }],
      names: { 'nebula.hub': 'Sample Hub', 'nebula.clock': 'Sample Clock' },
      markUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      iconUrls: { 'nebula.clock': 'data:image/svg+xml;base64,PHN2Zz5jPC9zdmc+' },
    };
    const { bridge } = installBridge({}, true, installedView(), [pack]);
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Exemple nuit' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ packTheme: 'sample-dark' });
    expect(document.documentElement.dataset.packTheme).toBe('sample-dark');
    expect(document.documentElement.dataset.theme).toBe('nebula-dark');
    expect(document.documentElement.style.getPropertyValue('--page')).toBe('#101010');
    expect(screen.getAllByText('Sample Hub').length).toBeGreaterThan(0);
    expect(document.title).toBe('Sample Hub');
    expect(screen.getAllByText('Sample Clock').length).toBeGreaterThan(0);
    expect(document.querySelector('.brand-lockup img')).toHaveAttribute('src', pack.markUrl);
    expect(document.querySelector(`img[src="${pack.iconUrls['nebula.clock']}"]`)).not.toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Verre clair' }));
    expect(bridge.updateSettings).toHaveBeenLastCalledWith({ packTheme: null });
    expect(document.documentElement.dataset.packTheme).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--page')).toBe('');
    expect(document.documentElement.dataset.theme).toBe('glass-light');
    expect(screen.queryByText('Sample Hub')).not.toBeInTheDocument();
  });

  it('shows no extra theme without a pack, and ignores a saved pack theme whose pack is gone', async () => {
    installBridge({ packTheme: 'sample-dark' });
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getAllByRole('radio', { name: /nuit|jour|Verre|Nebula|Système|clair|sombre/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio', { name: 'Exemple nuit' })).not.toBeInTheDocument();
    expect(document.documentElement.dataset.packTheme).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('nebula-dark');
  });

  it('launches an installed app from the sidebar launcher', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Clock' }));
    expect(bridge.launchApp).toHaveBeenCalledWith('nebula.clock');
  });

  it('explains a failed launch', async () => {
    const { bridge } = installBridge();
    (bridge.launchApp as jest.Mock).mockResolvedValueOnce('missing-exe');
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Clock' }));
    expect(await screen.findByText('Nebula Clock semble mal installée : son exécutable est introuvable.')).toBeInTheDocument();
  });

  it('installs an app from its page and shows the operation as it progresses', async () => {
    const { bridge, pushDownloads } = installBridge({}, true, installedView({ apps: [] }));
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    await userEvent.click(screen.getByRole('button', { name: 'Installer Nebula Finterest' }));
    expect(bridge.installApp).toHaveBeenCalledWith('nebula.finterest');
    await pushDownloads(downloadsView({ operations: [operation()], history: [] }));
    expect(screen.getByRole('progressbar', { name: /Nebula Finterest/ })).toBeInTheDocument();
    expect(screen.getByLabelText('1 en cours')).toBeInTheDocument();
  });

  it('explains a refused install', async () => {
    const { bridge } = installBridge({}, true, installedView({ apps: [] }));
    (bridge.installApp as jest.Mock).mockResolvedValueOnce('already-queued');
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    await userEvent.click(screen.getByRole('button', { name: 'Installer Nebula Finterest' }));
    expect(await screen.findByText('Nebula Finterest est déjà dans la file d’attente.')).toBeInTheDocument();
  });

  it('reacts to the window being hidden in the tray', async () => {
    const { setVisible } = installBridge();
    await render(<App />);
    act(() => setVisible(false));
    act(() => setVisible(true));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('App: confirmations (R04)', () => {
  async function openMyApps() {
    await userEvent.click(screen.getByRole('button', { name: /Mes apps/ }));
  }

  it('confirms an uninstall, showing the data notice and the backup path, and can be cancelled with Escape', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await openMyApps();
    await userEvent.click(screen.getByRole('button', { name: 'Désinstaller Nebula Finterest' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Désinstaller Nebula Finterest ?' });
    expect(bridge.planOperation).toHaveBeenCalledWith('nebula.finterest', 'uninstall');
    expect(within(dialog).getByText(/Une désinstallation supprime ensuite les données/)).toBeInTheDocument();
    expect(within(dialog).getByText(/finterest-store-backup-2026-10-01_21-05-03\.json/)).toBeInTheDocument();
    // The safe choice has the focus.
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(bridge.startOperation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Désinstaller Nebula Finterest' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Désinstaller' }));
    expect(bridge.startOperation).toHaveBeenCalledWith('nebula.finterest', 'uninstall', true);
  });

  it('confirms the update of an app that backs up its data', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await openMyApps();
    await userEvent.click(screen.getAllByRole('button', { name: 'Mettre à jour Nebula Finterest' })[0]);
    const dialog = await screen.findByRole('alertdialog', { name: 'Mettre à jour Nebula Finterest ?' });
    expect(within(dialog).getByText('La version v0.1.36 remplace la v0.1.35. Vos données sont conservées.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mettre à jour' }));
    expect(bridge.startOperation).toHaveBeenCalledWith('nebula.finterest', 'update', true);
  });

  it('asks a second time before continuing without backup', async () => {
    const { bridge, pushDownloads } = installBridge();
    await render(<App />);
    await openMyApps();
    await pushDownloads(downloadsView({ operations: [operation({ id: 'op-9', kind: 'update', fromVersion: '0.1.35', phase: 'backup-failed', backup: { path: 'C:\\x.json', state: 'failed', accounts: null, problem: 'missing', copyPath: null, copyState: null } })], history: [] }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuer sans sauvegarde' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Continuer sans sauvegarde ?' });
    expect(bridge.continueWithoutBackup).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuer sans sauvegarde' }));
    expect(bridge.continueWithoutBackup).toHaveBeenCalledWith('op-9');
  });

  it('confirms automatic updates for an app that backs up its data, not for the others', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await openMyApps();
    await userEvent.click(screen.getByRole('switch', { name: 'Mise à jour automatique de Nebula Clock' }));
    expect(bridge.updateSettings).toHaveBeenLastCalledWith({ autoUpdate: { 'nebula.clock': true } });
    await userEvent.click(screen.getByRole('switch', { name: 'Mise à jour automatique de Nebula Finterest' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Mettre à jour Nebula Finterest automatiquement ?' });
    expect(within(dialog).getByText(/Documents\\Nebula Finterest/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Activer' }));
    expect(bridge.updateSettings).toHaveBeenLastCalledWith({ autoUpdate: { 'nebula.clock': true, 'nebula.finterest': true } });
  });

  it('opens the screen the tray asks for', async () => {
    const { bridge } = installBridge();
    let navigate: (route: Route) => void = () => undefined;
    bridge.onNavigateRequest = (callback) => {
      navigate = callback;
      return () => undefined;
    };
    await render(<App />);
    await act(async () => navigate({ screen: 'downloads' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Téléchargements' })).toBeInTheDocument();
  });
});

describe('App: Home widgets and activity center (M7)', () => {
  it('shows the widgets in the saved order and moves one with the keyboard, announcing it', async () => {
    widgets = [widget(), widget({ id: 'news.headlines.today', provider: 'nebula.news', title: { fr: 'À la une' }, data: { title: 'Briefing', items: [{ label: 'Climat', value: 'Le Monde' }], updatedAt: '2026-10-02T09:00:00.000Z' } })];
    const { bridge } = installBridge({ widgetOrder: ['news.headlines.today', 'clock.focus.today'] });
    await render(<App />);
    const cards = within(screen.getByRole('list', { name: 'En un coup d’œil' })).getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual(['À la une', 'Focus du jour']);
    expect(screen.getByRole('button', { name: 'Déplacer À la une vers le début' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer Focus du jour vers le début' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ widgetOrder: ['clock.focus.today', 'news.headlines.today'] });
    expect(screen.getByRole('status')).toHaveTextContent('Focus du jour est maintenant en position 1 sur 2.');
  });

  it('masks a private value until asked, and asks for consent on an undecided private widget', async () => {
    widgets = [
      widget({ id: 'finterest.budget.remaining', provider: 'nebula.finterest', title: { fr: 'Reste à vivre' }, sensitivity: 'private', data: { title: 'Ce mois-ci', value: '412', unit: '€', updatedAt: '2026-10-02T09:00:00.000Z' } }),
      widget({ id: 'finterest.other', provider: 'nebula.finterest', title: { fr: 'Prélèvements' }, sensitivity: 'private', state: 'consent-required', data: null }),
    ];
    const { bridge } = installBridge();
    await render(<App />);
    expect(screen.queryByText('412')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Valeur masquée' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher la valeur de Reste à vivre' }));
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masquer la valeur de Reste à vivre' })).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByText('Cette carte affiche une donnée privée de Nebula Finterest. L’autoriser sur l’accueil ?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Autoriser' }));
    expect(bridge.setLinkConsent).toHaveBeenCalledWith('nebula.hub', 'finterest.other', 'granted');
  });

  it('offers to open an app whose widget is offline', async () => {
    widgets = [widget({ state: 'offline', data: null })];
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Lancer Nebula Clock' }));
    expect(bridge.launchApp).toHaveBeenCalledWith('nebula.clock');
  });

  it('lists the activity, hides private text until asked, opens a deep link and marks everything read', async () => {
    activity = [
      entry({ id: 3, appId: 'nebula.hub', title: 'Nebula Clock est à jour', body: 'Version 1.2.0.', deepLink: 'nebula://hub/downloads', receivedAt: '2026-09-30T10:00:00.000Z' }),
      entry({ id: 2, appId: 'nebula.finterest', title: 'Prélèvement demain', body: 'Loyer', sensitivity: 'private', receivedAt: '2026-09-30T09:30:00.000Z' }),
      entry({ id: 1, receivedAt: '2026-09-28T09:00:00.000Z' }),
    ];
    const { bridge } = installBridge({ activitySeenAt: '2026-09-29T12:00:00.000Z' });
    await render(<App />);
    const panel = screen.getByRole('region', { name: 'Activité récente' });
    expect(within(panel).getByText('2 non lue(s)')).toBeInTheDocument();
    expect(within(panel).queryByText('Prélèvement demain')).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Afficher/ }));
    expect(within(panel).getByText('Prélèvement demain')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Ouvrir/ }));
    expect(bridge.openDeepLink).toHaveBeenCalledWith('nebula://hub/downloads');
    await userEvent.click(within(panel).getByRole('button', { name: /Tout marquer comme lu/ }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ activitySeenAt: expect.stringMatching(/^\d{4}-/) });
    expect(within(panel).getByText('Tout est lu')).toBeInTheDocument();
  });

  it('erases the history from Settings → Advanced after a confirmation', async () => {
    activity = [entry()];
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Effacer Nebula Clock' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Effacer l’historique ?' });
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Effacer' }));
    expect(bridge.clearActivity).toHaveBeenCalledWith('nebula.clock');
  });

  it('mutes one app in Windows notifications and turns start with Windows on', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Par app' })).getByRole('switch', { name: 'Nebula Clock' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ mutedApps: ['nebula.clock'] });
    await userEvent.click(screen.getByRole('switch', { name: /Démarrer avec Windows/ }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ launchAtLogin: true });
  });
});

describe('App: first launch (M7)', () => {
  it('walks through the three screens with the keyboard, applies the choices and finishes', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('button', { name: /Revoir l’accueil/ }));
    const dialog = screen.getByRole('dialog', { name: 'Bienvenue dans Nebula Hub' });
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(within(dialog).getByText('Étape 1 sur 3')).toBeInTheDocument();

    await userEvent.keyboard('{Tab}{Enter}');
    const apps = screen.getByRole('dialog', { name: 'Vos apps déjà installées' });
    expect(within(apps).getByText('Nebula Finterest')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    const login = screen.getByRole('radiogroup', { name: 'Démarrer avec Windows' });
    await userEvent.click(within(login).getByRole('radio', { name: 'Oui' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ launchAtLogin: true });
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Notifications Windows' })).getByRole('radio', { name: 'Non' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ windowsNotifications: false });

    await userEvent.click(screen.getByRole('button', { name: 'C’est parti' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ onboardingCompleted: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can be skipped with Escape', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    await userEvent.click(screen.getByRole('button', { name: /Revoir l’accueil/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bridge.updateSettings).toHaveBeenCalledWith({ onboardingCompleted: true });
  });
});

describe('App: data and installers (ADR-026)', () => {
  it('uninstalls without backup only after unticking it, with a plain warning and a renamed button', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /Mes apps/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Désinstaller Nebula Finterest' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Désinstaller Nebula Finterest ?' });
    const box = within(dialog).getByRole('checkbox', { name: 'Sauvegarder mes données avant (recommandé)' });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('définitivement supprimées');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Désinstaller sans sauvegarde' }));
    expect(bridge.startOperation).toHaveBeenCalledWith('nebula.finterest', 'uninstall', true, { skipBackup: true });
  });

  it('installs in one click from a Discover tile', async () => {
    const { bridge } = installBridge({}, true, installedView({ apps: [] }));
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Découvrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Installer Nebula Finterest' }));
    expect(bridge.installApp).toHaveBeenCalledWith('nebula.finterest');
  });

  it('exports and imports the data from the app page, and shows the file', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    expect(screen.getByText(/vont toujours dans le dossier racine Documents.Nebula Finterest/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
    expect(bridge.exportAppData).toHaveBeenCalledWith('nebula.finterest');
    expect(await screen.findByText('Sauvegarde vérifiée (2 compte(s)) :')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher le fichier' }));
    expect(bridge.revealFile).toHaveBeenCalledWith(expect.stringContaining('finterest-store-backup-2026-10-02_10-00-00.json'));

    await userEvent.click(screen.getByRole('button', { name: 'Importer une sauvegarde' }));
    expect(await screen.findByText(/Réglages → Sauvegarde → Importer/)).toBeInTheDocument();
  });

  it('downloads the verified installer to Downloads', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger l’installeur' }));
    expect(bridge.saveInstaller).toHaveBeenCalledWith('nebula.finterest');
    expect(await screen.findByText('Installeur vérifié, enregistré dans Téléchargements :')).toBeInTheDocument();
  });

  it('chooses the folder of the backup copies in Settings', async () => {
    const { bridge } = installBridge({ backupCopyDirectory: 'E:\Sauvegardes' });
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getByText('E:\Sauvegardes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ne plus faire de copie/ }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ backupCopyDirectory: null });
    await userEvent.click(within(screen.getByRole('group', { name: 'Copie des sauvegardes' })).getByRole('button', { name: /Choisir un dossier/ }));
    expect(bridge.pickBackupCopyDirectory).toHaveBeenCalled();
  });
});

describe('App: apps inside the Hub (ADR-027)', () => {
  it('offers the Hub mode only to an app that supports it', async () => {
    installBridge();
    await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    expect(screen.getByText(/Le mode Hub arrivera avec une prochaine version de Nebula Finterest/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /dans le Hub/ })).not.toBeInTheDocument();
  });

  it('turns the Hub mode on, then opens the app inside the Hub from the launcher', async () => {
    dockView = { dockable: ['nebula.finterest'], open: [], active: null };
    const { bridge } = installBridge();
    const { rerender } = await render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Ouvrir Nebula Finterest dans le Hub plutôt que dans sa propre fenêtre' }));
    expect(bridge.updateSettings).toHaveBeenCalledWith({ openInHub: ['nebula.finterest'] });
    rerender(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Finterest' }));
    expect(bridge.showDocked).toHaveBeenCalledWith('nebula.finterest');
    expect(bridge.launchApp).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Nebula Finterest' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Zone de Nebula Finterest' })).toBeInTheDocument();
    expect(bridge.setDockArea).toHaveBeenCalledWith(expect.objectContaining({ width: expect.any(Number) }));
    expect(screen.getByText('Nebula Finterest a été fermée.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retour à l’accueil/ }));
    expect(bridge.setDockArea).toHaveBeenLastCalledWith(null);
  });

  it('detaches a docked app to its own window', async () => {
    dockView = { dockable: ['nebula.finterest'], open: [{ appId: 'nebula.finterest', connected: true }], active: 'nebula.finterest' };
    const { bridge } = installBridge({ openInHub: ['nebula.finterest'] });
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Finterest' }));
    expect(screen.getByText('Nebula Finterest s’affiche ici.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Détacher dans sa propre fenêtre/ }));
    expect(bridge.releaseDocked).toHaveBeenCalledWith('nebula.finterest');
    expect(screen.getByRole('heading', { level: 1, name: 'Mes apps Nebula' })).toBeInTheDocument();
  });

  it('opens an app in its own window when the Hub mode is off', async () => {
    dockView = { dockable: ['nebula.clock'], open: [], active: null };
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Clock' }));
    expect(bridge.launchApp).toHaveBeenCalledWith('nebula.clock');
    expect(bridge.showDocked).not.toHaveBeenCalled();
  });
});

/** The Hub's sidebar (the activity center is another `aside`). */
function sidebar(): HTMLElement {
  return document.querySelector<HTMLElement>('.sidebar')!;
}

describe('App: Nebula Hub update (ADR-029)', () => {
  it('offers a newer Hub in the sidebar and restarts into it only after the confirmation', async () => {
    hubUpdateView = { ...UP_TO_DATE, available: '0.2.1', size: 94_371_840, blocked: null };
    const { bridge, pushHubUpdate } = installBridge();
    await render(<App />);
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Mettre à jour Nebula Hub vers la version 0.2.1' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Mettre à jour Nebula Hub ?' });
    expect(within(dialog).getByText(/télécharger la version 0.2.1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/réglages, vos autorisations Nebula Link et votre historique sont conservés/)).toBeInTheDocument();
    expect(bridge.startHubUpdate).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mettre à jour et redémarrer' }));
    expect(bridge.startHubUpdate).toHaveBeenCalledWith(true);

    await pushHubUpdate({ ...hubUpdateView, phase: 'downloading', received: 47_185_920, total: 94_371_840, blocked: 'in-progress' });
    expect(screen.getByRole('progressbar', { name: 'Téléchargement de Nebula Hub' })).toHaveAttribute('aria-valuenow', '50');
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Annuler' }));
    expect(bridge.cancelHubUpdate).toHaveBeenCalled();
  });

  it('cancelling the confirmation leaves the Hub as it is', async () => {
    hubUpdateView = { ...UP_TO_DATE, available: '0.2.1', size: 1000, blocked: null };
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Mettre à jour Nebula Hub vers la version 0.2.1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(bridge.startHubUpdate).not.toHaveBeenCalled();
  });

  it('shows no update card when the Hub is up to date, and Settings can check for one', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    expect(screen.queryByRole('button', { name: /Mettre à jour Nebula Hub/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getByText('Nebula Hub est à jour.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher une mise à jour' }));
    expect(bridge.refreshCatalog).toHaveBeenCalled();
  });

  it('says why a development build cannot update itself', async () => {
    hubUpdateView = { ...UP_TO_DATE, available: '0.2.1', size: 1000, blocked: 'not-packaged' };
    installBridge();
    await render(<App />);
    expect(screen.queryByRole('button', { name: /Mettre à jour Nebula Hub/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getByText('Nebula Hub 0.2.1 est disponible.')).toBeInTheDocument();
    expect(screen.getByText(/Version de développement/)).toBeInTheDocument();
  });
});

describe('App: Quit Nebula (ADR-030)', () => {
  it('names the open apps, closes everything only after the confirmation, then says it is closing', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Quitter Nebula' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Quitter Nebula ?' });
    expect(within(dialog).getByText('Nebula Hub va fermer Nebula Clock, puis se fermer lui-même.')).toBeInTheDocument();
    expect(within(dialog).getByText(/invitée à se fermer normalement/)).toBeInTheDocument();
    expect(bridge.quitNebula).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tout fermer' }));
    expect(bridge.quitNebula).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Fermeture des apps Nebula…')).toBeInTheDocument();
  });

  it('cancelling keeps everything open', async () => {
    const { bridge } = installBridge();
    await render(<App />);
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Quitter Nebula' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(bridge.quitNebula).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says when nothing else is open, and explains a refusal while an operation runs', async () => {
    const { bridge } = installBridge({}, true, installedView({ apps: [] }));
    (bridge.quitNebula as jest.Mock).mockResolvedValueOnce('busy');
    await render(<App />);
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Quitter Nebula' }));
    expect(screen.getByText(/Aucune autre app Nebula n’est ouverte/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tout fermer' }));
    expect(await screen.findByText(/attendez qu’elle se termine pour tout quitter/)).toBeInTheDocument();
    expect(screen.queryByText('Fermeture des apps Nebula…')).not.toBeInTheDocument();
  });

  it('opens the same confirmation when the tray asks for it', async () => {
    const { askQuit } = installBridge();
    await render(<App />);
    await askQuit();
    expect(screen.getByRole('alertdialog', { name: 'Quitter Nebula ?' })).toBeInTheDocument();
  });

  it('hides an app shown inside the Hub while a Hub dialog is open, and shows it again after', async () => {
    dockView = { dockable: ['nebula.finterest'], open: [{ appId: 'nebula.finterest', connected: true }], active: 'nebula.finterest' };
    const { bridge } = installBridge({ openInHub: ['nebula.finterest'] });
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula Finterest' }));
    expect(bridge.setDockArea).toHaveBeenLastCalledWith(expect.objectContaining({ width: expect.any(Number) }));
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Quitter Nebula' }));
    expect(bridge.setDockArea).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(bridge.setDockArea).toHaveBeenLastCalledWith(expect.objectContaining({ width: expect.any(Number) }));
  });
});

describe('App: installed-only apps (ADR-033)', () => {
  it('keeps Nebula Finance Enterprise out of the Hub until it is detected, then offers to open it', async () => {
    installBridge();
    const first = await render(<App />);
    const launcher = () => within(screen.getByRole('group', { name: 'Lancer une app' }));
    expect(launcher().queryByRole('button', { name: /Nebula Finance Enterprise/ })).not.toBeInTheDocument();
    first.unmount();

    const apps = [...installedView().apps, { appId: 'nebula.finance-enterprise', version: '0.1.0-beta.1', scope: 'user' as const, location: 'C:\Users\<user>\AppData\Local\Programs\nebula-finance-enterprise', exeFound: true, running: false }];
    const { bridge } = installBridge({}, true, installedView({ apps }));
    await render(<App />);
    await userEvent.click(launcher().getByRole('button', { name: 'Ouvrir Nebula Finance Enterprise' }));
    expect(bridge.launchApp).toHaveBeenCalledWith('nebula.finance-enterprise');
  });
});

describe('App: Nebula News as an extension (ADR-034)', () => {
  it('opens News inside the Hub, never in its own window, without "Detach"', async () => {
    dockView = { dockable: ['nebula.news'], open: [{ appId: 'nebula.news', connected: true }], active: 'nebula.news' };
    const apps = installedView().apps.map((app) => (app.appId === 'nebula.news' ? { ...app, version: '0.5.0', exeFound: true, running: true } : app));
    const { bridge } = installBridge({}, true, installedView({ apps }));
    await render(<App />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Lancer une app' })).getByRole('button', { name: 'Ouvrir Nebula News' }));
    expect(bridge.showDocked).toHaveBeenCalledWith('nebula.news');
    expect(bridge.launchApp).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Nebula News' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Détacher dans sa propre fenêtre/ })).not.toBeInTheDocument();
  });
});
