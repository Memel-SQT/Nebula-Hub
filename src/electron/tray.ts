import path from 'node:path';
import { Menu, nativeImage, Tray } from 'electron';
import type { Language } from '@nebula/design';
import { mainString } from '../shared/main-strings';

let tray: Tray | null = null;

/**
 * Minimal tray for M1 (open, quit): the Hub lives in the tray so it can launch the Nebula apps
 * and host Nebula Link. Per-app launchers, update badge and Link pause arrive in M7.
 */
export function createTray(options: { language: Language; onOpen: () => void; onQuit: () => void }): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/tray.png'));
  tray = new Tray(icon);
  tray.on('click', options.onOpen);
  updateTray(options);
}

export function updateTray(options: { language: Language; onOpen: () => void; onQuit: () => void }): void {
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
