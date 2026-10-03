import { execFile } from 'node:child_process';
import path from 'node:path';
import { Menu, nativeImage, nativeTheme, Tray, type MenuItemConstructorOptions } from 'electron';
import type { Language } from '@nebula/design';
import { mainString } from '../shared/main-strings';
import { parseRegDword } from '../shared/registry-dword';

let tray: Tray | null = null;
let current: TrayOptions | null = null;

export interface TrayOptions {
  language: Language;
  /** Installed apps that can be started from the tray (brief §9.8). */
  apps: Array<{ id: string; name: string }>;
  /** Installed apps with a newer release (tooltip and menu, brief §9.8). */
  updates: number;
  /** Unread entries of the activity center (brief §10: the tray count updates without a jump). */
  unread: number;
  onOpen: () => void;
  /** Opens the Hub on Home, where the activity center is. */
  onShowActivity: () => void;
  onCheckUpdates: () => void;
  /** Opens the Hub on My apps, where the updates are. */
  onShowUpdates: () => void;
  onLaunch: (appId: string) => void;
  onQuit: () => void;
  /** "Quit Nebula": opens the Hub on its confirmation (ADR-030). */
  onQuitAll: () => void;
}

const PERSONALIZE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';

/**
 * Whether the Windows taskbar is light. It follows the *system* mode, which can differ from the
 * apps mode that `nativeTheme` reports, hence the registry read (execFile, no shell — R11).
 * Any failure means "dark", the Windows default.
 */
function taskbarIsLight(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', PERSONALIZE_KEY, '/v', 'SystemUsesLightTheme'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      resolve(!error && parseRegDword(String(stdout), 'SystemUsesLightTheme') === 1);
    });
  });
}

/** Monochrome glyph matching the taskbar: white on a dark taskbar, dark on a light one. */
async function refreshIcon(): Promise<void> {
  if (!tray) {
    return;
  }
  const file = (await taskbarIsLight()) ? 'tray-light.png' : 'tray-dark.png';
  tray?.setImage(nativeImage.createFromPath(path.join(__dirname, '../../assets', file)));
}

/**
 * The Hub lives in the tray so it can launch the Nebula apps and host Nebula Link: open, one
 * entry per installed app, the unread activity, the update count and a manual check, quit. There
 * is no Link pause (ADR-023: integrations are cut pair by pair in Integrations).
 */
export function createTray(options: TrayOptions): void {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../../assets/tray-dark.png')));
  tray.on('click', () => current?.onOpen());
  updateTray(options);
  void refreshIcon();
  nativeTheme.on('updated', () => void refreshIcon());
}

export function updateTray(options: TrayOptions): void {
  current = options;
  if (!tray) {
    return;
  }
  const launchers: MenuItemConstructorOptions[] = options.apps.map((app) => ({
    label: mainString(options.language, 'trayLaunch').replace('{name}', app.name),
    click: () => options.onLaunch(app.id),
  }));
  const count = String(options.updates);
  tray.setToolTip(options.updates > 0 ? mainString(options.language, 'trayTooltipUpdates').replace('{count}', count) : mainString(options.language, 'trayTooltip'));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: mainString(options.language, 'trayOpen'), click: options.onOpen },
      ...(launchers.length ? [{ type: 'separator' as const }, ...launchers] : []),
      { type: 'separator' },
      ...(options.unread > 0 ? [{ label: mainString(options.language, 'trayActivity', { count: String(options.unread) }), click: options.onShowActivity }] : []),
      ...(options.updates > 0 ? [{ label: mainString(options.language, 'trayUpdates').replace('{count}', count), click: options.onShowUpdates }] : []),
      { label: mainString(options.language, 'trayCheckUpdates'), click: options.onCheckUpdates },
      { type: 'separator' },
      { label: mainString(options.language, 'trayQuitAll'), click: options.onQuitAll },
      { label: mainString(options.language, 'trayQuit'), click: options.onQuit },
    ]),
  );
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
