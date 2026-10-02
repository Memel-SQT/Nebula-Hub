import fs from 'node:fs/promises';
import path from 'node:path';
import type { CatalogEntry } from '../../shared/catalog-view';
import {
  availableHubVersion,
  HUB_UPDATE_ARGUMENTS,
  hubUpdateBlocker,
  isHubUpdating,
  type HubUpdateFailure,
  type HubUpdatePhase,
  type HubUpdateStartResult,
  type HubUpdateView,
} from '../../shared/hub-update';
import { DownloadError, type Downloader } from '../net/download';

export interface HubUpdaterDeps {
  /** The catalog entry of the Hub (`role: 'hub'`). */
  entry(): CatalogEntry | undefined;
  currentVersion: string;
  /** False in development and with a throwaway data folder: never replace the real Hub from there. */
  packaged: boolean;
  /** An app install, update, repair or uninstall is queued or running. */
  busy(): boolean;
  download: Downloader;
  verify(filePath: string, size: number, sha512: string): Promise<void>;
  workDir: string;
  /** Starts the verified installer detached (no shell, R11); resolves once it is running. */
  launch(installer: string, args: readonly string[]): Promise<void>;
  /** Quits the Hub for real (not to the tray). */
  quit(): void;
  progressIntervalMs?: number;
  busyPollMs?: number;
  now?: () => number;
}

class Cancelled extends Error {}

/**
 * The Hub updating itself (ADR-029): download from an allowed source (R05 on every hop), size and
 * SHA-512 checked against latest.yml (R02), then the installer runs detached with
 * `--updated /S --force-run` (ADR-004: data kept, never `/D`, never `--delete-app-data`) while
 * the Hub quits; the installer starts the new version. Only on the user's confirmed request, never
 * while an app operation runs (it would be cut off).
 */
export class HubUpdater {
  private phase: HubUpdatePhase = 'idle';
  private received = 0;
  private total = 0;
  private failure: HubUpdateFailure | null = null;
  private controller: AbortController | null = null;
  private lastEmit = 0;
  private readonly listeners = new Set<(view: HubUpdateView) => void>();

  constructor(private readonly deps: HubUpdaterDeps) {}

  view(): HubUpdateView {
    const entry = this.deps.entry();
    const available = availableHubVersion(entry, this.deps.currentVersion);
    return {
      current: this.deps.currentVersion,
      available,
      size: available ? entry?.release?.installer?.size ?? null : null,
      phase: this.phase,
      received: this.received,
      total: this.total,
      failure: this.failure,
      blocked: hubUpdateBlocker(entry, this.deps.currentVersion, this.phase, this.deps.packaged),
    };
  }

  onChange(listener: (view: HubUpdateView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The catalog changed (new release, refresh): the view is pushed again. */
  refresh(): void {
    this.emit();
  }

  /** Only after the user's yes on the confirmation screen (the Hub and its docked apps close). */
  start(confirmed: boolean): HubUpdateStartResult {
    const blocked = this.view().blocked;
    if (blocked) return blocked;
    if (!confirmed) return 'unconfirmed';
    this.controller = new AbortController();
    this.failure = null;
    this.received = 0;
    this.total = this.deps.entry()?.release?.installer?.size ?? 0;
    void this.run(this.deps.entry()!, this.controller.signal);
    return 'started';
  }

  /** Stops a download or a wait; once the installer is started, it is too late. */
  cancel(): boolean {
    if (!this.controller || this.phase === 'restarting' || !isHubUpdating(this.phase)) return false;
    this.controller.abort();
    return true;
  }

  private set(phase: HubUpdatePhase): void {
    this.phase = phase;
    this.emit();
  }

  private emit(): void {
    const view = this.view();
    for (const listener of this.listeners) listener(view);
  }

  private async run(entry: CatalogEntry, signal: AbortSignal): Promise<void> {
    const installer = entry.release!.installer!;
    const file = path.join(this.deps.workDir, installer.fileName);
    const part = `${file}.part`;
    try {
      await fs.mkdir(this.deps.workDir, { recursive: true });
      this.set('downloading');
      await this.deps.download(installer.url, part, {
        expectedSize: installer.size,
        signal,
        onProgress: (received, total) => this.progress(received, total),
      });
      if (signal.aborted) throw new Cancelled();
      this.set('verifying');
      await this.deps.verify(part, installer.size, installer.sha512);
      await fs.rename(part, file);
      // An app operation cut off by the Hub quitting would leave a broken app: wait for it.
      if (this.deps.busy()) {
        this.set('waiting');
        while (this.deps.busy()) {
          await this.sleep(this.deps.busyPollMs ?? 2000, signal);
          if (signal.aborted) throw new Cancelled();
        }
      }
      this.set('restarting');
      try {
        await this.deps.launch(file, HUB_UPDATE_ARGUMENTS);
      } catch {
        this.fail('launch');
        return;
      }
      this.deps.quit();
    } catch (error) {
      if (error instanceof Cancelled || signal.aborted || (error instanceof DownloadError && error.code === 'cancelled')) {
        await fs.rm(part, { force: true }).catch(() => undefined);
        await fs.rm(file, { force: true }).catch(() => undefined);
        this.received = 0;
        this.set('idle');
        return;
      }
      await fs.rm(part, { force: true }).catch(() => undefined);
      const mismatch = error instanceof DownloadError && (error.code === 'size-mismatch' || error.code === 'hash-mismatch');
      this.fail(mismatch || this.phase === 'verifying' ? 'verify' : 'download');
    } finally {
      if (this.phase !== 'restarting') this.controller = null;
    }
  }

  private fail(failure: HubUpdateFailure): void {
    this.failure = failure;
    this.set('failed');
  }

  private progress(received: number, total: number): void {
    this.received = received;
    this.total = total;
    const at = this.deps.now?.() ?? Date.now();
    if (received === total || at - this.lastEmit >= (this.deps.progressIntervalMs ?? 250)) {
      this.lastEmit = at;
      this.emit();
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}
