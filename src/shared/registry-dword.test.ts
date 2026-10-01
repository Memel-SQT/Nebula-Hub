import { parseRegDword } from './registry-dword';

// Shape of a real `reg query` output on a French Windows (the last line is localized).
const OUTPUT = [
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
  '    AppsUseLightTheme    REG_DWORD    0x0',
  '    SystemUsesLightTheme    REG_DWORD    0x1',
  '    EnableTransparency    REG_DWORD    0x1',
  '',
].join('\r\n');

describe('parseRegDword', () => {
  it('reads the requested value only', () => {
    expect(parseRegDword(OUTPUT, 'SystemUsesLightTheme')).toBe(1);
    expect(parseRegDword(OUTPUT, 'AppsUseLightTheme')).toBe(0);
  });

  it('returns null when the value is missing or not a DWORD', () => {
    expect(parseRegDword(OUTPUT, 'ColorPrevalence')).toBeNull();
    expect(parseRegDword('    SystemUsesLightTheme    REG_SZ    1', 'SystemUsesLightTheme')).toBeNull();
    expect(parseRegDword('Erreur : le système n’a pas trouvé la clé', 'SystemUsesLightTheme')).toBeNull();
  });

  it('does not match a longer value name', () => {
    expect(parseRegDword('    SystemUsesLightThemeX    REG_DWORD    0x1', 'SystemUsesLightTheme')).toBeNull();
  });
});
