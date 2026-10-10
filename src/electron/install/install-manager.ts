import fs from 'node:fs/promises';
import path from 'node:path';
import { backupArgument, backupCopyPath, backupPath, MAX_BACKUP_BYTES, validateBackup, type BackupProblem, type ExportDataResult } from '../../shared/backup';
import type { CatalogEntry } from '../../shared/catalog-view';
import {
  isActive,
  isCancellable,
  needsConfirmation,
  PENDING_PHASES,
  restingPhase,
  transition,
  type DownloadsView,
  type EnqueueResult,
  type FailureReason,
  type HistoryEntry,
  type InstallPhase,
  type OperationKind,
  type OperationPlan,
  type OperationView,
} from '../../shared/install-state';
import { installerArguments, installTarget, isSafeInstallerName } from '../../shared/installer-args';
import { updateAvailable, type InstalledApp, type InstalledView } from '../../shared/installed-view';
import { SpeedMeter } from '../../shared/progress';
import { isRunning } from '../../shared/tasklist';
import { uninstallCommand, type CommandLine } from '../../shared/uninstall-command';
import { DownloadError, type Downloader } from '../net/download';
import { NetError } from '../net/http';
import type { InstallerResult, InstallerRunner } from './installer-runner';

/**
 * Installs, updates, repairs and uninstalls Nebula apps (brief §7.2–7.7), one operation at a
 * time, through the state machine of `shared/install-state.ts`.
 *
 * Install, update, repair:
 * 1. download to `<downloads>\<installer>.part` (resumed when possible), never beyond the size of
 *    latest.yml (R05 on every hop), verify size + SHA-512 (R02), then rename;
 * 2. if the app is running, wait for it to close: the Hub only sends one polite close request,
 *    and only when the user asks (R08) — a silent NSIS installer would kill it (ADR-004). Once it
 *    is closed, read the version again: the app's own updater may have done the job;
 * 3. for an app that declares it (Finterest), let the app write its backup and check the file
 *    (§7.6); a failed backup blocks until the user confirms a second time or cancels (R04);
 * 4. run the installer with the ADR-004 arguments (`/S`, or `--updated /S` for an update or a
 *    repair, never `--delete-app-data`), then let the registry say what is installed.
 *
 * Uninstall: wait for the app to close, backup as above, run the registry's quiet uninstall
 * command (validated, no shell), then wait for the registry key to disappear (the NSIS
 * uninstaller returns at once).
 */
export interface InstalledRecordLike extends InstalledApp {
  exePath: string;
  entry: { uninstallString: string | null; quietUninstallString: string | null };
}

export interface InstallManagerDeps {
  entry(appId: string): CatalogEntry | undefined;
  installedView(): InstalledView;
  /** Registry details kept in the main process (uninstall command, executable). */
  record(appId: string): InstalledRecordLike | undefined;
  detect(): Promise<InstalledView>;
  runningProcesses(): Promise<Set<string>>;
  /** One polite close request (no force), sent only after the user asked for it (R08). */
  requestClose(exeName: string): Promise<void>;
  /**
   * ADR-037: an extension the Hub itself keeps running in the background (no window, not shown
   * inside the Hub) may be stopped for its automatic update; the Hub starts it again afterwards.
   */
  mayStopForUpdate?(appId: string): boolean;
  /** Stops that background instance; resolves once it has exited (false if it did not). */
  stopForUpdate?(appId: string): Promise<boolean>;
  download: Downloader;
  verify(filePath: string, size: number, sha512: string): Promise<void>;
  runner: InstallerRunner;
  history: { add(entry: Omit<HistoryEntry, 'id'>): Promise<void>; list(): HistoryEntry[] };
  downloadsDir: string;
  /** The user's Documents folder (backups go into `<Documents>\<app folder>`). */
  documentsDir: string;
  env: Record<string, string | undefined>;
  /** Base folder chosen in the settings, or null for each installer's default. */
  installDirectory(): string | null;
  /** Folder that receives a second copy of every backup (ADR-026), or null. */
  backupCopyDirectory?(): string | null;
  now?: () => Date;
  installerTimeoutMs?: number;
  backupTimeoutMs?: number;
  uninstallTimeoutMs?: number;
  appExitPollMs?: number;
  /** Pause between registry checks after an installer or uninstaller. */
  registryPollMs?: number;
  progressIntervalMs?: number;
}

interface Operation {
  view: OperationView;
  entry: CatalogEntry;
  controller: AbortController;
  meter: SpeedMeter;
  startedAt: string;
  lastEmit: number;
  started: boolean;
  /** Resolves the wait in `backup-failed`: true = continue without backup (second confirmation). */
  decide: ((proceed: boolean) => void) | null;
}

class Cancelled extends Error {}

class Failure extends Error {
  constructor(readonly reason: FailureReason, readonly detail: string | null = null) {
    super(reason);
  }
}

/** Finished operations kept in the queue view until dismissed. */
const KEEP_FINISHED = 10;
/** How long a backup path shown on a confirmation screen stays the one used. */
const PLAN_TTL_MS = 15 * 60_000;

export class InstallManager {
  private operations: Operation[] = [];
  private current: Operation | null = null;
  private readonly listeners = new Set<(view: DownloadsView) => void>();
  private readonly plans = new Map<string, { path: string; at: number }>();
  /** `appId@version` of automatic updates that failed: not retried automatically this session. */
  private readonly autoFailed = new Set<string>();
  private counter = 0;

  constructor(private readonly deps: InstallManagerDeps) {}

  getView(): DownloadsView {
    return { operations: this.operations.map((operation) => ({ ...operation.view, backup: operation.view.backup ? { ...operation.view.backup } : null })), history: this.deps.history.list() };
  }

  onChange(listener: (view: DownloadsView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * True while an operation is queued or running: for one app (nothing should launch it meanwhile),
   * or for any (the Hub must not update itself then).
   */
  isBusy(appId?: string): boolean {
    return this.operations.some((operation) => (!appId || operation.view.appId === appId) && isActive(operation.view.phase));
  }

  /** Empties the downloads folder (startup): leftovers of a previous session are not trusted. */
  async cleanup(): Promise<void> {
    await fs.rm(this.deps.downloadsDir, { recursive: true, force: true }).catch(() => undefined);
  }

  private installed(appId: string): InstalledApp | undefined {
    return this.deps.installedView().apps.find((app) => app.appId === appId);
  }

  private command(appId: string): CommandLine | null {
    const record = this.deps.record(appId);
    return record ? uninstallCommand(record.entry, record.location, this.deps.env) : null;
  }

  /** Why this operation cannot run now, or null. Shared by `plan` and `enqueue`. */
  private blocker(appId: string, kind: OperationKind): Exclude<EnqueueResult, 'queued' | 'confirmation-required'> | null {
    const entry = this.deps.entry(appId);
    if (!entry) return 'unknown-app';
    if (entry.app.role === 'hub') return 'is-hub';
    if (this.operations.some((operation) => operation.view.appId === appId && isActive(operation.view.phase))) return 'already-queued';
    const installed = this.installed(appId);
    if (kind === 'uninstall') {
      if (!installed) return 'not-installed';
      return this.command(appId) ? null : 'no-uninstaller';
    }
    if (kind === 'install' && installed) return 'already-installed';
    if (kind !== 'install' && !installed) return 'not-installed';
    if (kind === 'update' && !updateAvailable(entry, installed)) return 'no-update';
    if (entry.requiresNewerHub) return 'requires-newer-hub';
    const installer = entry.release?.installer;
    if (!installer || !isSafeInstallerName(installer.fileName)) return 'no-installer';
    // A repair reinstalls the installed version; when the release is another version, it is an update.
    if (kind === 'repair' && installed!.version !== entry.release!.version) return 'repair-unavailable';
    return null;
  }

  /** What the confirmation screen shows (R04): versions, backup file, whether the app is open. */
  plan(appId: string, kind: OperationKind): OperationPlan {
    const entry = this.deps.entry(appId);
    const installed = this.installed(appId);
    const blocked = this.blocker(appId, kind);
    const backup = entry?.app.windows.preOperationBackup;
    let planned: string | null = null;
    if (!blocked && backup && kind !== 'install') {
      planned = backupPath(this.deps.documentsDir, backup, this.now());
      this.plans.set(`${appId}:${kind}`, { path: planned, at: this.now().getTime() });
    }
    return {
      appId,
      kind,
      version: kind === 'uninstall' ? null : entry?.release?.version ?? null,
      fromVersion: installed?.version ?? null,
      needsConfirmation: needsConfirmation(kind, entry),
      backupPath: planned,
      backupCopyPath: planned && backup ? this.copyPathOf(backup, planned) : null,
      running: Boolean(installed?.running),
      blocked,
    };
  }

  /**
   * `skipBackup` (ADR-026): the user unticked "back up first" on the confirmation screen, which
   * said what happens to the data. Only honoured with that confirmation, never for automatic updates.
   */
  enqueue(appId: string, kind: OperationKind = 'install', options: { confirmed?: boolean; auto?: boolean; skipBackup?: boolean } = {}): EnqueueResult {
    const blocked = this.blocker(appId, kind);
    if (blocked) return blocked;
    const entry = this.deps.entry(appId)!;
    if (needsConfirmation(kind, entry) && !options.confirmed) return 'confirmation-required';
    const installed = this.installed(appId);

    // A new attempt replaces the previous finished one for this app.
    this.operations = this.operations.filter((operation) => operation.view.appId !== appId);
    this.counter += 1;
    const now = this.now();
    const resting = restingPhase(entry, installed);
    const first: InstallPhase = kind === 'repair' ? 'repairing' : kind === 'uninstall' ? 'uninstalling' : 'queued';
    const backup = entry.app.windows.preOperationBackup;
    const plan = this.plans.get(`${appId}:${kind}`);
    const plannedPath = plan && now.getTime() - plan.at < PLAN_TTL_MS ? plan.path : null;
    this.plans.delete(`${appId}:${kind}`);
    const installer = entry.release?.installer;
    const operation: Operation = {
      view: {
        id: `${now.getTime().toString(36)}-${this.counter}`,
        appId,
        kind,
        version: kind === 'uninstall' ? installed?.version ?? '?' : entry.release!.version,
        fromVersion: installed?.version ?? null,
        phase: transition(kind === 'install' ? 'absent' : resting, first),
        failure: null,
        failureDetail: null,
        received: 0,
        total: kind === 'uninstall' ? 0 : installer?.size ?? 0,
        bytesPerSecond: null,
        etaSeconds: null,
        resumed: false,
        backup: backup && kind !== 'install'
          ? { path: plannedPath ?? backupPath(this.deps.documentsDir, backup, now), state: options.skipBackup && options.confirmed && !options.auto ? 'declined' : 'pending', accounts: null, problem: null, copyPath: null, copyState: null }
          : null,
        auto: Boolean(options.auto),
        closeRequested: false,
        queuedAt: now.toISOString(),
        finishedAt: null,
      },
      entry,
      controller: new AbortController(),
      meter: new SpeedMeter(),
      startedAt: now.toISOString(),
      lastEmit: 0,
      started: false,
      decide: null,
    };
    this.operations.push(operation);
    this.trimFinished();
    this.emit();
    this.pump();
    return 'queued';
  }

  /** Cancels an operation that has not reached the installer or uninstaller yet. */
  cancel(operationId: string): boolean {
    const operation = this.find(operationId);
    if (!operation || !isCancellable(operation.view.phase)) return false;
    operation.controller.abort();
    operation.decide?.(false);
    if (!operation.started) {
      // Still waiting in the queue: nothing to stop.
      void this.finishCancelled(operation);
    }
    return true;
  }

  /** R08: the user asked the Hub to close the app it is waiting for — one polite request. */
  requestClose(operationId: string): boolean {
    const operation = this.find(operationId);
    if (!operation || operation.view.phase !== 'waiting-for-app-exit' || operation.view.closeRequested) return false;
    operation.view.closeRequested = true;
    void this.deps.requestClose(operation.entry.app.windows.exeName).catch(() => undefined);
    this.emit();
    return true;
  }

  /** R04: second confirmation after a failed backup — go on without it. */
  continueWithoutBackup(operationId: string): boolean {
    const operation = this.find(operationId);
    if (!operation || operation.view.phase !== 'backup-failed' || !operation.decide) return false;
    operation.decide(true);
    return true;
  }

  /** Removes a finished operation from the queue view (it stays in the history). */
  dismiss(operationId: string): boolean {
    const operation = this.find(operationId);
    if (!operation || isActive(operation.view.phase)) return false;
    this.operations = this.operations.filter((candidate) => candidate !== operation);
    this.emit();
    return true;
  }

  /**
   * Automatic updates (brief §7.5): apps the user opted in, with an update, closed, and idle.
   * Never waits for the user: an open app or a failed backup ends the attempt (next check retries).
   * An extension running only in the background counts as closed (ADR-037): the Hub stops it.
   */
  autoUpdate(optedIn: (appId: string) => boolean): string[] {
    const queued: string[] = [];
    for (const app of this.deps.installedView().apps) {
      const version = this.deps.entry(app.appId)?.release?.version;
      if (!optedIn(app.appId) || this.autoFailed.has(`${app.appId}@${version}`)) continue;
      if (app.running && !this.deps.mayStopForUpdate?.(app.appId)) continue;
      if (this.enqueue(app.appId, 'update', { confirmed: true, auto: true }) === 'queued') queued.push(app.appId);
    }
    return queued;
  }

  /** Resolves when nothing is pending or running (tests, quitting). */
  async idle(): Promise<void> {
    while (this.current || this.operations.some((operation) => !operation.started && PENDING_PHASES.includes(operation.view.phase))) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private find(operationId: string): Operation | undefined {
    return this.operations.find((candidate) => candidate.view.id === operationId);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private pump(): void {
    if (this.current) return;
    const next = this.operations.find((operation) => !operation.started && PENDING_PHASES.includes(operation.view.phase));
    if (!next) return;
    this.current = next;
    next.started = true;
    void this.run(next).finally(() => {
      this.current = null;
      this.pump();
    });
  }

  private move(operation: Operation, phase: InstallPhase): void {
    operation.view.phase = transition(operation.view.phase, phase);
    if (phase !== 'downloading') {
      operation.view.bytesPerSecond = null;
      operation.view.etaSeconds = null;
    }
    this.emit();
  }

  private progress(operation: Operation, received: number, total: number): void {
    const at = this.now().getTime();
    operation.view.received = received;
    operation.view.total = total;
    operation.meter.sample(received, at);
    operation.view.bytesPerSecond = operation.meter.bytesPerSecond();
    operation.view.etaSeconds = operation.meter.etaSeconds(total);
    if (received === total || at - operation.lastEmit >= (this.deps.progressIntervalMs ?? 250)) {
      operation.lastEmit = at;
      this.emit();
    }
  }

  private checkCancelled(operation: Operation): void {
    if (operation.controller.signal.aborted) throw new Cancelled();
  }

  private sleep(operation: Operation, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      operation.controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  private async run(operation: Operation): Promise<void> {
    if (operation.view.phase === 'cancelled') return;
    const installer = operation.entry.release?.installer;
    const file = installer ? path.join(this.deps.downloadsDir, installer.fileName) : null;
    try {
      if (operation.view.kind === 'uninstall') {
        await this.uninstall(operation);
      } else {
        await this.install(operation, file!);
      }
    } catch (error) {
      if (error instanceof Cancelled || (error instanceof DownloadError && error.code === 'cancelled') || operation.controller.signal.aborted) {
        if (isCancellable(operation.view.phase)) {
          if (file) {
            await fs.rm(`${file}.part`, { force: true }).catch(() => undefined);
            await fs.rm(file, { force: true }).catch(() => undefined);
          }
          await this.finishCancelled(operation);
          return;
        }
      }
      const { reason, detail } = error instanceof Failure ? { reason: error.reason, detail: error.detail } : failureOf(error);
      await this.fail(operation, reason, detail);
    }
  }

  private async install(operation: Operation, file: string): Promise<void> {
    const { entry } = operation;
    const installer = entry.release!.installer!;
    const part = `${file}.part`;
    if (operation.view.phase === 'repairing') this.move(operation, 'queued');

    await fs.mkdir(this.deps.downloadsDir, { recursive: true });
    // An installer verified earlier in this session (failed install): verify it again.
    await fs.rename(file, part).catch(() => undefined);
    this.move(operation, 'downloading');
    const outcome = await this.deps.download(installer.url, part, {
      expectedSize: installer.size,
      signal: operation.controller.signal,
      onProgress: (received, total) => this.progress(operation, received, total),
    });
    operation.view.resumed = outcome.resumed;
    this.checkCancelled(operation);

    this.move(operation, 'verifying');
    await this.deps.verify(part, installer.size, installer.sha512);
    this.checkCancelled(operation);
    await fs.rename(part, file);
    this.move(operation, 'ready');

    if (operation.view.auto && (await this.appIsRunning(operation))) {
      // ADR-037: only an extension running in the background is stopped, never an app in use.
      const appId = operation.entry.app.id;
      const stopped = Boolean(this.deps.mayStopForUpdate?.(appId)) && (await this.deps.stopForUpdate?.(appId).catch(() => false));
      if (!stopped || (await this.appIsRunning(operation))) throw new Failure('app-running');
    }
    if (await this.appIsRunning(operation)) {
      this.move(operation, 'waiting-for-app-exit');
      await this.waitForAppExit(operation);
      // ADR-004: once the app is closed, its own updater may have installed the update already.
      if (operation.view.kind === 'update') {
        const app = (await this.deps.detect()).apps.find((candidate) => candidate.appId === entry.app.id);
        if (app?.exeFound && app.version === operation.view.version) {
          this.move(operation, 'verifying-install');
          await this.succeed(operation, file, 'self-updated');
          return;
        }
      }
    }
    this.checkCancelled(operation);

    if (operation.view.backup && operation.view.backup.state !== 'declined') await this.backUp(operation);

    const base = this.deps.installDirectory();
    const target = operation.view.kind === 'install' && base ? installTarget(base, entry.app.windows.productName) : null;
    const args = installerArguments(operation.view.kind, entry.app.windows.silentArgs, target);
    this.move(operation, 'installing');
    let result: InstallerResult | { kind: 'error'; code: string };
    try {
      result = await this.deps.runner.run(file, args, this.deps.installerTimeoutMs ?? 10 * 60_000);
    } catch (error) {
      result = { kind: 'error', code: (error as NodeJS.ErrnoException).code ?? 'spawn' };
    }

    // ADR-004: whatever the installer said, the registry tells what is installed now. After an
    // update or a repair, give the registry a few moments (the old uninstaller runs first).
    this.move(operation, 'verifying-install');
    const attempts = operation.view.kind === 'install' ? 1 : 5;
    let app: InstalledApp | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, this.deps.registryPollMs ?? 3000));
      app = (await this.deps.detect()).apps.find((candidate) => candidate.appId === entry.app.id);
      if (app?.exeFound && app.version === operation.view.version) {
        await this.succeed(operation, file, null);
        return;
      }
    }
    if (result.kind === 'timeout') throw new Failure('installer-timeout');
    if (result.kind === 'error') throw new Failure('installer-exit', result.code);
    if (result.code !== 0) throw new Failure('installer-exit', String(result.code));
    if (!app || !app.exeFound) throw new Failure('not-detected');
    throw new Failure('version-mismatch', app.version);
  }

  private async uninstall(operation: Operation): Promise<void> {
    const appId = operation.view.appId;
    // Re-read and re-validate at the last moment: never run a command checked earlier.
    const command = this.command(appId);
    if (!command) throw new Failure('no-uninstaller');

    if (await this.appIsRunning(operation)) {
      this.move(operation, 'waiting-for-app-exit');
      await this.waitForAppExit(operation);
    }
    this.checkCancelled(operation);
    if (operation.view.backup && operation.view.backup.state !== 'declined') await this.backUp(operation);

    this.move(operation, 'removing');
    try {
      await this.deps.runner.run(command.executable, command.args, this.deps.installerTimeoutMs ?? 10 * 60_000);
    } catch (error) {
      throw new Failure('installer-exit', (error as NodeJS.ErrnoException).code ?? 'spawn');
    }
    // An NSIS uninstaller copies itself and returns at once: the registry says when it is done.
    const deadline = this.now().getTime() + (this.deps.uninstallTimeoutMs ?? 3 * 60_000);
    for (;;) {
      const view = await this.deps.detect();
      if (!view.apps.some((candidate) => candidate.appId === appId)) {
        this.move(operation, 'absent');
        await this.record(operation, 'success');
        return;
      }
      if (this.now().getTime() > deadline) throw new Failure('uninstall-timeout');
      await new Promise((resolve) => setTimeout(resolve, this.deps.registryPollMs ?? 1500));
    }
  }

  /**
   * Brief §7.6: the app writes its own backup, the Hub checks the file. A failed backup blocks the
   * operation until the user confirms a second time (`continueWithoutBackup`) or cancels.
   */
  private async backUp(operation: Operation): Promise<void> {
    const backup = operation.view.backup!;
    this.move(operation, 'backing-up');
    backup.state = 'running';
    this.emit();
    const problem = await this.runBackup(operation.entry, operation.view.appId, backup.path);
    this.checkCancelled(operation);
    if (!problem.ok) {
      backup.state = 'failed';
      backup.problem = problem.reason;
      if (operation.view.auto) throw new Failure('backup-failed', problem.reason);
      this.move(operation, 'backup-failed');
      const proceed = await new Promise<boolean>((resolve) => {
        operation.decide = resolve;
      });
      operation.decide = null;
      this.checkCancelled(operation);
      if (!proceed) throw new Cancelled();
      backup.state = 'skipped';
      this.emit();
      return;
    }
    backup.state = 'ok';
    backup.accounts = problem.accounts;
    const copy = await this.copyBackup(operation.entry, backup.path);
    backup.copyPath = copy.path;
    backup.copyState = copy.state;
    this.emit();
  }

  /** `<copy folder>\<app folder>\<file>` for a backup written at `file`, when a copy folder is set. */
  private copyPathOf(spec: NonNullable<CatalogEntry['app']['windows']['preOperationBackup']>, file: string): string | null {
    const dir = this.deps.backupCopyDirectory?.() ?? null;
    return dir ? backupCopyPath(dir, spec, file) : null;
  }

  /**
   * ADR-026: the backup stays in Documents (the reference the app reads first); a second copy goes
   * to the folder chosen in the settings. A failed copy never blocks anything: it is reported.
   */
  private async copyBackup(entry: CatalogEntry, file: string): Promise<{ path: string | null; state: 'ok' | 'failed' | null }> {
    const target = this.copyPathOf(entry.app.windows.preOperationBackup!, file);
    // The copy folder chosen is Documents itself: the file is already there.
    if (!target || path.resolve(target).toLowerCase() === path.resolve(file).toLowerCase()) return { path: null, state: null };
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(file, target);
      return { path: target, state: 'ok' };
    } catch {
      return { path: target, state: 'failed' };
    }
  }

  /**
   * "Export my data" (ADR-026): the app writes a backup now, outside of any operation, in the same
   * root folder, with the same check and the same optional copy. Refused while an operation runs
   * for this app.
   */
  async exportData(appId: string): Promise<ExportDataResult> {
    const entry = this.deps.entry(appId);
    const spec = entry?.app.windows.preOperationBackup;
    if (!entry || !spec) return { ok: false, reason: 'unsupported' };
    if (!this.deps.record(appId)?.exeFound) return { ok: false, reason: 'not-installed' };
    if (this.operations.some((operation) => operation.view.appId === appId && isActive(operation.view.phase))) return { ok: false, reason: 'busy' };
    const file = backupPath(this.deps.documentsDir, spec, this.now());
    await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => undefined);
    const result = await this.runBackup(entry, appId, file);
    if (!result.ok) return result;
    const copy = await this.copyBackup(entry, file);
    return { ok: true, path: file, accounts: result.accounts, copyPath: copy.path, copyState: copy.state };
  }

  private async runBackup(entry: CatalogEntry, appId: string, file: string | null): Promise<{ ok: true; accounts: number } | { ok: false; reason: BackupProblem }> {
    const spec = entry.app.windows.preOperationBackup!;
    const record = this.deps.record(appId);
    if (!file || !record?.exeFound) return { ok: false, reason: 'not-started' };
    // Never validate a stale file: the path is new, but make sure.
    await fs.rm(file, { force: true }).catch(() => undefined);
    try {
      const result = await this.deps.runner.run(record.exePath, [backupArgument(spec, file)], this.deps.backupTimeoutMs ?? 2 * 60_000);
      if (result.kind === 'timeout') return { ok: false, reason: 'timeout' };
    } catch {
      return { ok: false, reason: 'not-started' };
    }
    let size: number;
    try {
      size = (await fs.stat(file)).size;
    } catch {
      return { ok: false, reason: 'missing' };
    }
    if (size > MAX_BACKUP_BYTES) return { ok: false, reason: 'too-large' };
    return validateBackup(spec.format, await fs.readFile(file, 'utf8'));
  }

  private async appIsRunning(operation: Operation): Promise<boolean> {
    try {
      return isRunning(await this.deps.runningProcesses(), operation.entry.app.windows.exeName);
    } catch {
      return false;
    }
  }

  /** R08: the user closes the app (or asks the Hub to request it); the Hub only watches. */
  private async waitForAppExit(operation: Operation): Promise<void> {
    while (await this.appIsRunning(operation)) {
      this.checkCancelled(operation);
      await this.sleep(operation, this.deps.appExitPollMs ?? 1000);
      this.checkCancelled(operation);
    }
  }

  private async succeed(operation: Operation, file: string, detail: string | null): Promise<void> {
    await fs.rm(file, { force: true });
    operation.view.failureDetail = detail;
    this.move(operation, 'installed');
    await this.record(operation, 'success');
  }

  private async fail(operation: Operation, reason: FailureReason, detail: string | null = null): Promise<void> {
    operation.view.failure = reason;
    operation.view.failureDetail = detail;
    if (operation.view.auto) this.autoFailed.add(`${operation.view.appId}@${operation.view.version}`);
    this.move(operation, 'failed');
    await this.record(operation, 'failed');
    // A failed operation may still have changed what is on disk.
    void this.deps.detect().catch(() => undefined);
  }

  private async finishCancelled(operation: Operation): Promise<void> {
    if (operation.view.phase === 'cancelled') return;
    this.move(operation, 'cancelled');
    await this.record(operation, 'cancelled');
  }

  private async record(operation: Operation, outcome: HistoryEntry['outcome']): Promise<void> {
    operation.view.finishedAt = this.now().toISOString();
    try {
      await this.deps.history.add({
        appId: operation.view.appId,
        kind: operation.view.kind,
        version: operation.view.version,
        fromVersion: operation.view.fromVersion,
        outcome,
        failure: operation.view.failure,
        detail: operation.view.failureDetail,
        startedAt: operation.startedAt,
        finishedAt: operation.view.finishedAt,
      });
    } catch {
      // The history is a journal: losing a line never fails the operation itself.
    }
    this.emit();
  }

  private trimFinished(): void {
    const finished = this.operations.filter((operation) => !isActive(operation.view.phase));
    const extra = finished.length - KEEP_FINISHED;
    if (extra > 0) {
      const drop = new Set(finished.slice(0, extra));
      this.operations = this.operations.filter((operation) => !drop.has(operation));
    }
  }

  private emit(): void {
    const view = this.getView();
    for (const listener of this.listeners) listener(view);
  }
}

/** Turns any error of the pipeline into a reason the UI can explain. */
export function failureOf(error: unknown): { reason: FailureReason; detail: string | null } {
  if (error instanceof DownloadError) {
    return { reason: error.code === 'cancelled' ? 'internal' : error.code, detail: error.detail };
  }
  if (error instanceof NetError) {
    switch (error.code) {
      case 'ERR_NET_OFFLINE':
        return { reason: 'offline', detail: null };
      case 'ERR_NET_TIMEOUT':
        return { reason: 'timeout', detail: null };
      case 'ERR_NET_RATE_LIMITED':
        return { reason: 'rate-limited', detail: error.detail.resetAt ?? null };
      case 'ERR_NET_STATUS':
        return { reason: 'http', detail: error.detail.status ? String(error.detail.status) : null };
      case 'ERR_NET_TOO_LARGE':
        return { reason: 'size-mismatch', detail: null };
      default:
        return { reason: 'blocked', detail: null };
    }
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && ['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EBUSY'].includes(code)) {
    return { reason: 'disk', detail: code };
  }
  return { reason: 'internal', detail: null };
}
