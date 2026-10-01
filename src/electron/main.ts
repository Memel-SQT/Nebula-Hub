import path from 'node:path';
import { app, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { CHANNELS, type InitialState } from '../shared/bridge';
import type { HubSettings } from '../shared/settings';
import { isSafeExternalUrl } from '../shared/url';
import { InstalledAppsService } from './apps/installed-apps';
import { windowsProbe } from './apps/system-probe';
import { CatalogService } from './catalog/catalog-service';
import { CATALOG_PUBLIC_KEY } from './catalog-key';
import { HubDatabase } from './db';
import { writeFileAtomic } from './fsutil';
import { InstallHistory } from './install/history';
import { InstallManager } from './install/install-manager';
import { spawnInstallerRunner } from './install/installer-runner';
import { downloadFile, verifyFile } from './net/download';
import { httpGet } from './net/http';
import { hardenApp, hardenSession, isTrustedSender } from './security';
import { SettingsStore } from './settings-store';
import { createTray, destroyTray, updateTray, type TrayOptions } from './tray';
import { applyWindowTheme, createMainWindow, getMainWindow, setQuitting, showMainWindow } from './window';

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
  app.on('second-instance', () => void openWindow());

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
    });
    installs = new InstallManager({
      entry: (appId) => catalog?.getView().entries.find((entry) => entry.app.id === appId),
      installedView: () => installed?.getView() ?? { state: 'loading', apps: [], detectedAt: null },
      detect: () => installed!.detect(),
      runningProcesses: () => windowsProbe.runningProcesses(),
      download: downloadFile,
      verify: verifyFile,
      runner: spawnInstallerRunner,
      history: new InstallHistory(database),
      downloadsDir: downloadsDir(),
      installDirectory: () => settingsStore.get().installDirectory,
    });
    await installs.cleanup();
    installs.onChange((view) => getMainWindow()?.webContents.send(CHANNELS.downloadsChanged, view));
    // A new catalog may list new apps: detect again.
    catalog.onChange(() => installed?.requestDetect());
    registerIpcHandlers();
    await createMainWindow(windowOptions(startedHidden));
    void installed.detect();
    createTray(trayOptions());
    // 'system' follows Windows: keep the native controls in step when the OS theme flips.
    nativeTheme.on('updated', () => applyWindowTheme(settingsStore.get()));
    // Network refresh in the background (reused if younger than 6 h): the window never waits.
    void catalog.refresh();
  });

  app.on('before-quit', () => {
    setQuitting(true);
    destroyTray();
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

/** Coming back to the Hub re-checks what is installed and running (debounced, brief 7.1). */
app.on('browser-window-focus', () => installed?.requestDetect());

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
  return {
    language: settingsStore.get().appearance.language,
    apps: launchable,
    onOpen: () => void openWindow(),
    onLaunch: (appId) => void installed?.launch(appId),
    onQuit: quit,
  };
}

function broadcastSettings(settings: HubSettings): void {
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
    return installed.launch(appId);
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
    // Validated again by the settings parser (isSafeInstallDirectory): an odd path is ignored.
    const settings = await settingsStore.update({ installDirectory: choice.filePaths[0] });
    broadcastSettings(settings);
    return settings;
  });

  ipcMain.handle(CHANNELS.catalogAsset, async (event, appId: unknown, assetPath: unknown) => {
    if (!isTrustedSender(event) || !catalog || typeof appId !== 'string' || typeof assetPath !== 'string') return null;
    return catalog.getAsset(appId, assetPath);
  });
}
