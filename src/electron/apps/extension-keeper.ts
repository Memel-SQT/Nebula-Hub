import type { CatalogApp } from '../../shared/catalog';
import { backgroundStartBlocker, START_WINDOW_MS } from '../../shared/extensions';
import type { InstalledView } from '../../shared/installed-view';

export interface ExtensionKeeperDeps {
  apps(): CatalogApp[];
  installedView(): InstalledView;
  /** An install, update, repair or uninstall of this app is queued or running. */
  busy(appId: string): boolean;
  /** The user's setting "keep the extensions running in the background". */
  enabled(): boolean;
  launch(appId: string, args: readonly string[]): Promise<boolean>;
  now?(): number;
}

/**
 * Keeps the extensions (ADR-034) running in the background while the Hub runs: started hidden with
 * their background switch when the Hub starts, when they get installed, and again if they stop.
 * Never during an operation on them, never after "Quit Nebula", at most a few times in a row.
 */
export class ExtensionKeeper {
  private readonly starts = new Map<string, number[]>();
  private suspended = false;

  constructor(private readonly deps: ExtensionKeeperDeps) {}

  /** "Quit Nebula" or the Hub quitting: nothing is started any more. */
  suspend(): void {
    this.suspended = true;
  }

  /** Starts what should be running; returns the app ids it started. */
  async check(): Promise<string[]> {
    if (this.suspended || !this.deps.enabled()) return [];
    const view = this.deps.installedView();
    if (view.state !== 'ready') return [];
    const now = this.deps.now?.() ?? Date.now();
    const started: string[] = [];
    for (const app of this.deps.apps()) {
      const recent = (this.starts.get(app.id) ?? []).filter((at) => now - at < START_WINDOW_MS);
      const installed = view.apps.find((candidate) => candidate.appId === app.id);
      if (backgroundStartBlocker(app, installed, recent, now, this.deps.busy(app.id)) !== null) continue;
      this.starts.set(app.id, [...recent, now]);
      if (await this.deps.launch(app.id, [app.extension!.backgroundArgument])) started.push(app.id);
    }
    return started;
  }
}
