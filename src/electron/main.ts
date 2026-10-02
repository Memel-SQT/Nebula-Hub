import fs from 'node:fs/promises';
import path from 'node:path';
import { app, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { shouldRelay, toastContent, unreadCount, type ActivityItem } from '../shared/activity';
import { CHANNELS, type InitialState, type NavigateRequest } from '../shared/bridge';
import { HUB_ID, type ConsentState } from '../shared/consent';
import type { OperationKind } from '../shared/install-state';
import { updateAvailable, type LaunchResult } from '../shared/installed-view';
import { mainString, operationEntry } from '../shared/main-strings';
import type { HubSettings } from '../shared/settings';
import { isSafeExternalUrl } from '../shared/url';
import { backupArgument, MAX_BACKUP_BYTES, validateBackup, type ImportDataResult, type SaveInstallerResult } from '../shared/backup';
import { InstalledAppsService } from './apps/installed-apps';
import { windowsProbe } from './apps/system-probe';
import { CatalogService } from './catalog/catalog-service';
import { CATALOG_PUBLIC_KEY } from './catalog-key';
import { HubDatabase } from './db';
import { LinkHub } from './link/link-hub';
import { defaultSessionDir, userPipe } from './link/session';
import { writeFileAtomic } from './fsutil';
import { InstallHistory } from './install/history';
import { InstallManager } from './install/install-manager';
import { saveInstaller } from './install/save-installer';
import { spawnInstallerRunner } from './install/installer-runner';
import { downloadFile, verifyFile } from './net/download';
import { httpGet } from './net/http';
import { showWindowsNotification } from './notifier';
import { hardenApp, hardenSession, isTrustedSender } from './security';
import { SettingsStore } from './settings-store';
import { createTray, destroyTray, updateTray, type TrayOptions } from './tray';
import { applyWindowTheme, contentBounds, createMainWindow, getMainWindow, isWindowFocused, onWindowGeometry, onWindowVisibilityChange, setQuitting, showMainWindow } from './window';
import { isRect } from '../shared/dock';

// Pinned explicitly (ADR-007, ADR-013): a future product rename must never orphan the
// consents and history. NEBULA_HUB_USER_DATA_DIR points manual tests at a throwaway folder; it
// is never set in a packaged install.
app.setPath('userData', process.env.NEBULA_HUB_USER_DATA_DIR || path.join(app.getPath('appData'), 'Nebula Hub'));
app.setAppUserModelId('hub.nebula.desktop');

/** Passed by the login item: start in the tray, without window, splash or sound. */
const startedHidden = process.argv.includes('--hidden');
const settingsStore = SettingsStore.inDirectory(app.getPath('userData'));
const database = HubDatabase.inDirectory(app.getPath('userData'));
let catalog: CatalogService | null = null;
let installed: InstalledAppsService | null = null;
let installs: InstallManager | null = null;
let link: LinkHub | null = null;

/**
 * Installers are downloaded to %LOCALAPPDATA%\Nebula Hub\downloads (brief §5.3): local, never
 * roamed, purged at startup. A throwaway data folder (manual tests) keeps its downloads inside it.
 */
function downloadsDir(): string {
  if (process.env.NEBULA_HUB_USER_DATA_DIR) return path.join(app.getPath('userData'), 'downloads');
  return path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'Nebula Hub', 'downloads');
}

/** The signed catalog shipped with the app (extraResources), last-resort source (ADR-019). */
function bundledCatalogDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'catalog') : path.join(app.getAppPath(), 'catalog');
}

hardenApp();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = deepLinkIn(argv);
    if (url) void link?.routeDeepLink(url);
    else void openWindow();
  });

  app.whenReady().then(async () => {
    hardenSession();
    settingsStore.load();
    await database.initialize();
    catalog = new CatalogService({
      http: httpGet,
      db: database,
      publicKey: CATALOG_PUBLIC_KEY,
      bundledDir: bundledCatalogDir(),
      hubVersion: app.getVersion(),
      channel: () => settingsStore.get().channel,
    });
    catalog.onChange((view) => getMainWindow()?.webContents.send(CHANNELS.catalogChanged, view));
    await catalog.loadLocal();
    installed = new InstalledAppsService({ probe: windowsProbe, apps: () => catalog?.catalogApps() ?? [], env: process.env });
    installed.onChange((view) => {
      getMainWindow()?.webContents.send(CHANNELS.installedChanged, view);
      updateTray(trayOptions());
      scheduleAutoUpdates();
    });
    installs = new InstallManager({
      entry: (appId) => catalog?.getView().entries.find((entry) => entry.app.id === appId),
      installedView: () => installed?.getView() ?? { state: 'loading', apps: [], detectedAt: null },
      record: (appId) => installed?.record(appId),
      detect: () => installed!.detect(),
      runningProcesses: () => windowsProbe.runningProcesses(),
      requestClose: (exeName) => windowsProbe.requestClose(exeName),
      download: downloadFile,
      verify: verifyFile,
      runner: spawnInstallerRunner,
      history: new InstallHistory(database),
      downloadsDir: downloadsDir(),
      documentsDir: app.getPath('documents'),
      env: process.env,
      installDirectory: () => settingsStore.get().installDirectory,
      backupCopyDirectory: () => settingsStore.get().backupCopyDirectory,
    });
    await installs.cleanup();
    let lastHistoryId = Math.max(0, ...installs.getView().history.map((entry) => entry.id));
    installs.onChange((view) => {
      getMainWindow()?.webContents.send(CHANNELS.downloadsChanged, view);
      // Finished operations also reach the activity center (and Windows, if the Hub is hidden).
      for (const entry of [...view.history].reverse()) {
        if (entry.id <= lastHistoryId) continue;
        lastHistoryId = entry.id;
        const content = operationEntry(settingsStore.get().appearance.language, entry, appName(entry.appId));
        if (content) void link?.addActivity(HUB_ID, { notificationId: null, ...content, sensitivity: 'public', deepLink: 'nebula://hub/downloads', category: 'operation' });
      }
    });
    link = new LinkHub({
      db: database,
      hubVersion: app.getVersion(),
      // A throwaway data folder (manual tests) gets its own pipe and session file.
      sessionDir: process.env.NEBULA_HUB_USER_DATA_DIR ? path.join(app.getPath('userData'), 'link') : defaultSessionDir(),
      pipe: process.env.NEBULA_HUB_USER_DATA_DIR ? `\\\\.\\pipe\\nebula-link-dev-${process.pid}` : await userPipe(),
      catalogApps: () => catalog?.catalogApps() ?? [],
      installedView: () => installed?.getView() ?? { state: 'loading', apps: [], detectedAt: null },
      record: (appId) => installed?.record(appId),
      launch: async (appId, args) => (await launchApp(appId, args)) === 'launched',
      appearance: () => settingsStore.get().appearance,
      navigate: (route) => void openWindowOn(route),
      onChange: (view) => getMainWindow()?.webContents.send(CHANNELS.linkChanged, view),
      onWidgets: (widgets) => getMainWindow()?.webContents.send(CHANNELS.widgetsChanged, widgets),
      onActivity: (item) => activityAdded(item),
      onConsentRequest: (consumer, capability) => consentRequested(consumer, capability),
      dockContent: contentBounds,
      onDock: (view) => getMainWindow()?.webContents.send(CHANNELS.dockChanged, view),
    });
    await link.start();
    onWindowVisibilityChange((visible) => link?.widgets.setVisible(visible));
    onWindowGeometry((focused) => link?.dock.windowChanged(focused));
    if (startedHidden) link.widgets.setVisible(false);
    installed.onChange((view) => void link?.onInstalledChanged(view));
    if (app.isPackaged) app.setAsDefaultProtocolClient('nebula');
    // A new catalog may list new apps: detect again.
    catalog.onChange(() => installed?.requestDetect());
    registerIpcHandlers();
    await createMainWindow(windowOptions(startedHidden));
    void installed.detect();
    createTray(trayOptions());
    // 'system' follows Windows: keep the native controls in step when the OS theme flips.
    nativeTheme.on('updated', () => applyWindowTheme(settingsStore.get()));
    const startLink = deepLinkIn(process.argv);
    if (startLink) void link.routeDeepLink(startLink);
    // Network refresh in the background (reused if younger than 6 h): the window never waits.
    void catalog.refresh();
  });

  app.on('before-quit', () => {
    setQuitting(true);
    destroyTray();
    void link?.stop();
  });

  // With the tray, closing the window is not quitting; this only fires when the window was
  // really destroyed (close-to-tray disabled).
  app.on('window-all-closed', () => {
    if (!settingsStore.get().closeToTray) {
      app.quit();
    }
  });
}

function windowOptions(startHidden: boolean) {
  return { settings: () => settingsStore.get(), startHidden };
}

/** Shows the window, recreating it if it was destroyed (close-to-tray off, renderer close…). */
async function openWindow(): Promise<void> {
  if (!getMainWindow()) {
    await createMainWindow(windowOptions(false));
    return;
  }
  showMainWindow();
}

let autoUpdateTimer: ReturnType<typeof setTimeout> | null = null;

/** Brief 7.5: opted-in apps are updated once the catalog and the detection settle (debounced). */
function scheduleAutoUpdates(): void {
  if (autoUpdateTimer) clearTimeout(autoUpdateTimer);
  autoUpdateTimer = setTimeout(() => {
    autoUpdateTimer = null;
    if (!installs || !catalog || catalog.getView().refreshing || installed?.getView().state !== 'ready') return;
    const optedIn = settingsStore.get().autoUpdate;
    installs.autoUpdate((appId) => optedIn[appId] === true);
  }, 5000);
}

/** Shows the window on a given screen (tray menu). */
async function openWindowOn(screen: NavigateRequest): Promise<void> {
  await openWindow();
  getMainWindow()?.webContents.send(CHANNELS.navigate, screen);
}

/** Coming back to the Hub re-checks what is installed and running (debounced, brief 7.1). */
app.on('browser-window-focus', () => installed?.requestDetect());

/** Every launch (window, tray, Link intents, Hub mode) goes through here: never during an operation. */
async function launchApp(appId: string, args: string[] = []): Promise<LaunchResult> {
  if (!installed) return 'not-installed';
  if (installs?.isBusy(appId)) return 'busy';
  return installed.launch(appId, args);
}

function appName(appId: string): string {
  return catalog?.catalogApps().find((candidate) => candidate.id === appId)?.name ?? appId;
}

/** A new activity entry: pushed to the window, counted in the tray, relayed to Windows if needed. */
function activityAdded(item: ActivityItem): void {
  getMainWindow()?.webContents.send(CHANNELS.activityChanged, link?.activity() ?? []);
  updateTray(trayOptions());
  const settings = settingsStore.get();
  if (!shouldRelay(item, settings, isWindowFocused())) return;
  const content = toastContent(item, appName(item.appId), mainString(settings.appearance.language, 'toastPrivate'));
  showWindowsNotification(content, () => {
    const fallback = () => void openWindowOn({ screen: 'home' });
    if (!item.deepLink || !link) fallback();
    else void link.routeDeepLink(item.deepLink).then((outcome) => outcome === 'invalid' && fallback(), fallback);
  });
}

/** A private pair waits for the user: if the Hub is not in front, Windows says so (spec § 6). */
function consentRequested(consumer: string, capability: string): void {
  const settings = settingsStore.get();
  if (!settings.windowsNotifications || isWindowFocused()) return;
  const title = link?.view().capabilities.find((candidate) => candidate.id === capability)?.title;
  const language = settings.appearance.language;
  const body = mainString(language, 'consentBody', { name: consumer === HUB_ID ? 'Nebula Hub' : appName(consumer), capability: (language === 'en' ? title?.en : undefined) ?? title?.fr ?? capability });
  showWindowsNotification({ title: mainString(language, 'consentTitle'), body }, () => void openWindowOn({ screen: 'integrations' }));
}

function quit(): void {
  setQuitting(true);
  app.quit();
}

function trayOptions(): TrayOptions {
  const apps = catalog?.catalogApps() ?? [];
  const launchable = (installed?.getView().apps ?? [])
    .filter((record) => record.exeFound)
    .map((record) => apps.find((candidate) => candidate.id === record.appId))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate) && candidate?.role !== 'hub')
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));
  const entries = catalog?.getView().entries ?? [];
  const updates = (installed?.getView().apps ?? []).filter((record) => {
    const entry = entries.find((candidate) => candidate.app.id === record.appId);
    return entry?.app.role !== 'hub' && updateAvailable(entry, record);
  }).length;
  const settings = settingsStore.get();
  return {
    language: settings.appearance.language,
    apps: launchable,
    updates,
    unread: link ? unreadCount(link.activity(), settings.activitySeenAt) : 0,
    onOpen: () => void openWindow(),
    onShowActivity: () => void openWindowOn({ screen: 'home' }),
    onCheckUpdates: () => void catalog?.refresh(true).then(() => installed?.detect()),
    onShowUpdates: () => void openWindowOn({ screen: 'my-apps' }),
    onLaunch: (appId) => void launchApp(appId),
    onQuit: quit,
  };
}

function broadcastSettings(settings: HubSettings): void {
  link?.broadcastAppearance(settings.appearance);
  getMainWindow()?.webContents.send(CHANNELS.settingsChanged, settings);
  applyWindowTheme(settings);
  updateTray(trayOptions());
}

function applyLaunchAtLogin(enabled: boolean): void {
  // Only a packaged build can register itself; in development this would point Windows at
  // the bare Electron binary.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  }
}

function registerIpcHandlers(): void {
  ipcMain.on(CHANNELS.initialState, (event) => {
    if (!isTrustedSender(event)) {
      event.returnValue = null;
      return;
    }
    const state: InitialState = { settings: settingsStore.get(), appVersion: app.getVersion(), startedHidden };
    event.returnValue = state;
  });

  ipcMain.handle(CHANNELS.updateAppearance, async (event, patch: unknown) => {
    if (!isTrustedSender(event)) throw new Error('ERR_UNTRUSTED_SENDER');
    const settings = await settingsStore.updateAppearance(patch);
    broadcastSettings(settings);
    return settings;
  });

  ipcMain.handle(CHANNELS.updateSettings, async (event, patch: unknown) => {
    if (!isTrustedSender(event)) throw new Error('ERR_UNTRUSTED_SENDER');
    const before = settingsStore.get();
    const settings = await settingsStore.update(patch);
    if (settings.launchAtLogin !== before.launchAtLogin) {
      applyLaunchAtLogin(settings.launchAtLogin);
    }
    if (settings.channel !== before.channel) {
      void catalog?.refresh(true);
    }
    if (JSON.stringify(settings.autoUpdate) !== JSON.stringify(before.autoUpdate)) {
      scheduleAutoUpdates();
    }
    broadcastSettings(settings);
    return settings;
  });

  ipcMain.handle(CHANNELS.openExternal, async (event, url: unknown) => {
    if (!isTrustedSender(event) || !isSafeExternalUrl(url)) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(CHANNELS.catalogGet, (event) => {
    if (!isTrustedSender(event) || !catalog) throw new Error('ERR_UNTRUSTED_SENDER');
    return catalog.getView();
  });

  ipcMain.handle(CHANNELS.catalogRefresh, async (event) => {
    if (!isTrustedSender(event) || !catalog) throw new Error('ERR_UNTRUSTED_SENDER');
    return catalog.refresh(true);
  });

  ipcMain.handle(CHANNELS.installedGet, (event) => {
    if (!isTrustedSender(event) || !installed) throw new Error('ERR_UNTRUSTED_SENDER');
    return installed.getView();
  });

  ipcMain.handle(CHANNELS.installedRefresh, async (event) => {
    if (!isTrustedSender(event) || !installed) throw new Error('ERR_UNTRUSTED_SENDER');
    return installed.detect();
  });

  ipcMain.handle(CHANNELS.appLaunch, async (event, appId: unknown) => {
    if (!isTrustedSender(event) || !installed || typeof appId !== 'string') return 'not-installed';
    return launchApp(appId);
  });

  ipcMain.handle(CHANNELS.appShowFolder, (event, appId: unknown) => {
    if (!isTrustedSender(event) || !installed || typeof appId !== 'string') return false;
    const record = installed.record(appId);
    if (!record?.exeFound) return false;
    shell.showItemInFolder(record.exePath);
    return true;
  });

  ipcMain.handle(CHANNELS.appInstall, (event, appId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof appId !== 'string') return 'unknown-app';
    return installs.enqueue(appId);
  });

  ipcMain.handle(CHANNELS.operationPlan, (event, appId: unknown, kind: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof appId !== 'string' || !isOperationKind(kind)) throw new Error('ERR_BAD_REQUEST');
    return installs.plan(appId, kind);
  });

  ipcMain.handle(CHANNELS.operationStart, (event, appId: unknown, kind: unknown, confirmed: unknown, skipBackup: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof appId !== 'string' || !isOperationKind(kind)) return 'unknown-app';
    return installs.enqueue(appId, kind, { confirmed: confirmed === true, skipBackup: skipBackup === true });
  });

  ipcMain.handle(CHANNELS.dataExport, async (event, appId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof appId !== 'string') return { ok: false, reason: 'unsupported' };
    const result = await installs.exportData(appId);
    if (result.ok) {
      writtenFiles.add(result.path);
      if (result.copyPath && result.copyState === 'ok') writtenFiles.add(result.copyPath);
    }
    return result;
  });

  ipcMain.handle(CHANNELS.dataImport, async (event, appId: unknown): Promise<ImportDataResult> => {
    if (!isTrustedSender(event) || !installed || typeof appId !== 'string') return { mode: 'failed' };
    const spec = catalog?.catalogApps().find((candidate) => candidate.id === appId)?.windows.preOperationBackup;
    if (!spec) return { mode: 'unsupported' };
    if (!installed.record(appId)?.exeFound) return { mode: 'not-installed' };
    if (installs?.isBusy(appId)) return { mode: 'busy' };
    // The root folder first: that is where every backup lands (ADR-026).
    const window = getMainWindow();
    const options = {
      defaultPath: path.join(app.getPath('documents'), spec.documentsFolder),
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const file = choice.filePaths[0];
    if (choice.canceled || !file) return { mode: 'cancelled' };
    let check: ReturnType<typeof validateBackup>;
    try {
      const stat = await fs.stat(file);
      check = stat.size > MAX_BACKUP_BYTES ? { ok: false, reason: 'too-large' } : validateBackup(spec.format, await fs.readFile(file, 'utf8'));
    } catch {
      return { mode: 'invalid', reason: 'missing' };
    }
    if (!check.ok) return { mode: 'invalid', reason: check.reason };
    writtenFiles.add(file);
    if (spec.importArgument) {
      const launched = await launchApp(appId, [backupArgument({ ...spec, argument: spec.importArgument }, file)]);
      return launched === 'launched' ? { mode: 'launched', file, accounts: check.accounts } : { mode: 'failed' };
    }
    shell.showItemInFolder(file);
    void launchApp(appId);
    return { mode: 'manual', file, accounts: check.accounts };
  });

  ipcMain.handle(CHANNELS.installerSave, async (event, appId: unknown): Promise<SaveInstallerResult> => {
    if (!isTrustedSender(event) || !catalog || typeof appId !== 'string') return { ok: false, reason: 'failed' };
    const installer = catalog.getView().entries.find((entry) => entry.app.id === appId)?.release?.installer;
    if (!installer) return { ok: false, reason: 'no-installer' };
    if (savingInstallers.has(appId)) return { ok: false, reason: 'busy' };
    savingInstallers.add(appId);
    try {
      const saved = await saveInstaller({ download: downloadFile, verify: verifyFile, workDir: downloadsDir() }, installer, app.getPath('downloads'), {
        onProgress: (received, total) => getMainWindow()?.webContents.send(CHANNELS.installerSaveProgress, { appId, received, total }),
      });
      writtenFiles.add(saved);
      shell.showItemInFolder(saved);
      return { ok: true, path: saved };
    } catch {
      return { ok: false, reason: 'failed' };
    } finally {
      savingInstallers.delete(appId);
    }
  });

  ipcMain.handle(CHANNELS.revealFile, (event, filePath: unknown) => {
    if (!isTrustedSender(event) || typeof filePath !== 'string' || !writtenFiles.has(filePath)) return false;
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle(CHANNELS.pickBackupCopyDirectory, async (event) => {
    if (!isTrustedSender(event)) return null;
    const window = getMainWindow();
    const current = settingsStore.get().backupCopyDirectory;
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const], ...(current ? { defaultPath: current } : {}) };
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return null;
    const settings = await settingsStore.update({ backupCopyDirectory: choice.filePaths[0] });
    if (settings.backupCopyDirectory !== choice.filePaths[0]) await refuseFolder(choice.filePaths[0]);
    broadcastSettings(settings);
    return settings;
  });

  ipcMain.handle(CHANNELS.operationRequestClose, (event, operationId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof operationId !== 'string') return false;
    return installs.requestClose(operationId);
  });

  ipcMain.handle(CHANNELS.operationContinue, (event, operationId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof operationId !== 'string') return false;
    return installs.continueWithoutBackup(operationId);
  });

  ipcMain.handle(CHANNELS.downloadsGet, (event) => {
    if (!isTrustedSender(event) || !installs) throw new Error('ERR_UNTRUSTED_SENDER');
    return installs.getView();
  });

  ipcMain.handle(CHANNELS.operationCancel, (event, operationId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof operationId !== 'string') return false;
    return installs.cancel(operationId);
  });

  ipcMain.handle(CHANNELS.operationDismiss, (event, operationId: unknown) => {
    if (!isTrustedSender(event) || !installs || typeof operationId !== 'string') return false;
    return installs.dismiss(operationId);
  });

  ipcMain.handle(CHANNELS.historyExport, async (event) => {
    if (!isTrustedSender(event) || !installs) return 'failed';
    const window = getMainWindow();
    const day = new Date().toISOString().slice(0, 10);
    const options = {
      title: 'Nebula Hub',
      defaultPath: path.join(app.getPath('documents'), `nebula-hub-journal-${day}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const choice = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return 'cancelled';
    const journal = { app: 'Nebula Hub', version: app.getVersion(), exportedAt: new Date().toISOString(), operations: installs.getView().history };
    try {
      await writeFileAtomic(choice.filePath, JSON.stringify(journal, null, 2));
      return 'saved';
    } catch {
      return 'failed';
    }
  });

  ipcMain.handle(CHANNELS.pickInstallDirectory, async (event) => {
    if (!isTrustedSender(event)) return null;
    const window = getMainWindow();
    const current = settingsStore.get().installDirectory;
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const], ...(current ? { defaultPath: current } : {}) };
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return null;
    // Validated again by the settings parser (isSafeInstallDirectory): an odd path is refused, and said.
    const settings = await settingsStore.update({ installDirectory: choice.filePaths[0] });
    if (settings.installDirectory !== choice.filePaths[0]) await refuseFolder(choice.filePaths[0]);
    broadcastSettings(settings);
    return settings;
  });

  ipcMain.handle(CHANNELS.linkGet, (event) => {
    if (!isTrustedSender(event) || !link) throw new Error('ERR_UNTRUSTED_SENDER');
    return link.view();
  });

  ipcMain.handle(CHANNELS.linkSetConsent, async (event, consumer: unknown, capability: unknown, state: unknown) => {
    if (!isTrustedSender(event) || !link || typeof consumer !== 'string' || typeof capability !== 'string' || !(state === 'granted' || state === 'denied' || state === null)) throw new Error('ERR_BAD_REQUEST');
    return link.setConsent(consumer, capability, state as ConsentState | null);
  });

  ipcMain.handle(CHANNELS.linkDenyApp, async (event, appId: unknown) => {
    if (!isTrustedSender(event) || !link || typeof appId !== 'string') throw new Error('ERR_BAD_REQUEST');
    return link.denyApp(appId);
  });

  ipcMain.handle(CHANNELS.linkOpen, async (event, url: unknown) => {
    if (!isTrustedSender(event) || !link || typeof url !== 'string' || !url.startsWith('nebula://')) return false;
    return (await link.routeDeepLink(url)) !== 'invalid';
  });

  ipcMain.handle(CHANNELS.widgetsGet, (event) => {
    if (!isTrustedSender(event) || !link) throw new Error('ERR_UNTRUSTED_SENDER');
    return link.widgets.views();
  });

  ipcMain.handle(CHANNELS.widgetRefresh, async (event, capabilityId: unknown) => {
    if (!isTrustedSender(event) || !link || typeof capabilityId !== 'string') return false;
    await link.widgets.refresh(capabilityId);
    return true;
  });

  ipcMain.handle(CHANNELS.activityGet, (event) => {
    if (!isTrustedSender(event) || !link) throw new Error('ERR_UNTRUSTED_SENDER');
    return link.activity();
  });

  ipcMain.handle(CHANNELS.activityClear, async (event, appId: unknown) => {
    if (!isTrustedSender(event) || !link || !(appId === null || typeof appId === 'string')) throw new Error('ERR_BAD_REQUEST');
    const items = await link.clearActivity(appId ?? undefined);
    updateTray(trayOptions());
    return items;
  });

  ipcMain.handle(CHANNELS.dockGet, (event) => {
    if (!isTrustedSender(event) || !link) throw new Error('ERR_UNTRUSTED_SENDER');
    return link.dock.view();
  });

  ipcMain.handle(CHANNELS.dockShow, async (event, appId: unknown) => {
    if (!isTrustedSender(event) || !link || typeof appId !== 'string') return false;
    return link.dock.show(appId);
  });

  ipcMain.on(CHANNELS.dockArea, (event, area: unknown) => {
    if (!isTrustedSender(event) || !link || !(area === null || isRect(area))) return;
    link.dock.setArea(area);
  });

  ipcMain.handle(CHANNELS.dockRelease, (event, appId: unknown) => {
    if (!isTrustedSender(event) || !link || typeof appId !== 'string') return false;
    link.dock.release(appId);
    return true;
  });

  ipcMain.handle(CHANNELS.catalogAsset, async (event, appId: unknown, assetPath: unknown) => {
    if (!isTrustedSender(event) || !catalog || typeof appId !== 'string' || typeof assetPath !== 'string') return null;
    return catalog.getAsset(appId, assetPath);
  });
}

/** Explains why a picked folder was not kept (network path, too long, reserved characters). */
async function refuseFolder(folder: string): Promise<void> {
  const language = settingsStore.get().appearance.language;
  const options = { type: 'warning' as const, title: 'Nebula Hub', message: mainString(language, 'folderRefused'), detail: `${folder}\n\n${mainString(language, 'folderRefusedDetail')}` };
  const window = getMainWindow();
  await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

/** Files the Hub wrote or checked in this session: the only ones the renderer may ask to show. */
const writtenFiles = new Set<string>();
const savingInstallers = new Set<string>();

function isOperationKind(value: unknown): value is OperationKind {
  return value === 'install' || value === 'update' || value === 'repair' || value === 'uninstall';
}

/** The `nebula://` link Windows passed on the command line, if any (§ 7). */
function deepLinkIn(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith('nebula://')) ?? null;
}
