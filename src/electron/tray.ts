import { execFile } from 'node:child_process';
import path from 'node:path';
import { Menu, nativeImage, nativeTheme, Tray } from 'electron';
import type { Language } from '@nebula/design';
import { mainString } from '../shared/main-strings';
import { parseRegDword } from '../shared/registry-dword';

let tray: Tray | null = null;
let current: TrayOptions | null = null;

interface TrayOptions {
  language: Language;
  onOpen: () => void;
  onQuit: () => void;
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
 * The Hub lives in the tray so it can launch the Nebula apps and host Nebula Link. M1: open and
 * quit; per-app launchers, update badge and Link pause arrive in M7.
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
  tray.setToolTip(mainString(options.language, 'trayTooltip'));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: mainString(options.language, 'trayOpen'), click: options.onOpen },
      { type: 'separator' },
      { label: mainString(options.language, 'trayQuit'), click: options.onQuit },
    ]),
  );
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
