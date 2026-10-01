import path from 'node:path';
import type { CatalogApp } from '../../shared/catalog';
import { findEntry, installedVersion, installLocation, uninstallEntries, type UninstallEntry } from '../../shared/detection';
import { EMPTY_INSTALLED_VIEW, scopeOf, type InstalledApp, type InstalledView, type LaunchResult } from '../../shared/installed-view';
import { expandEnvironment, parseRegFile, regString } from '../../shared/reg-file';
import { isRunning } from '../../shared/tasklist';
import type { SystemProbe } from './system-probe';

/**
 * Installed Nebula apps (brief §7.1): registry (HKCU first, then HKLM in both views), the
 * executable on disk, and the process list. Detection runs at startup, after every operation,
 * and when the window comes back to the foreground (debounced); runs never overlap.
 *
 * What the renderer gets is deliberately small (`InstalledView`); the registry details needed
 * later for update and uninstall (M4–M5) stay here, in the main process.
 */
export const UNINSTALL_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

export interface InstalledRecord extends InstalledApp {
  entry: UninstallEntry;
  exePath: string;
}

export interface InstalledAppsDeps {
  probe: SystemProbe;
  apps: () => CatalogApp[];
  env: Record<string, string | undefined>;
  now?: () => Date;
  debounceMs?: number;
}

export class InstalledAppsService {
  private view: InstalledView = EMPTY_INSTALLED_VIEW;
  private records = new Map<string, InstalledRecord>();
  private readonly listeners = new Set<(view: InstalledView) => void>();
  private running: Promise<InstalledView> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: InstalledAppsDeps) {}

  getView(): InstalledView {
    return this.view;
  }

  record(appId: string): InstalledRecord | undefined {
    return this.records.get(appId);
  }

  onChange(listener: (view: InstalledView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Debounced detection (window focus, catalog change, after a launch). */
  requestDetect(delay = this.deps.debounceMs ?? 1500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.detect();
    }, delay);
  }

  /** Runs a detection; a call during a run schedules exactly one more after it. */
  detect(): Promise<InstalledView> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runDetection().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.detect();
      }
    });
    return this.running;
  }

  private async runDetection(): Promise<InstalledView> {
    try {
      const { probe } = this.deps;
      const trees = await Promise.all(UNINSTALL_KEYS.map((key) => probe.exportRegistry(key)));
      const entries = trees.flatMap((text) => (text ? uninstallEntries(parseRegFile(text)) : []));
      const processes = await probe.runningProcesses();
      const records = new Map<string, InstalledRecord>();

      for (const app of this.deps.apps()) {
        const entry = findEntry(app, entries);
        if (!entry) continue;
        const installKey = await probe.exportRegistry(`${entry.hive}\\Software\\${entry.keyName}`);
        const fromKey = installKey ? parseRegFile(installKey).map((key) => regString(key, 'InstallLocation')).find(Boolean) ?? null : null;
        const rawLocation = installLocation(entry, fromKey);
        if (!rawLocation) continue;
        const location = expandEnvironment(rawLocation, this.deps.env);
        const exePath = path.win32.join(location, app.windows.exeName);
        records.set(app.id, {
          appId: app.id,
          version: installedVersion(entry),
          scope: scopeOf(entry.hive),
          location,
          exeFound: path.win32.isAbsolute(location) && (await probe.fileExists(exePath)),
          running: isRunning(processes, app.windows.exeName),
          entry,
          exePath,
        });
      }

      this.records = records;
      this.publish({
        state: 'ready',
        apps: [...records.values()].map(({ appId, version, scope, location, exeFound, running }) => ({ appId, version, scope, location, exeFound, running })),
        detectedAt: (this.deps.now?.() ?? new Date()).toISOString(),
      });
    } catch {
      this.publish({ ...this.view, state: 'error' });
    }
    return this.view;
  }

  private publish(view: InstalledView): void {
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }

  /**
   * Starts an installed app (brief §7.8): only the catalog's `exeName` inside the registered
   * install folder, after checking it exists. The Hub never launches itself.
   */
  async launch(appId: string): Promise<LaunchResult> {
    const app = this.deps.apps().find((candidate) => candidate.id === appId);
    if (app?.role === 'hub') return 'is-hub';
    const record = this.records.get(appId);
    if (!app || !record) return 'not-installed';
    const exePath = path.win32.join(record.location, app.windows.exeName);
    const inside = path.win32.dirname(exePath).toLowerCase() === record.location.replace(/[\\/]+$/, '').toLowerCase();
    if (!path.win32.isAbsolute(record.location) || !inside || !(await this.deps.probe.fileExists(exePath))) {
      return 'missing-exe';
    }
    try {
      await this.deps.probe.start(exePath, record.location);
    } catch {
      return 'failed';
    }
    // Let the app appear in the process list before showing it as running.
    this.requestDetect(2500);
    return 'launched';
  }
}
