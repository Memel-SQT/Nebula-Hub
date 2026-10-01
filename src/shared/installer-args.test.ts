import { installerArguments, installTarget, isSafeInstallDirectory, isSafeInstallerName } from './installer-args';

describe('installer arguments (ADR-004)', () => {
  it('installs silently with the catalog switches', () => {
    expect(installerArguments('install', ['/S'], null)).toEqual(['/S']);
    expect(installerArguments('install', ['/S', '--force'], null)).toEqual(['/S', '--force']);
  });

  it('always runs silently', () => {
    expect(installerArguments('install', [], null)).toEqual(['/S']);
  });

  it('puts the chosen folder last, unquoted', () => {
    expect(installerArguments('install', ['/S'], 'D:\\Apps\\Nebula Finterest')).toEqual(['/S', '/D=D:\\Apps\\Nebula Finterest']);
  });

  it('never lets the catalog pick the folder', () => {
    expect(installerArguments('install', ['/S', '/D=C:\\Evil'], null)).toEqual(['/S']);
  });

  it('updates and repairs exactly like electron-updater, without a folder', () => {
    expect(installerArguments('update', ['/S'], null)).toEqual(['--updated', '/S']);
    expect(installerArguments('repair', ['/S'], 'D:\\Apps\\X')).toEqual(['--updated', '/S']);
  });

  it('refuses the data deletion switch everywhere', () => {
    expect(() => installerArguments('install', ['/S', '--delete-app-data'], null)).toThrow('ERR_FORBIDDEN_INSTALLER_ARGUMENT');
    expect(() => installerArguments('update', ['--DELETE-APP-DATA'], null)).toThrow('ERR_FORBIDDEN_INSTALLER_ARGUMENT');
  });

  it('refuses an unsafe folder', () => {
    expect(() => installerArguments('install', ['/S'], 'D:\\Apps\\..\\Windows')).toThrow('ERR_UNSAFE_INSTALL_DIRECTORY');
  });
});

describe('install folder', () => {
  it.each(['C:\\', 'D:\\Apps', 'D:\\Mes apps\\Nebula', 'E:\\Été\\Nebula'])('accepts %s', (value) => {
    expect(isSafeInstallDirectory(value)).toBe(true);
  });

  it.each([
    ['relative', 'Apps\\Nebula'],
    ['UNC', '\\\\server\\share'],
    ['forward slashes', 'C:/Apps'],
    ['quotes', 'C:\\Apps" /S'],
    ['parent segment', 'C:\\Apps\\..\\Windows'],
    ['dot segment', 'C:\\Apps\\.\\X'],
    ['empty segment', 'C:\\Apps\\\\X'],
    ['trailing backslash', 'C:\\Apps\\'],
    ['trailing dot', 'C:\\Apps.'],
    ['alternate stream', 'C:\\Apps:stream'],
    ['wildcard', 'C:\\Apps\\*'],
    ['control character', 'C:\\Apps\n/S'],
    ['too long', `C:\\${'a'.repeat(200)}`],
    ['not a string', 42],
  ])('refuses %s', (_label, value) => {
    expect(isSafeInstallDirectory(value)).toBe(false);
  });

  it('puts each app in its own folder under the chosen one', () => {
    expect(installTarget('D:\\Apps', 'Nebula Finterest')).toBe('D:\\Apps\\Nebula Finterest');
    expect(installTarget('C:\\', 'Nebula Clock')).toBe('C:\\Nebula Clock');
  });
});

describe('installer file name', () => {
  it('accepts a bare .exe name only', () => {
    expect(isSafeInstallerName('Nebula-Finterest-Setup-0.1.36.exe')).toBe(true);
    expect(isSafeInstallerName('..\\x.exe')).toBe(false);
    expect(isSafeInstallerName('setup.msi')).toBe(false);
    expect(isSafeInstallerName('C:\\x.exe')).toBe(false);
  });
});
