import { act, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type HubSettings } from '../../src/shared/settings';
import type { NebulaHubBridge } from '../../src/shared/bridge';
import { App } from '../../src/renderer/App';
import { catalogView } from './fixtures';

/** Renders and lets the initial catalog request resolve inside act(). */
async function render(node: JSX.Element) {
  const result = rtlRender(node);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

function installBridge(overrides: Partial<HubSettings> = {}, startedHidden = true) {
  let settings: HubSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const listeners: Array<(value: boolean) => void> = [];
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
  };
  window.nebulaHub = bridge;
  return { bridge, setVisible: (visible: boolean) => listeners.forEach((listener) => listener(visible)) };
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

  it('reacts to the window being hidden in the tray', async () => {
    const { setVisible } = installBridge();
    await render(<App />);
    act(() => setVisible(false));
    act(() => setVisible(true));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
