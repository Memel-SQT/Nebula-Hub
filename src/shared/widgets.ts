/**
 * Home widgets (brief I3, docs/NEBULA_LINK.md § 10): what the renderer receives, and the pure rules
 * for their order. Values only travel main → renderer in memory; they are never written to disk
 * (only the order of the cards is persisted, as capability ids).
 */
export type WidgetState =
  /** First read not answered yet. */
  | 'loading'
  | 'ready'
  /** The app answered `null` (e.g. Finterest with no unlocked account). */
  | 'empty'
  /** Private widget the user has not decided on yet. */
  | 'consent-required'
  | 'denied'
  /** The app is installed but not running (or not connected to Link). */
  | 'offline'
  | 'error';

export interface WidgetItem {
  label: string;
  value: string;
}

/** `WidgetV1` as validated by the Link server. */
export interface WidgetData {
  title: string;
  value?: string;
  unit?: string;
  caption?: string;
  items?: WidgetItem[];
  deepLink?: string;
  updatedAt: string;
}

export interface WidgetView {
  /** Capability id, e.g. `clock.focus.today`. */
  id: string;
  provider: string;
  title: { fr: string; en?: string };
  sensitivity: 'public' | 'private';
  state: WidgetState;
  data: WidgetData | null;
  refreshedAt: string | null;
}

export type ReplyLike = { result: unknown } | { error: string };

/**
 * Widgets the Home does not show unless the user turns them on in Integrations (ADR-031): the
 * News themes meant for another app (Clock during breaks, Finterest), and "Top stories", which
 * "Today's tech" replaces on the Hub's Home. They are not even read while off.
 */
export const HOME_HIDDEN_BY_DEFAULT: readonly string[] = ['news.headlines.today', 'news.focus.today', 'news.finance.today'];

/** Whether a widget is on the Home: the user's choice, else the default. */
export function shownOnHome(capabilityId: string, choices: Readonly<Record<string, boolean>>): boolean {
  return choices[capabilityId] ?? !HOME_HIDDEN_BY_DEFAULT.includes(capabilityId);
}

/**
 * A widget opens its own app only: its `deepLink` must target the provider (`nebula://news/…`
 * for `nebula.news`). Anything else is dropped, the card simply does not open.
 */
export function ownDeepLink(provider: string, link: string | undefined): boolean {
  if (link === undefined) return false;
  const host = provider.replace(/^nebula./, '');
  return link === `nebula://${host}` || link.startsWith(`nebula://${host}/`) || link.startsWith(`nebula://${host}?`);
}

/** Maps a Link reply of the Hub's `queryAs` to the card's state (`provider`: who answered). */
export function widgetStateOf(reply: ReplyLike, provider?: string): { state: WidgetState; data: WidgetData | null } {
  if ('result' in reply) {
    if (reply.result === null) return { state: 'empty', data: null };
    const data = reply.result as WidgetData;
    if (provider && data.deepLink !== undefined && !ownDeepLink(provider, data.deepLink)) {
      const { deepLink: _dropped, ...rest } = data;
      return { state: 'ready', data: rest };
    }
    return { state: 'ready', data };
  }
  switch (reply.error) {
    case 'consent-required':
      return { state: 'consent-required', data: null };
    case 'consent-denied':
      return { state: 'denied', data: null };
    case 'provider-offline':
      return { state: 'offline', data: null };
    default:
      return { state: 'error', data: null };
  }
}

/**
 * A freshly started app is read only this long after it connected (user request 2026-10-05): during
 * its first seconds its data is not ready (Nebula News still starts its server) and a read would
 * only time out, leaving the card empty until the next refresh.
 */
export const APP_START_GRACE_MS = 25_000;

/** Milliseconds left before an app connected at `since` (epoch ms) may be read; 0 = now. */
export function graceLeft(since: number | undefined, now: number): number {
  if (since === undefined || !Number.isFinite(since)) return 0;
  return Math.max(0, since + APP_START_GRACE_MS - now);
}

/** Seconds between two reads: what the app declares, never under 30 s, 5 min by default. */
export function refreshInterval(refreshSeconds: number | undefined): number {
  return Math.max(30, refreshSeconds ?? 300);
}

/** The cards in the user's order; new widgets go to the end, in the order they arrived. */
export function orderWidgets<T extends { id: string }>(widgets: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return widgets
    .map((widget, index) => ({ widget, key: rank.get(widget.id) ?? order.length + index }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.widget);
}

/** Moves one card by `delta` places (keyboard buttons) and returns the full new order. */
export function moveWidget(visible: readonly string[], id: string, delta: number): string[] {
  const from = visible.indexOf(id);
  if (from < 0) return [...visible];
  const to = Math.min(visible.length - 1, Math.max(0, from + delta));
  return placeWidget(visible, id, to);
}

/** Puts one card at an index (drag and drop) and returns the full new order. */
export function placeWidget(visible: readonly string[], id: string, index: number): string[] {
  const rest = visible.filter((candidate) => candidate !== id);
  if (rest.length === visible.length) return [...visible];
  const at = Math.min(rest.length, Math.max(0, index));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
