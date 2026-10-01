import { act, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type HubSettings } from '../../src/shared/settings';
import type { NebulaHubBridge } from '../../src/shared/bridge';
import type { DownloadsView } from '../../src/shared/install-state';
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

function installBridge(overrides: Partial<HubSettings> = {}, startedHidden = true, installed = installedView()) {
  let settings: HubSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const listeners: Array<(value: boolean) => void> = [];
  const downloadListeners: Array<(view: DownloadsView) => void> = [];
  const bridge: NebulaHubBridge = {
    getInitialState: () => ({ settings, appVersion: '0.1.0', startedHidden }),
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
  };
  window.nebulaHub = bridge;
  return {
    bridge,
    setVisible: (visible: boolean) => listeners.forEach((listener) => listener(visible)),
    pushDownloads: (view: DownloadsView) => act(() => downloadListeners.forEach((listener) => listener(view))),
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
