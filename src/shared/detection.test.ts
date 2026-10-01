import { HKCU_INSTALL_FINTEREST, HKCU_UNINSTALL, HKLM32_UNINSTALL } from '../../tests/fixtures/registry';
import { validateCatalog, type CatalogApp } from './catalog';
import { executableOf, findEntry, installedVersion, installLocation, matchesProduct, parentFolder, uninstallEntries } from './detection';
import { decodeRegFile, expandEnvironment, parseRegFile, regString } from './reg-file';
import { isRunning, parseTasklist } from './tasklist';
import { updateAvailable } from './installed-view';
import fs from 'node:fs';
import path from 'node:path';

const catalog = validateCatalog(JSON.parse(fs.readFileSync(path.join(__dirname, '../../catalog/nebula-catalog.json'), 'utf8')));
if (!catalog.ok) throw new Error('catalog');
const app = (id: string) => catalog.catalog.apps.find((candidate) => candidate.id === id) as CatalogApp;

describe('parseRegFile', () => {
  it('reads the keys and values of a real export', () => {
    const keys = parseRegFile(HKCU_UNINSTALL);
    const finterest = keys.find((key) => key.path.endsWith('a0d0bf64-c6cf-5893-bede-cd00c2b7eccb'))!;
    expect(regString(finterest, 'DisplayName')).toBe('Nebula Finterest 0.1.35');
    expect(regString(finterest, 'displayname')).toBe('Nebula Finterest 0.1.35');
    expect(regString(finterest, 'QuietUninstallString')).toBe('"C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest\\Uninstall Nebula Finterest.exe" /currentuser /S');
    expect(finterest.values.get('estimatedsize')).toEqual({ type: 'dword', value: 0x49d74 });
  });

  it('decodes REG_EXPAND_SZ written on several lines, escaped quotes and accents', () => {
    const keys = parseRegFile(HKLM32_UNINSTALL);
    expect(regString(keys[0], 'UninstallString')).toBe('"%ProgramFiles%\\Nebula Clock\\Uninstall Nebula Clock.exe" /allusers');
    expect(keys[0].values.get('uninstallstring')?.type).toBe('expand_sz');
    expect(regString(keys[0], 'Publisher')).toBe('Nebula "Clock" contributors');
    expect(regString(keys[1], 'DisplayName')).toBe('Logiciel de Noé');
  });

  it('decodes the UTF-16LE file reg.exe writes, accents included', () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(HKLM32_UNINSTALL, 'utf16le')]);
    expect(decodeRegFile(bytes)).toBe(HKLM32_UNINSTALL);
  });

  it('ignores deleted keys, comments and garbage without failing', () => {
    expect(parseRegFile('[-HKEY_CURRENT_USER\\x]\n"a"="b"\n; comment\nnot a value\n')).toEqual([]);
  });

  it('expands environment variables case-insensitively', () => {
    expect(expandEnvironment('%ProgramFiles%\\x %UNKNOWN%', { PROGRAMFILES: 'C:\\Program Files' })).toBe('C:\\Program Files\\x %UNKNOWN%');
  });
});

describe('detection', () => {
  const entries = [...uninstallEntries(parseRegFile(HKCU_UNINSTALL)), ...uninstallEntries(parseRegFile(HKLM32_UNINSTALL))];

  it('lists only the Uninstall subkeys that have a DisplayName', () => {
    expect(entries.map((entry) => `${entry.hive}:${entry.displayName}`)).toEqual([
      'HKCU:Nebula Finterest 0.1.35', 'HKCU:Nebula News 0.1.0', 'HKCU:Nebula Clock 1.1.3', 'HKCU:Nebula FinterestCompanion 2.0',
      'HKLM:Nebula Clock 1.1.2', 'HKLM:Logiciel de Noé',
    ]);
  });

  it('matches the product name exactly or followed by a space', () => {
    expect(matchesProduct('Nebula Finterest 0.1.35', 'Nebula Finterest')).toBe(true);
    expect(matchesProduct('Nebula Finterest', 'Nebula Finterest')).toBe(true);
    expect(matchesProduct('Nebula FinterestCompanion 2.0', 'Nebula Finterest')).toBe(false);
    expect(matchesProduct('nebula finterest 1.0', 'Nebula Finterest')).toBe(false);
  });

  it('finds each catalog app and prefers the per-user install', () => {
    expect(findEntry(app('nebula.finterest'), entries)?.displayVersion).toBe('0.1.35');
    const clock = findEntry(app('nebula.clock'), entries)!;
    expect(clock.hive).toBe('HKCU');
    expect(clock.displayVersion).toBe('1.1.3');
    expect(findEntry(app('nebula.hub'), entries)).toBeNull();
  });

  it('falls back to the per-machine install', () => {
    expect(findEntry(app('nebula.clock'), entries.filter((entry) => entry.hive === 'HKLM'))?.displayVersion).toBe('1.1.2');
  });

  it('reads InstallLocation from Software\\<key>, else from the uninstaller path', () => {
    const finterest = findEntry(app('nebula.finterest'), entries)!;
    const location = regString(parseRegFile(HKCU_INSTALL_FINTEREST)[0], 'InstallLocation');
    expect(installLocation(finterest, location)).toBe('C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest');
    expect(installLocation(finterest, null)).toBe('C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest');
    expect(installLocation(findEntry(app('nebula.clock'), entries.filter((entry) => entry.hive === 'HKLM'))!, null)).toBe('%ProgramFiles%\\Nebula Clock');
  });

  it('keeps only semantic versions', () => {
    expect(installedVersion(findEntry(app('nebula.finterest'), entries)!)).toBe('0.1.35');
    expect(installedVersion({ ...entries[0], displayVersion: '1.0' })).toBeNull();
  });

  it('extracts the executable of a command line', () => {
    expect(executableOf('"C:\\a b\\Uninstall X.exe" /currentuser /S')).toBe('C:\\a b\\Uninstall X.exe');
    expect(executableOf('C:\\x\\un.exe /S')).toBe('C:\\x\\un.exe');
    expect(executableOf('"unterminated')).toBeNull();
    expect(executableOf(null)).toBeNull();
    expect(parentFolder('C:\\a\\b\\c.exe')).toBe('C:\\a\\b');
  });
});

describe('tasklist', () => {
  it('reads the CSV records and ignores the localized message', () => {
    const output = '\r\n"Nebula Clock.exe","1234","Console","1","50 012 Ko"\r\n"Nebula Clock.exe","1240","Console","1","12 Ko"\r\n"explorer.exe","88","Console","1","9 Ko"\r\nINFO : aucune tâche en cours.\r\n';
    const processes = parseTasklist(output);
    expect(isRunning(processes, 'Nebula Clock.exe')).toBe(true);
    expect(isRunning(processes, 'NEBULA CLOCK.EXE')).toBe(true);
    expect(isRunning(processes, 'Nebula Finterest.exe')).toBe(false);
    expect(parseTasklist('INFO: No tasks are running which match the specified criteria.').size).toBe(0);
  });
});

describe('updateAvailable', () => {
  const entry = { app: app('nebula.finterest'), icon: null, release: { version: '0.1.36', tag: 'v0.1.36', name: '', publishedAt: '', notes: '', prerelease: false, installer: null }, releaseIssue: null, releaseCheckedAt: null, requiresNewerHub: false };
  const installed = { appId: 'nebula.finterest', version: '0.1.35', scope: 'user' as const, location: 'C:\\x', exeFound: true, running: false };

  it('is true only for a strictly newer release', () => {
    expect(updateAvailable(entry, installed)).toBe(true);
    expect(updateAvailable(entry, { ...installed, version: '0.1.36' })).toBe(false);
    expect(updateAvailable(entry, { ...installed, version: null })).toBe(false);
    expect(updateAvailable({ ...entry, release: null }, installed)).toBe(false);
    expect(updateAvailable(entry, undefined)).toBe(false);
  });
});
