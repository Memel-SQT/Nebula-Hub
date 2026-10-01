import { DEFAULT_NEBULA_APPEARANCE, parseNebulaAppearance, type NebulaAppearance } from '@nebula/design';
import { isSafeInstallDirectory } from './installer-args';

/** Release channel for app updates (brief §9.7). */
export type UpdateChannel = 'stable' | 'beta';

/** Everything persisted in `settings.json`. The appearance is the object Nebula Link broadcasts (I1). */
export interface HubSettings {
  appearance: NebulaAppearance;
  /** Closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean;
  /** Start with Windows, hidden in the tray. */
  launchAtLogin: boolean;
  channel: UpdateChannel;
  onboardingCompleted: boolean;
  /** Base folder for new installs (each app in its own subfolder); null = the installer's default. */
  installDirectory: string | null;
  /**
   * Apps updated automatically when a new release appears (brief §7.5), off by default. For an
   * app that backs up its data first, turning it on is confirmed once (R04).
   */
  autoUpdate: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: HubSettings = {
  appearance: DEFAULT_NEBULA_APPEARANCE,
  closeToTray: true,
  launchAtLogin: false,
  channel: 'stable',
  onboardingCompleted: false,
  installDirectory: null,
  autoUpdate: {},
};

export type SettingsPatch = Partial<Omit<HubSettings, 'appearance'>>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Field-by-field: an old, corrupt or hand-edited settings file never prevents startup, and a
 * bad value only resets itself (same contract as `parseAppearance` in Nebula Finterest).
 */
export function parseSettings(value: unknown, fallback: HubSettings = DEFAULT_SETTINGS): HubSettings {
  const record = asRecord(value);
  return {
    appearance: parseNebulaAppearance(record.appearance),
    closeToTray: bool(record.closeToTray, fallback.closeToTray),
    launchAtLogin: bool(record.launchAtLogin, fallback.launchAtLogin),
    channel: record.channel === 'beta' || record.channel === 'stable' ? record.channel : fallback.channel,
    onboardingCompleted: bool(record.onboardingCompleted, fallback.onboardingCompleted),
    installDirectory: record.installDirectory === null || isSafeInstallDirectory(record.installDirectory) ? (record.installDirectory as string | null) : fallback.installDirectory,
    autoUpdate: record.autoUpdate === undefined ? fallback.autoUpdate : parseAutoUpdate(record.autoUpdate),
  };
}

const APP_ID = /^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/;

/** Only catalog-like app ids with a true value are kept (at most 50). */
function parseAutoUpdate(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [appId, enabled] of Object.entries(asRecord(value)).slice(0, 50)) {
    if (APP_ID.test(appId) && enabled === true) result[appId] = true;
  }
  return result;
}

/** Applies a patch coming from the renderer: valid fields win, invalid ones keep the current value. */
export function mergeAppearance(current: NebulaAppearance, patch: unknown): NebulaAppearance {
  const changes = asRecord(patch);
  const candidate = parseNebulaAppearance({ ...current, ...changes });
  const result = { ...current };
  for (const key of Object.keys(current) as Array<keyof NebulaAppearance>) {
    if (key in changes && candidate[key] === changes[key]) {
      (result as Record<string, unknown>)[key] = candidate[key];
    }
  }
  return result;
}

/** Same rule for the other settings. */
export function mergeSettings(current: HubSettings, patch: unknown): HubSettings {
  const changes = asRecord(patch);
  const candidate = parseSettings({ ...current, ...changes }, current);
  return { ...candidate, appearance: current.appearance };
}
