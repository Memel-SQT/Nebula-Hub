import { HUB_ID } from './consent';

/**
 * The activity center (brief I5, docs/NEBULA_LINK.md § 10): notifications sent by the apps over
 * Link, plus the Hub's own (an install or update that finished). 30 days of history, erasable in
 * Settings → Advanced.
 */
export interface ActivityItem {
  id: number;
  /** Sender; `nebula.hub` for the Hub's own entries. */
  appId: string;
  receivedAt: string;
  title: string;
  body: string;
  sensitivity: 'public' | 'private';
  deepLink: string | null;
  category: string | null;
}

export interface ActivityView {
  items: ActivityItem[];
  unread: number;
}

export const EMPTY_ACTIVITY_VIEW: ActivityView = { items: [], unread: 0 };

/** Entries received after the user last opened the activity center. */
export function unreadCount(items: readonly ActivityItem[], seenAt: string | null): number {
  return seenAt ? items.filter((item) => item.receivedAt > seenAt).length : items.length;
}

/**
 * Whether an entry is relayed to a Windows notification: the relay is on, the app is not muted,
 * and the user is not looking at the Hub (the activity center already shows it).
 */
export function shouldRelay(item: Pick<ActivityItem, 'appId'>, settings: { windowsNotifications: boolean; mutedApps: readonly string[] }, windowFocused: boolean): boolean {
  return settings.windowsNotifications && !windowFocused && !settings.mutedApps.includes(item.appId);
}

/**
 * What a Windows notification shows. A private notification can appear on the lock screen and in
 * the Windows notification history, which the Hub does not control: only the app's name and a
 * neutral sentence leave the Hub; the content stays in the activity center.
 */
export function toastContent(item: Pick<ActivityItem, 'title' | 'body' | 'sensitivity'>, appName: string, privateBody: string): { title: string; body: string } {
  if (item.sensitivity === 'private') return { title: appName, body: privateBody };
  return { title: item.title, body: item.body };
}

/** Entries of the Hub itself carry the Hub's id. */
export function isHubEntry(item: Pick<ActivityItem, 'appId'>): boolean {
  return item.appId === HUB_ID;
}
