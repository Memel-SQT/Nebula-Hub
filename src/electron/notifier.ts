import path from 'node:path';
import { Notification } from 'electron';

/**
 * Windows notifications (brief I5, §10 sounds): the activity center relays to Windows while the
 * user is not looking at the Hub. Notifications are kept referenced until they are clicked or
 * closed, otherwise the garbage collector drops their click handler.
 */
const alive = new Set<Notification>();

export function showWindowsNotification(content: { title: string; body: string }, onClick: () => void): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: content.title.slice(0, 120),
    body: content.body.slice(0, 300),
    icon: path.join(__dirname, '../../assets/icon.png'),
  });
  alive.add(notification);
  const release = () => alive.delete(notification);
  notification.on('click', () => {
    release();
    onClick();
  });
  notification.on('close', release);
  notification.on('failed', release);
  notification.show();
}
