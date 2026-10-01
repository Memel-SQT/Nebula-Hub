import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type InitialState, type NebulaHubBridge } from '../shared/bridge';
import type { HubSettings } from '../shared/settings';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Read once, synchronously, before React renders: the theme and the language must be right on
// the first paint (no flash), and the splash must know whether the Hub started in the tray.
const initialState = ipcRenderer.sendSync(CHANNELS.initialState) as InitialState;

const bridge: NebulaHubBridge = {
  getInitialState: () => initialState,
  updateAppearance: (patch) => ipcRenderer.invoke(CHANNELS.updateAppearance, patch),
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.updateSettings, patch),
  onSettingsChanged: (callback) => subscribe<HubSettings>(CHANNELS.settingsChanged, callback),
  onWindowVisibility: (callback) => subscribe<boolean>(CHANNELS.windowVisibility, callback),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
};

contextBridge.exposeInMainWorld('nebulaHub', bridge);
