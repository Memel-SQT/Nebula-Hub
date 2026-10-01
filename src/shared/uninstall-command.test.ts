import { parseCommandLine, uninstallCommand } from './uninstall-command';

const LOCATION = 'C:\\Users\\Noé\\AppData\\Local\\Programs\\finterest';
const EXE = `${LOCATION}\\Uninstall Nebula Finterest.exe`;
const entry = (quiet: string | null, normal: string | null = null) => ({ quietUninstallString: quiet, uninstallString: normal });

describe('parseCommandLine', () => {
  it('splits a quoted executable and its switches', () => {
    expect(parseCommandLine(`"${EXE}" /currentuser /S`)).toEqual({ executable: EXE, args: ['/currentuser', '/S'] });
  });

  it('reads an unquoted path up to .exe', () => {
    expect(parseCommandLine('C:\\Apps\\x\\uninst.exe /S')).toEqual({ executable: 'C:\\Apps\\x\\uninst.exe', args: ['/S'] });
  });

  it('refuses quotes in the arguments and unterminated quotes', () => {
    expect(parseCommandLine(`"${EXE}" "/a b"`)).toBeNull();
    expect(parseCommandLine(`"${EXE} /S`)).toBeNull();
    expect(parseCommandLine('not a command')).toBeNull();
  });
});

describe('uninstallCommand (ADR-004, R11)', () => {
  it('prefers the quiet command', () => {
    expect(uninstallCommand(entry(`"${EXE}" /currentuser /S`, `"${EXE}" /currentuser`), LOCATION, {})).toEqual({ executable: EXE, args: ['/currentuser', '/S'] });
  });

  it('adds /S to the normal command', () => {
    expect(uninstallCommand(entry(null, `"${EXE}" /currentuser`), LOCATION, {})).toEqual({ executable: EXE, args: ['/currentuser', '/S'] });
  });

  it('expands environment variables (machine installs)', () => {
    const command = uninstallCommand(entry(null, '"%ProgramFiles%\\Nebula Clock\\Uninstall Nebula Clock.exe" /allusers'), '%ProgramFiles%\\Nebula Clock', { ProgramFiles: 'C:\\Program Files' });
    expect(command).toEqual({ executable: 'C:\\Program Files\\Nebula Clock\\Uninstall Nebula Clock.exe', args: ['/allusers', '/S'] });
  });

  it.each([
    ['no command', entry(null, null)],
    ['an executable outside the install folder', entry('"C:\\Windows\\System32\\cmd.exe" /S')],
    ['a relative executable', entry('"Uninstall.exe" /S')],
    ['a parent segment', entry(`"${LOCATION}\\..\\other\\Uninstall.exe" /S`)],
    ['not an .exe', entry(`"${LOCATION}\\Uninstall.bat" /S`)],
    ['the data deletion switch', entry(`"${EXE}" /S --delete-app-data`)],
    ['a value-carrying argument', entry(`"${EXE}" /S /D=C:\\x`)],
    ['a shell operator', entry(`"${EXE}" /S & calc.exe`)],
  ])('refuses %s', (_label, value) => {
    expect(uninstallCommand(value, LOCATION, {})).toBeNull();
  });
});
