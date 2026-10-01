import { app, Menu, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { isAppUrl } from './window';

/**
 * Process-wide hardening (rule R10), applied before any window exists:
 * - every renderer is sandboxed;
 * - no permission is ever granted (camera, notifications from the page, geolocation…);
 * - no <webview>, no new window, no navigation away from the app, in any web contents;
 * - no default application menu (it carries reload and DevTools shortcuts).
 */
export function hardenApp(): void {
  app.enableSandbox();
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

export function hardenSession(): void {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** IPC is only answered for the app's own document, never for anything else that might load. */
export function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return isAppUrl(url);
}
