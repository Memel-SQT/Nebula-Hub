import type { Manifest } from '@nebula/link';
import { graceLeft, refreshInterval, widgetStateOf, type ReplyLike, type WidgetView } from '../../shared/widgets';

/**
 * The Home widgets (brief I3, docs/NEBULA_LINK.md § 10): the Hub reads every `widget` capability
 * of the installed apps through Link, as consumer `nebula.hub`, under the usual consent rules.
 *
 * Values live in memory only. While the window is hidden in the tray nothing is read, and private
 * values are dropped (the next read happens when the window comes back). An undecided or refused
 * private widget is not polled again until the user changes its consent, so the journal does not
 * fill with refusals.
 */
export interface WidgetBoardDeps {
  /** Manifests of the installed, admitted apps (not the Hub's). */
  manifests(): Manifest[];
  /** App ids with a live, authenticated connection. */
  connected(): string[];
  query(capabilityId: string): Promise<ReplyLike>;
  /** When an app connected (epoch ms): its widgets are read 25 s later at the earliest. */
  connectedSince?(appId: string): number | undefined;
  /** Whether a widget is on the Home (ADR-031): the others get no card and are never read. */
  shown?(capabilityId: string): boolean;
  onChange(widgets: WidgetView[]): void;
  now?(): number;
}

interface Slot {
  view: WidgetView;
  refreshSeconds: number | undefined;
  /** Next read (epoch ms); Infinity = wait for a consent change or a new connection. */
  nextAt: number;
}

const TICK_MS = 15_000;

export class WidgetBoard {
  private readonly slots = new Map<string, Slot>();
  private readonly inFlight = new Set<string>();
  private visible = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Wakes the board when the start grace of a just connected app ends. */
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: WidgetBoardDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  start(): void {
    this.sync();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  /** Milliseconds before this app's widgets may be read (its start grace), 0 when they may be now. */
  private wait(provider: string): number {
    return graceLeft(this.deps.connectedSince?.(provider), this.now());
  }

  /** Reads again exactly when the shortest pending grace ends. */
  private wakeAfter(ms: number): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      void this.tick();
    }, ms + 50);
    this.graceTimer.unref?.();
  }

  views(): WidgetView[] {
    return [...this.slots.values()].map((slot) => slot.view);
  }

  /**
   * Re-reads the manifests: new widgets appear (read at once), widgets of removed apps go away. Also
   * called when the user shows or hides a widget on the Home.
   */
  sync(): void {
    const seen = new Set<string>();
    const connected = new Set(this.deps.connected());
    for (const manifest of this.deps.manifests()) {
      for (const capability of manifest.provides) {
        if (capability.kind !== 'widget' || this.deps.shown?.(capability.id) === false) continue;
        seen.add(capability.id);
        const slot = this.slots.get(capability.id);
        if (slot) {
          slot.refreshSeconds = capability.refreshSeconds;
          continue;
        }
        this.slots.set(capability.id, {
          view: { id: capability.id, provider: manifest.appId, title: capability.title, sensitivity: capability.sensitivity, state: connected.has(manifest.appId) ? 'loading' : 'offline', data: null, refreshedAt: null },
          refreshSeconds: capability.refreshSeconds,
          nextAt: 0,
        });
      }
    }
    for (const id of [...this.slots.keys()]) if (!seen.has(id)) this.slots.delete(id);
    this.connectionsChanged();
  }

  /** An app connected, declared its widgets ready, or left: read what became reachable. */
  connectionsChanged(): void {
    const connected = new Set(this.deps.connected());
    for (const slot of this.slots.values()) {
      if (!connected.has(slot.view.provider)) {
        if (slot.view.state !== 'offline') slot.view = { ...slot.view, state: 'offline', data: null };
        slot.nextAt = 0;
      } else if (slot.view.state === 'offline') {
        slot.view = { ...slot.view, state: 'loading' };
        slot.nextAt = 0;
      }
    }
    this.emit();
    void this.tick();
  }

  /** The user changed a pair of the Hub: that widget is read again now. */
  consentChanged(capabilityId: string): void {
    const slot = this.slots.get(capabilityId);
    if (!slot) return;
    slot.nextAt = 0;
    void this.refresh(capabilityId);
  }

  /** Hidden in the tray: no reads, and private values are forgotten. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) {
      for (const slot of this.slots.values()) {
        if (slot.view.sensitivity === 'private' && slot.view.data) {
          slot.view = { ...slot.view, state: 'loading', data: null };
          slot.nextAt = 0;
        }
      }
      this.emit();
      return;
    }
    void this.tick();
  }

  /** Reads every widget that is due (and reachable). */
  async tick(): Promise<void> {
    if (!this.visible) return;
    const now = this.now();
    const connected = new Set(this.deps.connected());
    const due = [...this.slots.values()].filter((slot) => slot.nextAt <= now && connected.has(slot.view.provider));
    // A just started app is left alone during its start grace; the board wakes up when it ends.
    const waits = due.map((slot) => this.wait(slot.view.provider)).filter((ms) => ms > 0);
    if (waits.length) this.wakeAfter(Math.min(...waits));
    await Promise.all(due.filter((slot) => this.wait(slot.view.provider) === 0).map((slot) => this.refresh(slot.view.id)));
  }

  /** Reads one widget now (the card's refresh button, or a consent change). */
  async refresh(capabilityId: string): Promise<void> {
    const slot = this.slots.get(capabilityId);
    if (!slot || !this.visible || this.inFlight.has(capabilityId)) return;
    if (!this.deps.connected().includes(slot.view.provider)) {
      slot.view = { ...slot.view, state: 'offline', data: null };
      this.emit();
      return;
    }
    // Still starting: the card stays "loading" and is read when the grace ends.
    const wait = this.wait(slot.view.provider);
    if (wait > 0) {
      this.wakeAfter(wait);
      return;
    }
    this.inFlight.add(capabilityId);
    try {
      const reply = await this.deps.query(capabilityId);
      const current = this.slots.get(capabilityId);
      if (!current) return;
      const { state, data } = widgetStateOf(reply, current.view.provider);
      // Hidden while the read was in flight: a private value is not kept.
      const keep = this.visible || current.view.sensitivity === 'public';
      current.view = { ...current.view, state: keep ? state : 'loading', data: keep ? data : null, refreshedAt: new Date(this.now()).toISOString() };
      // Connected but not ready yet (no `link.ready`): try again soon rather than in minutes.
      const delay = state === 'offline' ? 30 : refreshInterval(current.refreshSeconds);
      current.nextAt = state === 'consent-required' || state === 'denied' ? Number.POSITIVE_INFINITY : this.now() + delay * 1000;
    } catch {
      const current = this.slots.get(capabilityId);
      if (current) {
        current.view = { ...current.view, state: 'error', data: null };
        current.nextAt = this.now() + refreshInterval(current.refreshSeconds) * 1000;
      }
    } finally {
      this.inFlight.delete(capabilityId);
    }
    this.emit();
  }

  private emit(): void {
    this.deps.onChange(this.views());
  }
}
