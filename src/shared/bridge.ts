import type { NebulaAppearance } from '@nebula/design';
import type { HubSettings, SettingsPatch } from './settings';

/** IPC channel names: the only routes between the renderer and the main process. */
export const CHANNELS = {
  initialState: 'hub:initial-state',
  updateAppearance: 'settings:update-appearance',
  updateSettings: 'settings:update',
  settingsChanged: 'settings:changed',
  windowVisibility: 'window:visibility',
  openExternal: 'shell:open-external',
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
}
