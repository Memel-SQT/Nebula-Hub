// The first four cases are ported verbatim from Nebula Finterest v0.1.36 `appearance.test.ts`.
import {
  accentVariables,
  applyAppearance,
  DEFAULT_APPEARANCE,
  DEFAULT_NEBULA_APPEARANCE,
  normalizeAppearance,
  parseAppearance,
  parseNebulaAppearance,
  shade,
} from './appearance';

describe('parseAppearance', () => {
  it('falls back to defaults for missing or corrupted storage', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{not json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('"a string"')).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid fields and repairs invalid ones independently', () => {
    const parsed = parseAppearance(JSON.stringify({ background: 'stars', motion: 'warp', customPrimary: 'red', soundVolume: 250, soundEnabled: false }));
    expect(parsed.background).toBe('stars');
    expect(parsed.motion).toBe(DEFAULT_APPEARANCE.motion);
    expect(parsed.customPrimary).toBe(DEFAULT_APPEARANCE.customPrimary);
    expect(parsed.soundVolume).toBe(100);
    expect(parsed.soundEnabled).toBe(false);
  });
});

describe('accentVariables', () => {
  it('darkens the accent on light themes so text on it stays readable', () => {
    expect(accentVariables('#10b981', '#06b6d4', 'nebula-dark')['--accent']).toBe('#10b981');
    expect(accentVariables('#10b981', '#06b6d4', 'nebula-light')['--accent']).toBe(shade('#10b981', -0.18));
  });

  it('switches to dark text on very light accents', () => {
    expect(accentVariables('#fde68a', '#fef3c7', 'nebula-dark')['--on-accent']).toBe('#16151f');
    expect(accentVariables('#8b5cf6', '#4c6ef5', 'nebula-dark')['--on-accent']).toBe('#ffffff');
  });

  it('strengthens the glows on glass themes', () => {
    expect(accentVariables('#10b981', '#06b6d4', 'nebula-dark')['--glow-1']).toBe('rgba(6, 182, 212, 0.16)');
    expect(accentVariables('#10b981', '#06b6d4', 'glass-dark')['--glow-1']).toBe('rgba(6, 182, 212, 0.38)');
    expect(accentVariables('#10b981', '#06b6d4', 'glass-light')['--glow-1']).toBe('rgba(6, 182, 212, 0.3)');
  });
});

describe('normalizeAppearance', () => {
  it('does not mute the app when the volume is missing or null', () => {
    expect(normalizeAppearance({ soundVolume: null }).soundVolume).toBe(45);
    expect(normalizeAppearance({}).soundVolume).toBe(45);
    expect(normalizeAppearance({ soundVolume: 0 }).soundVolume).toBe(0);
  });

  it('ignores arrays and primitives', () => {
    expect(normalizeAppearance([1, 2])).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance(42)).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('parseNebulaAppearance', () => {
  it('returns the defaults for garbage', () => {
    expect(parseNebulaAppearance(undefined)).toEqual(DEFAULT_NEBULA_APPEARANCE);
    expect(parseNebulaAppearance('nope')).toEqual(DEFAULT_NEBULA_APPEARANCE);
  });

  it('rejects the Finterest-only old-* themes and unknown languages field by field', () => {
    const parsed = parseNebulaAppearance({ theme: 'old-dark', language: 'de', background: 'waves' });
    expect(parsed.theme).toBe('system');
    expect(parsed.language).toBe('fr');
    expect(parsed.background).toBe('waves');
  });

  it('keeps a complete valid object unchanged', () => {
    const value = { theme: 'glass-light', accentPreset: 'custom', customPrimary: '#123456', customSecondary: '#abcdef', background: 'none', motion: 'off', soundEnabled: false, soundVolume: 10, language: 'en' };
    expect(parseNebulaAppearance(value)).toEqual(value);
  });
});

describe('applyAppearance', () => {
  it('writes data attributes and only overrides the accent for non-default presets', () => {
    const root = document.createElement('html');
    applyAppearance(root, { ...DEFAULT_APPEARANCE, accentPreset: 'aurora', motion: 'reduced' }, 'nebula-dark');
    expect(root.dataset.motion).toBe('reduced');
    expect(root.dataset.background).toBe('glow');
    expect(root.style.getPropertyValue('--accent')).toBe('#10b981');

    applyAppearance(root, DEFAULT_APPEARANCE, 'nebula-dark');
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });

  it('never applies an accent to a frozen theme', () => {
    const root = document.createElement('html');
    applyAppearance(root, { ...DEFAULT_APPEARANCE, accentPreset: 'ember' }, 'nebula-dark', true);
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });
});
