import { DOCK_EVENT, dockPayload, samePayload, type DockPayload, type DockView, type Rect } from '../../shared/dock';

/**
 * The Hub mode (ADR-027, docs/NEBULA_LINK.md § 17). An app opened "in the Hub" keeps its own
 * process and window; the Hub sends it, and only it, where its frameless window must be: over the
 * content area of the Hub, following every move, resize, minimize and screen change. One docked
 * app is shown at a time (the others are told to hide), like tabs.
 *
 * Nothing is forced on an app: if it does not answer the dock event (older version), it simply
 * stays in its own window, and the user can always detach it.
 */
export interface DockDeps {
  /** Apps whose installed manifest consumes `nebula.hub.dock`. */
  dockable(): string[];
  /** Apps connected and subscribed to `nebula.hub.dock`. */
  subscribed(): string[];
  send(appId: string, payload: DockPayload): boolean;
  /** The Hub window's content bounds in screen DIPs, or null when hidden or minimized. */
  content(): Rect | null;
  launch(appId: string): Promise<boolean>;
  onChange(view: DockView): void;
  /** Timer (tests inject a fake one); returns a cancel function. */
  timer?(callback: () => void, ms: number): () => void;
}

/**
 * When an app appears in the Hub, Windows often activates the Hub again a moment later (the app
 * swaps its normal window for the frameless one, and the closed window hands the activation to
 * the Hub), which brings the Hub over the app. The raise is sent again after these delays, as
 * long as the Hub keeps the focus.
 */
export const FOLLOW_UP_RAISES_MS: readonly number[] = [400, 1500, 3500];

export class DockController {
  /** Apps opened in the Hub, in opening order. */
  private open: string[] = [];
  private active: string | null = null;
  /** Content-relative area of the docked screen in the renderer; null when another screen is shown. */
  private area: Rect | null = null;
  private readonly sent = new Map<string, DockPayload>();
  private raiseNext = false;
  /** Open apps seen connected at least once: losing them means the user quit the app. */
  private readonly seen = new Set<string>();
  private followUps: Array<() => void> = [];

  constructor(private readonly deps: DockDeps) {}

  view(): DockView {
    const subscribed = new Set(this.deps.subscribed());
    return { dockable: this.deps.dockable(), open: this.open.map((appId) => ({ appId, connected: subscribed.has(appId) })), active: this.active };
  }

  /** Opens (or shows again) an app in the Hub; launches it when it is not running yet. */
  async show(appId: string): Promise<boolean> {
    if (!this.deps.dockable().includes(appId)) return false;
    if (!this.open.includes(appId)) this.open.push(appId);
    this.active = appId;
    this.raiseNext = true;
    if (!this.deps.subscribed().includes(appId)) {
      const launched = await this.deps.launch(appId);
      if (!launched) {
        this.open = this.open.filter((candidate) => candidate !== appId);
        if (this.active === appId) this.active = null;
        this.changed();
        return false;
      }
    }
    this.sync();
    this.changed();
    return true;
  }

  /** The renderer's docked area moved or appeared (null: the user left the docked screen). */
  setArea(area: Rect | null): void {
    this.area = area;
    this.sync();
  }

  /** The Hub window moved, resized, was minimized, restored, hidden or shown. */
  windowChanged(focused = false): void {
    if (focused) this.raiseNext = true;
    this.sync();
  }

  /** The Hub lost the focus (another window, or the docked app itself): no more follow-up raises. */
  windowBlurred(): void {
    this.cancelFollowUps();
  }

  /** Back to the app's own window. */
  release(appId: string): void {
    if (!this.open.includes(appId)) return;
    this.deps.send(appId, { state: 'released' });
    this.sent.delete(appId);
    this.seen.delete(appId);
    this.open = this.open.filter((candidate) => candidate !== appId);
    if (this.active === appId) this.active = null;
    this.changed();
  }

  /** Quitting the Hub: every docked app goes back to its own window. */
  releaseAll(): void {
    this.cancelFollowUps();
    for (const appId of [...this.open]) this.release(appId);
  }

  /**
   * Connections changed: a docked app that subscribed gets its place at once; one that was
   * connected and is gone was quit by the user, so it is forgotten (its window went with it).
   */
  connectionsChanged(): void {
    const subscribed = new Set(this.deps.subscribed());
    for (const appId of [...this.open]) {
      if (subscribed.has(appId)) {
        this.seen.add(appId);
      } else if (this.seen.has(appId)) {
        this.seen.delete(appId);
        this.sent.delete(appId);
        this.open = this.open.filter((candidate) => candidate !== appId);
        if (this.active === appId) this.active = null;
      }
    }
    this.sync();
    this.changed();
  }

  /**
   * Sends each open app its payload: the active one its place, the others "hidden"; the same place
   * is never sent twice. A raise is an action, not a state: it is sent every time it is asked for
   * (each time the Hub comes back to the front), even when the place did not change. Deduplicating
   * it hid the app behind the Hub from the second time the user came back to the Hub.
   */
  private sync(): void {
    const subscribed = new Set(this.deps.subscribed());
    const content = this.deps.content();
    const raise = this.raiseNext;
    for (const appId of this.open) {
      if (!subscribed.has(appId)) continue;
      const payload = appId === this.active ? dockPayload(content, this.area, raise) : dockPayload(null, null, false);
      const raising = payload.state === 'docked' && payload.raise;
      const settled: DockPayload = payload.state === 'docked' ? { ...payload, raise: false } : payload;
      const previous = this.sent.get(appId);
      const appearing = appId === this.active && payload.state === 'docked' && payload.visible && !(previous?.state === 'docked' && previous.visible);
      if (appId === this.active && payload.state === 'docked' && payload.visible) this.raiseNext = false;
      if (!raising && samePayload(previous, settled)) continue;
      if (this.deps.send(appId, payload)) {
        this.sent.set(appId, settled);
        if (appearing) this.scheduleFollowUps();
      }
    }
  }

  private scheduleFollowUps(): void {
    this.cancelFollowUps();
    const timer = this.deps.timer ?? ((callback: () => void, ms: number) => {
      const handle = setTimeout(callback, ms);
      handle.unref?.();
      return () => clearTimeout(handle);
    });
    this.followUps = FOLLOW_UP_RAISES_MS.map((ms) => timer(() => {
      this.raiseNext = true;
      this.sync();
    }, ms));
  }

  private cancelFollowUps(): void {
    for (const cancel of this.followUps.splice(0)) cancel();
  }

  private changed(): void {
    this.deps.onChange(this.view());
  }
}

export { DOCK_EVENT };
