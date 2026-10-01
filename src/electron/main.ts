import path from 'node:path';
import { app, ipcMain, nativeTheme, shell } from 'electron';
import { CHANNELS, type InitialState } from '../shared/bridge';
import type { HubSettings } from '../shared/settings';
import { isSafeExternalUrl } from '../shared/url';
import { CatalogService } from './catalog/catalog-service';
import { CATALOG_PUBLIC_KEY } from './catalog-key';
import { HubDatabase } from './db';
import { httpGet } from './net/http';
import { hardenApp, hardenSession, isTrustedSender } from './security';
import { SettingsStore } from './settings-store';
import { createTray, destroyTray, updateTray } from './tray';
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
    registerIpcHandlers();
    await createMainWindow(windowOptions(startedHidden));
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

function quit(): void {
  setQuitting(true);
  app.quit();
}

function trayOptions() {
  return { language: settingsStore.get().appearance.language, onOpen: () => void openWindow(), onQuit: quit };
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

  ipcMain.handle(CHANNELS.catalogAsset, async (event, appId: unknown, assetPath: unknown) => {
    if (!isTrustedSender(event) || !catalog || typeof appId !== 'string' || typeof assetPath !== 'string') return null;
    return catalog.getAsset(appId, assetPath);
  });
}
