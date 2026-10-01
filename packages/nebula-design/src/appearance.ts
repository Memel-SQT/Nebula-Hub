/**
 * Appearance preferences layered on top of the theme: accent colors, animated background,
 * motion level and sounds — plus, for the family-wide broadcast (Nebula Link I1), the theme
 * and the language.
 *
 * Ported from Nebula Finterest v0.1.36 `src/renderer/appearance.ts`: presets, `parseAppearance`,
 * `shade`, `rgba`, `luminance` and `accentVariables` are unchanged. Differences:
 * - presets carry no translation key (each app labels them as `accent.<id>`);
 * - the localStorage hook is replaced by pure functions (`applyAppearance`) because the Store
 *   persists appearance in settings.json, the source of the I1 broadcast;
 * - `NebulaAppearance` (+ `parseNebulaAppearance`) adds `theme` and `language`, which
 *   Finterest stores separately. Both parsers work field by field: any old, corrupt or
 *   hand-edited value falls back to its own default without breaking the others.
 * The old-* exclusion stays as a parameter (`frozenTheme`) so Finterest can keep its rule.
 */
import { DEFAULT_THEME, isGlassTheme, isLightTheme, isTheme, type ResolvedTheme, type Theme } from './theme';

export type BackgroundEffect = 'glow' | 'aurora' | 'stars' | 'particles' | 'waves' | 'none';
export type MotionLevel = 'full' | 'reduced' | 'off';
export type AccentPresetId = 'nebula' | 'aurora' | 'sunset' | 'ocean' | 'sakura' | 'ember' | 'custom';
export type Language = 'fr' | 'en';

export interface AccentPreset {
  id: Exclude<AccentPresetId, 'custom'>;
  /** Main accent (buttons, active states); end of the accent gradient. */
  primary: string;
  /** Start of the accent gradient and the second ambient glow. */
  secondary: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'nebula', primary: '#8b5cf6', secondary: '#4c6ef5' },
  { id: 'aurora', primary: '#10b981', secondary: '#06b6d4' },
  { id: 'ocean', primary: '#0ea5e9', secondary: '#6366f1' },
  { id: 'sunset', primary: '#ec4899', secondary: '#f97316' },
  { id: 'sakura', primary: '#f472b6', secondary: '#a78bfa' },
  { id: 'ember', primary: '#f59e0b', secondary: '#ef4444' },
];

export interface Appearance {
  accentPreset: AccentPresetId;
  customPrimary: string;
  customSecondary: string;
  background: BackgroundEffect;
  motion: MotionLevel;
  soundEnabled: boolean;
  /** 0-100. */
  soundVolume: number;
}

/** Exactly the object broadcast by `nebula.appearance.changed` (brief §10.4). */
export interface NebulaAppearance extends Appearance {
  theme: Theme;
  language: Language;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accentPreset: 'nebula',
  customPrimary: '#8b5cf6',
  customSecondary: '#4c6ef5',
  background: 'glow',
  motion: 'full',
  soundEnabled: true,
  soundVolume: 45,
};

export const DEFAULT_LANGUAGE: Language = 'fr';

export const DEFAULT_NEBULA_APPEARANCE: NebulaAppearance = {
  theme: DEFAULT_THEME,
  ...DEFAULT_APPEARANCE,
  language: DEFAULT_LANGUAGE,
};

export const BACKGROUNDS: readonly BackgroundEffect[] = ['glow', 'aurora', 'stars', 'particles', 'waves', 'none'];
export const MOTIONS: readonly MotionLevel[] = ['full', 'reduced', 'off'];
export const LANGUAGES: readonly Language[] = ['fr', 'en'];
const PRESET_IDS: AccentPresetId[] = [...ACCENT_PRESETS.map((preset) => preset.id), 'custom'];
const HEX = /^#[0-9a-f]{6}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Field-by-field normalization of anything (parsed JSON, an IPC payload, a Link message). */
export function normalizeAppearance(value: unknown): Appearance {
  const parsed = asRecord(value);
  const volume = Number(parsed.soundVolume);
  return {
    accentPreset: PRESET_IDS.includes(parsed.accentPreset as AccentPresetId) ? (parsed.accentPreset as AccentPresetId) : DEFAULT_APPEARANCE.accentPreset,
    customPrimary: HEX.test(String(parsed.customPrimary)) ? String(parsed.customPrimary) : DEFAULT_APPEARANCE.customPrimary,
    customSecondary: HEX.test(String(parsed.customSecondary)) ? String(parsed.customSecondary) : DEFAULT_APPEARANCE.customSecondary,
    background: BACKGROUNDS.includes(parsed.background as BackgroundEffect) ? (parsed.background as BackgroundEffect) : DEFAULT_APPEARANCE.background,
    motion: MOTIONS.includes(parsed.motion as MotionLevel) ? (parsed.motion as MotionLevel) : DEFAULT_APPEARANCE.motion,
    soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_APPEARANCE.soundEnabled,
    // `Number(null)` is 0: a missing volume must fall back to the default, not mute the app.
    soundVolume: parsed.soundVolume !== null && parsed.soundVolume !== '' && Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : DEFAULT_APPEARANCE.soundVolume,
  };
}

/** Tolerates anything in storage (older versions, hand edits): each field falls back to its default on its own. */
export function parseAppearance(raw: string | null): Appearance {
  try {
    return normalizeAppearance(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeAppearance({});
  }
}

/** Same contract as `normalizeAppearance`, for the full broadcast object. */
export function parseNebulaAppearance(value: unknown): NebulaAppearance {
  const parsed = asRecord(value);
  return {
    theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_THEME,
    ...normalizeAppearance(parsed),
    language: LANGUAGES.includes(parsed.language as Language) ? (parsed.language as Language) : DEFAULT_LANGUAGE,
  };
}

export function accentColors(appearance: Appearance): { primary: string; secondary: string } {
  if (appearance.accentPreset === 'custom') {
    return { primary: appearance.customPrimary, secondary: appearance.customSecondary };
  }
  const preset = ACCENT_PRESETS.find((candidate) => candidate.id === appearance.accentPreset) ?? ACCENT_PRESETS[0];
  return { primary: preset.primary, secondary: preset.secondary };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const weight = Math.abs(amount);
  return rgbToHex(hexToRgb(hex).map((channel) => channel + (target - channel) * weight) as [number, number, number]);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const ACCENT_VARIABLES = [
  '--accent', '--accent-hover', '--accent-soft', '--accent-glow', '--on-accent',
  '--gold', '--gold-bright', '--gold-soft', '--focus-ring', '--glow-1', '--glow-2',
] as const;

export type AccentVariable = (typeof ACCENT_VARIABLES)[number];

/**
 * CSS variables for a custom accent, tuned per theme family: light themes get darker tones
 * so text on accent stays readable, glass themes get stronger glows since the translucent
 * surfaces let them through.
 */
export function accentVariables(primary: string, secondary: string, theme: ResolvedTheme): Record<AccentVariable, string> {
  const light = isLightTheme(theme);
  const glass = isGlassTheme(theme);
  const accent = light ? shade(primary, -0.18) : primary;
  const gold = light ? shade(secondary, -0.15) : secondary;
  const glowAlpha = glass ? (light ? 0.3 : 0.38) : light ? 0.1 : 0.16;
  const onAccent = luminance(accent) > 0.55 && luminance(gold) > 0.45 ? '#16151f' : '#ffffff';
  return {
    '--accent': accent,
    '--accent-hover': light ? shade(primary, -0.3) : shade(primary, 0.18),
    '--accent-soft': rgba(accent, light ? 0.1 : 0.16),
    '--accent-glow': rgba(accent, light ? 0.16 : 0.24),
    '--on-accent': onAccent,
    '--gold': gold,
    '--gold-bright': light ? shade(secondary, -0.25) : shade(secondary, 0.1),
    '--gold-soft': rgba(gold, light ? 0.1 : 0.18),
    '--focus-ring': rgba(primary, light ? 0.5 : 0.6),
    '--glow-1': rgba(secondary, glowAlpha),
    '--glow-2': rgba(primary, glowAlpha * 0.9),
  };
}

/**
 * Writes the appearance onto `<html>`: `data-motion`, `data-background` and, unless the
 * default Nebula accent is chosen (the theme blocks already carry it), the 11 accent variables
 * as inline properties. `frozenTheme` lets an app exempt themes from accents (Finterest's old-*).
 */
export function applyAppearance(root: HTMLElement, appearance: Appearance, theme: ResolvedTheme, frozenTheme = false): void {
  root.dataset.motion = appearance.motion;
  root.dataset.background = appearance.background;
  const { primary, secondary } = accentColors(appearance);
  const variables = !frozenTheme && appearance.accentPreset !== 'nebula' ? accentVariables(primary, secondary, theme) : null;
  for (const name of ACCENT_VARIABLES) {
    if (variables) {
      root.style.setProperty(name, variables[name]);
    } else {
      root.style.removeProperty(name);
    }
  }
}
