import { DEFAULT_NEBULA_APPEARANCE, parseNebulaAppearance, type NebulaAppearance } from '@nebula/design';

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
}

export const DEFAULT_SETTINGS: HubSettings = {
  appearance: DEFAULT_NEBULA_APPEARANCE,
  closeToTray: true,
  launchAtLogin: false,
  channel: 'stable',
  onboardingCompleted: false,
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
  };
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
