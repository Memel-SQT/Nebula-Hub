import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type InitialState, type NavigateRequest, type NebulaHubBridge } from '../shared/bridge';
import type { CatalogView } from '../shared/catalog-view';
import type { DownloadsView } from '../shared/install-state';
import type { InstalledView } from '../shared/installed-view';
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
  getCatalog: () => ipcRenderer.invoke(CHANNELS.catalogGet),
  refreshCatalog: () => ipcRenderer.invoke(CHANNELS.catalogRefresh),
  getCatalogAsset: (appId, assetPath) => ipcRenderer.invoke(CHANNELS.catalogAsset, appId, assetPath),
  onCatalogChanged: (callback) => subscribe<CatalogView>(CHANNELS.catalogChanged, callback),
  getInstalled: () => ipcRenderer.invoke(CHANNELS.installedGet),
  refreshInstalled: () => ipcRenderer.invoke(CHANNELS.installedRefresh),
  onInstalledChanged: (callback) => subscribe<InstalledView>(CHANNELS.installedChanged, callback),
  launchApp: (appId) => ipcRenderer.invoke(CHANNELS.appLaunch, appId),
  showAppFolder: (appId) => ipcRenderer.invoke(CHANNELS.appShowFolder, appId),
  installApp: (appId) => ipcRenderer.invoke(CHANNELS.appInstall, appId),
  getDownloads: () => ipcRenderer.invoke(CHANNELS.downloadsGet),
  onDownloadsChanged: (callback) => subscribe<DownloadsView>(CHANNELS.downloadsChanged, callback),
  cancelOperation: (operationId) => ipcRenderer.invoke(CHANNELS.operationCancel, operationId),
  dismissOperation: (operationId) => ipcRenderer.invoke(CHANNELS.operationDismiss, operationId),
  exportHistory: () => ipcRenderer.invoke(CHANNELS.historyExport),
  pickInstallDirectory: () => ipcRenderer.invoke(CHANNELS.pickInstallDirectory),
  planOperation: (appId, kind) => ipcRenderer.invoke(CHANNELS.operationPlan, appId, kind),
  startOperation: (appId, kind, confirmed) => ipcRenderer.invoke(CHANNELS.operationStart, appId, kind, confirmed),
  requestAppClose: (operationId) => ipcRenderer.invoke(CHANNELS.operationRequestClose, operationId),
  continueWithoutBackup: (operationId) => ipcRenderer.invoke(CHANNELS.operationContinue, operationId),
  onNavigateRequest: (callback) => subscribe<NavigateRequest>(CHANNELS.navigate, callback),
};

contextBridge.exposeInMainWorld('nebulaHub', bridge);
