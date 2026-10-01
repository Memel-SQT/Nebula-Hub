import { DEFAULT_NEBULA_APPEARANCE } from '@nebula/design';
import { DEFAULT_SETTINGS, mergeAppearance, mergeSettings, parseSettings } from './settings';

describe('parseSettings', () => {
  it('returns the defaults for anything unusable', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs each field on its own', () => {
    const parsed = parseSettings({ closeToTray: 'yes', launchAtLogin: true, channel: 'nightly', appearance: { theme: 'glass-dark', motion: 'warp' } });
    expect(parsed.closeToTray).toBe(true);
    expect(parsed.launchAtLogin).toBe(true);
    expect(parsed.channel).toBe('stable');
    expect(parsed.appearance.theme).toBe('glass-dark');
    expect(parsed.appearance.motion).toBe('full');
  });
});

describe('mergeAppearance', () => {
  it('applies valid fields and keeps the current value for invalid ones', () => {
    const current = { ...DEFAULT_NEBULA_APPEARANCE, background: 'stars' as const, theme: 'nebula-light' as const };
    const merged = mergeAppearance(current, { theme: 'old-dark', motion: 'reduced', customPrimary: 'blue' });
    expect(merged.theme).toBe('nebula-light');
    expect(merged.motion).toBe('reduced');
    expect(merged.customPrimary).toBe(current.customPrimary);
    expect(merged.background).toBe('stars');
  });

  it('ignores unknown keys and non-objects', () => {
    expect(mergeAppearance(DEFAULT_NEBULA_APPEARANCE, { evil: true })).toEqual(DEFAULT_NEBULA_APPEARANCE);
    expect(mergeAppearance(DEFAULT_NEBULA_APPEARANCE, null)).toEqual(DEFAULT_NEBULA_APPEARANCE);
  });
});

describe('mergeSettings', () => {
  it('never lets a settings patch replace the appearance', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { closeToTray: false, appearance: { theme: 'glass-light' } });
    expect(merged.closeToTray).toBe(false);
    expect(merged.appearance).toEqual(DEFAULT_SETTINGS.appearance);
  });

  it('keeps the current value when the patch is invalid', () => {
    const current = { ...DEFAULT_SETTINGS, channel: 'beta' as const, closeToTray: false };
    expect(mergeSettings(current, { channel: 'alpha', closeToTray: 1 })).toEqual(current);
  });
});

describe('install folder setting', () => {
  it('keeps a safe folder, clears with null, and refuses anything else', () => {
    expect(parseSettings({ installDirectory: 'D:\\Apps' }).installDirectory).toBe('D:\\Apps');
    expect(parseSettings({ installDirectory: 'D:\\Apps\\..\\Windows' }).installDirectory).toBeNull();
    const current = { ...DEFAULT_SETTINGS, installDirectory: 'D:\\Apps' };
    expect(mergeSettings(current, { installDirectory: null }).installDirectory).toBeNull();
    expect(mergeSettings(current, { installDirectory: 'relative' }).installDirectory).toBe('D:\\Apps');
  });
});

describe('automatic updates setting', () => {
  it('is off by default and keeps only valid app ids turned on', () => {
    expect(DEFAULT_SETTINGS.autoUpdate).toEqual({});
    expect(parseSettings({ autoUpdate: { 'nebula.clock': true, 'nebula.news': false, 'Bad Id': true, nebulaclock: true, 'nebula.x': 'yes' } }).autoUpdate).toEqual({ 'nebula.clock': true });
    expect(parseSettings({ autoUpdate: 'all' }).autoUpdate).toEqual({});
    expect(mergeSettings(DEFAULT_SETTINGS, { autoUpdate: { 'nebula.finterest': true } }).autoUpdate).toEqual({ 'nebula.finterest': true });
  });
});
