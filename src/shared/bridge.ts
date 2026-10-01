import type { NebulaAppearance } from '@nebula/design';
import type { CatalogView } from './catalog-view';
import type { InstalledView, LaunchResult } from './installed-view';
import type { HubSettings, SettingsPatch } from './settings';

/** IPC channel names: the only routes between the renderer and the main process. */
export const CHANNELS = {
  initialState: 'hub:initial-state',
  updateAppearance: 'settings:update-appearance',
  updateSettings: 'settings:update',
  settingsChanged: 'settings:changed',
  windowVisibility: 'window:visibility',
  openExternal: 'shell:open-external',
  catalogGet: 'catalog:get',
  catalogRefresh: 'catalog:refresh',
  catalogAsset: 'catalog:asset',
  catalogChanged: 'catalog:changed',
  installedGet: 'installed:get',
  installedRefresh: 'installed:refresh',
  installedChanged: 'installed:changed',
  appLaunch: 'apps:launch',
  appShowFolder: 'apps:show-folder',
} as const;

/** Read once, synchronously, by the preload so the first paint has the right theme. */
export interface InitialState {
  settings: HubSettings;
  appVersion: string;
  /** Started hidden in the tray (launch at login): no splash, no sound. */
  startedHidden: boolean;
}

/**
 * `window.nebulaHub`: the single preload bridge (rule R10), one typed method per action and no
 * generic `invoke(channel, …)`.
 */
export interface NebulaHubBridge {
  getInitialState(): InitialState;
  updateAppearance(patch: Partial<NebulaAppearance>): Promise<HubSettings>;
  updateSettings(patch: SettingsPatch): Promise<HubSettings>;
  onSettingsChanged(callback: (settings: HubSettings) => void): () => void;
  /** Fires when the window is shown, hidden to the tray, minimized or restored. */
  onWindowVisibility(callback: (visible: boolean) => void): () => void;
  /** Opens an https: URL in the default browser after validation in the main process (R12). */
  openExternal(url: string): Promise<boolean>;
  /** The catalog as known now (cache or bundled), without waiting for the network. */
  getCatalog(): Promise<CatalogView>;
  /** Forces a network refresh of the catalog and of the releases. */
  refreshCatalog(): Promise<CatalogView>;
  /** A declared icon or screenshot of a catalog app, as a data: URL (null if unavailable). */
  getCatalogAsset(appId: string, assetPath: string): Promise<string | null>;
  onCatalogChanged(callback: (view: CatalogView) => void): () => void;
  /** Installed Nebula apps as last detected (registry, executable, process list). */
  getInstalled(): Promise<InstalledView>;
  /** Runs a detection now. */
  refreshInstalled(): Promise<InstalledView>;
  onInstalledChanged(callback: (view: InstalledView) => void): () => void;
  /** Starts an installed app (its catalog executable, inside its registered folder). */
  launchApp(appId: string): Promise<LaunchResult>;
  /** Shows the app's executable in File Explorer. */
  showAppFolder(appId: string): Promise<boolean>;
}
