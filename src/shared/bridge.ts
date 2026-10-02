import type { NebulaAppearance } from '@nebula/design';
import type { CatalogView } from './catalog-view';
import type { DownloadsView, EnqueueResult, OperationKind, OperationPlan } from './install-state';
import type { InstalledView, LaunchResult } from './installed-view';
import type { ActivityItem } from './activity';
import type { ExportDataResult, ImportDataResult, InstallerSaveProgress, SaveInstallerResult } from './backup';
import type { ConsentState } from './consent';
import type { LinkView } from './link-view';
import type { Route } from './route';
import type { HubSettings, SettingsPatch } from './settings';
import type { WidgetView } from './widgets';

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
  appInstall: 'apps:install',
  downloadsGet: 'downloads:get',
  downloadsChanged: 'downloads:changed',
  operationCancel: 'operations:cancel',
  operationDismiss: 'operations:dismiss',
  historyExport: 'history:export',
  pickInstallDirectory: 'settings:pick-install-directory',
  operationPlan: 'operations:plan',
  operationStart: 'operations:start',
  operationRequestClose: 'operations:request-close',
  operationContinue: 'operations:continue-without-backup',
  navigate: 'hub:navigate',
  linkGet: 'link:get',
  linkChanged: 'link:changed',
  linkSetConsent: 'link:set-consent',
  linkDenyApp: 'link:deny-app',
  linkOpen: 'link:open',
  widgetsGet: 'widgets:get',
  widgetsChanged: 'widgets:changed',
  widgetRefresh: 'widgets:refresh',
  activityGet: 'activity:get',
  activityChanged: 'activity:changed',
  activityClear: 'activity:clear',
  dataExport: 'apps:export-data',
  dataImport: 'apps:import-data',
  installerSave: 'apps:save-installer',
  installerSaveProgress: 'apps:save-installer-progress',
  revealFile: 'shell:reveal-file',
  pickBackupCopyDirectory: 'settings:pick-backup-copy-directory',
} as const;

/** Screens the main process may ask the renderer to show (tray menu, Nebula Link). */
export type NavigateRequest = Route;

/** Result of exporting the operations journal. */
export type ExportResult = 'saved' | 'cancelled' | 'failed';

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
  /** Queues the download and silent install of a catalog app (brief §7.3–7.4). */
  installApp(appId: string): Promise<EnqueueResult>;
  /** Queue, progress and history of install operations. */
  getDownloads(): Promise<DownloadsView>;
  onDownloadsChanged(callback: (view: DownloadsView) => void): () => void;
  /** Cancels an operation that has not reached the installer yet. */
  cancelOperation(operationId: string): Promise<boolean>;
  /** Removes a finished operation from the queue (it stays in the history). */
  dismissOperation(operationId: string): Promise<boolean>;
  /** Saves the operations journal where the user chooses (JSON). */
  exportHistory(): Promise<ExportResult>;
  /** Lets the user pick the base install folder; resolves with the saved settings, or null if cancelled. */
  pickInstallDirectory(): Promise<HubSettings | null>;
  /** What an update, repair or uninstall will do (confirmation screen, R04). */
  planOperation(appId: string, kind: OperationKind): Promise<OperationPlan>;
  /**
   * Starts any operation; `confirmed` is the user's explicit yes on the confirmation screen, and
   * `skipBackup` their choice not to back up first (ADR-026, only with that yes).
   */
  startOperation(appId: string, kind: OperationKind, confirmed: boolean, options?: { skipBackup?: boolean }): Promise<EnqueueResult>;
  /** R08: the user asks the Hub to close the app an operation waits for (one polite request). */
  requestAppClose(operationId: string): Promise<boolean>;
  /** R04: second confirmation after a failed backup. */
  continueWithoutBackup(operationId: string): Promise<boolean>;
  onNavigateRequest(callback: (screen: NavigateRequest) => void): () => void;
  /** Nebula Link: connected apps, capabilities, consents and pending requests. */
  getLink(): Promise<LinkView>;
  onLinkChanged(callback: (view: LinkView) => void): () => void;
  /** Grants, refuses, or forgets (null) the user's decision for one pair. */
  setLinkConsent(consumer: string, capability: string, state: ConsentState | null): Promise<LinkView>;
  /** Refuses every pair of an app (as consumer or provider). */
  denyLinkApp(appId: string): Promise<LinkView>;
  /** Opens a `nebula://` link (widget, notification) through the Link router. */
  openDeepLink(url: string): Promise<boolean>;
  /** Home widgets (I3): states and values, in memory only. */
  getWidgets(): Promise<WidgetView[]>;
  onWidgetsChanged(callback: (widgets: WidgetView[]) => void): () => void;
  /** Reads one widget now. */
  refreshWidget(capabilityId: string): Promise<boolean>;
  /** Activity center (I5): the last 30 days, newest first. */
  getActivity(): Promise<ActivityItem[]>;
  onActivityChanged(callback: (items: ActivityItem[]) => void): () => void;
  /** Erases the history (null: everything, else one app's). */
  clearActivity(appId: string | null): Promise<ActivityItem[]>;
  /** The app writes a backup now (root folder, checked, copied if set) — ADR-026. */
  exportAppData(appId: string): Promise<ExportDataResult>;
  /** The user picks a backup; the app opens on it, or the Hub shows the steps — ADR-026. */
  importAppData(appId: string): Promise<ImportDataResult>;
  /** Downloads and verifies the installer, then copies it to the Downloads folder. */
  saveInstaller(appId: string): Promise<SaveInstallerResult>;
  onInstallerSaveProgress(callback: (progress: InstallerSaveProgress) => void): () => void;
  /** Shows in File Explorer a file the Hub itself wrote in this session (backup, installer). */
  revealFile(filePath: string): Promise<boolean>;
  /** Picks the folder for the backup copies; resolves with the saved settings, or null if cancelled. */
  pickBackupCopyDirectory(): Promise<HubSettings | null>;
}
