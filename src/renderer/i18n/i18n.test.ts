import { en, formatBytes, fr, translate } from './index';

describe('i18n', () => {
  it('has exactly the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('has no empty translation', () => {
    for (const [key, value] of [...Object.entries(fr), ...Object.entries(en)]) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('replaces every occurrence of a parameter', () => {
    expect(translate('fr', 'sidebar.version', { version: '0.1.0' })).toBe('Version 0.1.0');
  });

  it('formats sizes with the locale', () => {
    expect(formatBytes('en', 88_626_634)).toBe('84.5 MB');
  });
});
