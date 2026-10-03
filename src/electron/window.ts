import path from 'node:path';
import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron';
import { resolveTheme, type ResolvedTheme } from '@nebula/design';
import { CHANNELS } from '../shared/bridge';
import type { HubSettings } from '../shared/settings';
import { isSafeExternalUrl } from '../shared/url';

// NEBULA_HUB_USE_BUILD runs an unpackaged Electron against the built renderer (file://, CSP),
// to check the production page without packaging.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? (!app.isPackaged && !process.env.NEBULA_HUB_USE_BUILD ? 'http://127.0.0.1:5173' : undefined);

let mainWindow: BrowserWindow | null = null;
let quitting = false;

export function setQuitting(value: boolean): void {
  quitting = value;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** The renderer's own document: the only URL the window may ever show. */
export function isAppUrl(url: string): boolean {
  if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) {
    return true;
  }
  return url.startsWith('file://') && decodeURIComponent(new URL(url).pathname).replace(/\\/g, '/').endsWith('/dist/renderer/index.html');
}

/** Page and ink colors of each theme (tokens.css), for the native window chrome. */
const CHROME: Record<ResolvedTheme, { page: string; ink: string }> = {
  'nebula-dark': { page: '#0a0a0f', ink: '#f1f1f6' },
  'nebula-light': { page: '#f4f3fb', ink: '#18172b' },
  'glass-dark': { page: '#06060f', ink: '#f5f4ff' },
  'glass-light': { page: '#e9ebf8', ink: '#17162a' },
};

function chrome(settings: HubSettings): { page: string; ink: string } {
  return CHROME[resolveTheme(settings.appearance.theme, nativeTheme.shouldUseDarkColors)];
}

/** Height of the drag strip (.titlebar-drag in dashboard.css) and of the window controls. */
const TITLE_BAR_HEIGHT = 36;

function titleBarOverlay(settings: HubSettings): Electron.TitleBarOverlayOptions {
  // Transparent: the app's own background (and its animated glow) shows behind the controls.
  return { color: 'rgba(0, 0, 0, 0)', symbolColor: chrome(settings).ink, height: TITLE_BAR_HEIGHT };
}

/** Keeps the native window controls in the current theme (called on every settings change). */
export function applyWindowTheme(settings: HubSettings): void {
  const window = getMainWindow();
  if (window) {
    window.setTitleBarOverlay(titleBarOverlay(settings));
    window.setBackgroundColor(chrome(settings).page);
  }
}

const visibilityListeners = new Set<(visible: boolean) => void>();

/** Main-process side of the visibility (widgets drop private values when the Hub is hidden). */
export function onWindowVisibilityChange(listener: (visible: boolean) => void): () => void {
  visibilityListeners.add(listener);
  return () => visibilityListeners.delete(listener);
}

const geometryListeners = new Set<(focused: boolean) => void>();
const blurListeners = new Set<() => void>();

/** The Hub window lost the focus (Hub mode: no more follow-up raises of the docked app). */
export function onWindowBlur(listener: () => void): () => void {
  blurListeners.add(listener);
  return () => blurListeners.delete(listener);
}

/** Moves, resizes, minimize / restore, hide / show and focus of the window (Hub mode, ADR-027). */
export function onWindowGeometry(listener: (focused: boolean) => void): () => void {
  geometryListeners.add(listener);
  return () => geometryListeners.delete(listener);
}

/** The content area in screen DIPs, or null when the window is hidden or minimized. */
export function contentBounds(): { x: number; y: number; width: number; height: number } | null {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return null;
  return window.getContentBounds();
}

/** Whether the user is looking at the Hub right now (Windows notifications are not needed then). */
export function isWindowFocused(): boolean {
  const window = getMainWindow();
  return Boolean(window && window.isVisible() && !window.isMinimized() && window.isFocused());
}

function sendVisibility(window: BrowserWindow): void {
  const visible = !window.isDestroyed() && window.isVisible() && !window.isMinimized();
  if (!window.isDestroyed()) {
    window.webContents.send(CHANNELS.windowVisibility, visible);
  }
  for (const listener of visibilityListeners) listener(visible);
}

/**
 * The single, hardened application window (rule R10): context isolation, sandbox, no Node in
 * the renderer, web security on, no navigation away from the app, no new windows. Closing it
 * hides it to the tray when the setting says so; the visibility is pushed to the renderer so
 * canvas backgrounds and sounds stop while hidden.
 */
export async function createMainWindow(options: { settings: () => HubSettings; startHidden: boolean }): Promise<BrowserWindow> {
  // Sized to the screen it opens on (laptops, 125–150 % scaling): never bigger than its work
  // area. Small windows switch the layout to its compact mode (app.css).
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const window = new BrowserWindow({
    width: Math.min(1280, Math.round(area.width * 0.92)),
    height: Math.min(860, Math.round(area.height * 0.9)),
    minWidth: Math.min(720, area.width),
    minHeight: Math.min(520, area.height),
    show: false,
    title: 'Nebula Hub',
    backgroundColor: chrome(options.settings()).page,
    // No native title bar: the window is drawn in the app's theme, Windows only draws the
    // three controls on top (themed through titleBarOverlay).
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(options.settings()),
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });

  window.on('close', (event) => {
    if (!quitting && options.settings().closeToTray) {
      event.preventDefault();
      window.hide();
    }
  });
  for (const name of ['show', 'hide', 'minimize', 'restore'] as const) {
    window.on(name as 'show', () => sendVisibility(window));
  }
  for (const name of ['move', 'resize', 'hide', 'minimize', 'enter-full-screen', 'leave-full-screen'] as const) {
    window.on(name as 'move', () => geometryListeners.forEach((listener) => listener(false)));
  }
  // The Hub comes (back) to the front: the docked app is raised above it again. 'moved' and
  // 'resized' end a drag of the window's edge or title bar, which brings the Hub over the app.
  window.on('focus', () => geometryListeners.forEach((listener) => listener(true)));
  window.on('blur', () => blurListeners.forEach((listener) => listener()));
  for (const name of ['show', 'restore', 'maximize', 'unmaximize', 'moved', 'resized'] as const) {
    window.on(name as 'show', () => geometryListeners.forEach((listener) => listener(window.isFocused())));
  }
  window.on('closed', () => geometryListeners.forEach((listener) => listener(false)));
  window.once('ready-to-show', () => {
    if (!options.startHidden) {
      window.show();
    }
  });
  window.on('closed', () => {
    mainWindow = null;
    for (const listener of visibilityListeners) listener(false);
  });

  if (DEV_SERVER_URL) {
    await window.loadURL(DEV_SERVER_URL);
    if (!process.env.NEBULA_HUB_NO_DEVTOOLS) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return window;
}

export function showMainWindow(): void {
  const window = getMainWindow();
  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
