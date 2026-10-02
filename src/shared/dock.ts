/**
 * Apps "inside the Hub" (ADR-027, docs/NEBULA_LINK.md § 17): the app keeps its own process and
 * window, but in Hub mode that window is frameless and laid over the Hub's content area, following
 * it. The Hub tells the app where to be with the event `nebula.hub.dock` (DockV1), sent to that
 * app only. Coordinates are Electron screen DIPs, the unit of `BrowserWindow.setBounds`.
 */
export const DOCK_EVENT = 'nebula.hub.dock';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockPayload =
  /** Be at `bounds`; `visible` false = hide (Hub minimized, hidden, or another screen shown); `raise` = come to the front without taking the focus. */
  | { state: 'docked'; visible: boolean; raise: boolean; bounds: Rect }
  /** Back to the app's own standalone window. */
  | { state: 'released' };

/** What the renderer needs: which apps can be docked, which are, which one is shown. */
export interface DockView {
  dockable: string[];
  open: Array<{ appId: string; connected: boolean }>;
  active: string | null;
}

export const EMPTY_DOCK_VIEW: DockView = { dockable: [], open: [], active: null };

/** Smallest area worth showing an app in. */
const MIN_SIDE = 120;
const MAX_SIDE = 20_000;

export function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key] as number) && Math.abs(rect[key] as number) <= MAX_SIDE)
    && (rect.width as number) >= 0 && (rect.height as number) >= 0;
}

/** The area (relative to the window's content) in screen coordinates, rounded, kept inside the content. */
export function dockBounds(content: Rect, area: Rect): Rect {
  const left = Math.max(0, Math.round(area.x));
  const top = Math.max(0, Math.round(area.y));
  const width = Math.max(0, Math.min(Math.round(area.width), Math.round(content.width) - left));
  const height = Math.max(0, Math.min(Math.round(area.height), Math.round(content.height) - top));
  return { x: Math.round(content.x) + left, y: Math.round(content.y) + top, width, height };
}

/**
 * The message for the shown app. `content` is null when the Hub window is hidden or minimized;
 * `area` is null when the Hub shows another screen.
 */
export function dockPayload(content: Rect | null, area: Rect | null, raise: boolean): DockPayload {
  if (!content || !area) return { state: 'docked', visible: false, raise: false, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  const bounds = dockBounds(content, area);
  const visible = bounds.width >= MIN_SIDE && bounds.height >= MIN_SIDE;
  return { state: 'docked', visible, raise: visible && raise, bounds };
}

/** An app supports the Hub mode when its manifest consumes `nebula.hub.dock`. */
export function supportsDock(manifest: { consumes: ReadonlyArray<{ id: string }> }): boolean {
  return manifest.consumes.some((entry) => entry.id === DOCK_EVENT);
}

/** Two payloads that would move nothing (no need to send). */
export function samePayload(a: DockPayload | undefined, b: DockPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
