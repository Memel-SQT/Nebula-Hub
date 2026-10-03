import fs from 'node:fs';
import path from 'node:path';
import { isAllowedInstallerArg, isSafeAssetPath, localize, validateCatalog } from './catalog';

const SOURCE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../catalog/nebula-catalog.json'), 'utf8'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fixtures mutate arbitrary JSON on purpose.
type Json = any;

function clone(): Json {
  return JSON.parse(JSON.stringify(SOURCE));
}

function errorsOf(value: unknown): string[] {
  const result = validateCatalog(value);
  return result.ok ? [] : result.errors;
}

describe('validateCatalog', () => {
  it('accepts the catalog shipped in the repository', () => {
    const result = validateCatalog(SOURCE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.apps.map((app) => app.id)).toEqual(['nebula.finterest', 'nebula.clock', 'nebula.news', 'nebula.finance-enterprise', 'nebula.hub']);
      expect(result.catalog.apps.find((app) => app.id === 'nebula.finance-enterprise')).toMatchObject({ visibility: 'installed-only', status: 'beta', minHubVersion: '0.2.3' });
      expect(result.catalog.apps.filter((app) => app.visibility).map((app) => app.id)).toEqual(['nebula.finance-enterprise']);
      expect(result.catalog.apps[0].windows.preOperationBackup?.argument).toBe('--backup-before-uninstall=');
    }
  });

  it('every icon and screenshot it references exists', () => {
    for (const app of SOURCE.apps) {
      for (const asset of [app.icon, ...app.screenshots]) {
        expect(fs.existsSync(path.join(__dirname, '../../catalog', asset))).toBe(true);
      }
    }
  });

  it('drops unknown fields', () => {
    const value = clone();
    value.apps[0].evil = 'x';
    value.apps[0].windows.extra = 'y';
    const result = validateCatalog(value);
    expect(result.ok && 'evil' in result.catalog.apps[0]).toBe(false);
    expect(result.ok && 'extra' in result.catalog.apps[0].windows).toBe(false);
  });

  it.each([
    ['schema', (c: Json) => { c.schema = 2; }, '$.schema'],
    ['path traversal in the icon', (c: Json) => { c.apps[0].icon = 'icons/../../evil.svg'; }, '$.apps[0].icon'],
    ['absolute icon URL', (c: Json) => { c.apps[0].icon = 'https://evil.example/x.svg'; }, '$.apps[0].icon'],
    ['screenshot outside its folder', (c: Json) => { c.apps[0].screenshots = ['C:/Windows/x.png']; }, '$.apps[0].screenshots'],
    ['exe name with a path', (c: Json) => { c.apps[0].windows.exeName = '..\\..\\cmd.exe'; }, '$.apps[0].windows.exeName'],
    ['exe name not an exe', (c: Json) => { c.apps[0].windows.exeName = 'Nebula Finterest.bat'; }, '$.apps[0].windows.exeName'],
    ['data deletion switch', (c: Json) => { c.apps[0].windows.silentArgs = ['/S', '--delete-app-data']; }, '$.apps[0].windows.silentArgs'],
    ['shell metacharacters', (c: Json) => { c.apps[0].windows.silentArgs = ['/S & calc']; }, '$.apps[0].windows.silentArgs'],
    ['backup folder traversal', (c: Json) => { c.apps[0].windows.preOperationBackup.documentsFolder = '..\\..\\AppData'; }, '$.apps[0].windows.preOperationBackup'],
    ['unknown backup format', (c: Json) => { c.apps[0].windows.preOperationBackup.format = 'raw'; }, '$.apps[0].windows.preOperationBackup'],
    ['import switch with a value', (c: Json) => { c.apps[0].windows.preOperationBackup.importArgument = '--import-backup=C:/x'; }, '$.apps[0].windows.preOperationBackup.importArgument'],
    ['GitHub owner', (c: Json) => { c.apps[0].source.owner = 'Memel-SQT/../x'; }, '$.apps[0].source.owner'],
    ['other provider', (c: Json) => { c.apps[0].source.provider = 'gitlab'; }, '$.apps[0].source'],
    ['category', (c: Json) => { c.apps[0].category = 'games'; }, '$.apps[0].category'],
    ['empty tagline', (c: Json) => { c.apps[0].tagline.fr = '  '; }, '$.apps[0].tagline.fr'],
    ['min version', (c: Json) => { c.apps[0].minHubVersion = 'soon'; }, '$.apps[0].minHubVersion'],
    ['duplicate id', (c: Json) => { c.apps[1].id = 'nebula.finterest'; }, '$.apps[1].id'],
    ['duplicate appId', (c: Json) => { c.apps[1].windows.appId = 'com.finterest.desktop'; }, '$.apps[1].windows.appId'],
    ['two hubs', (c: Json) => { c.apps[0].role = 'hub'; }, '$.apps'],
  ])('rejects %s', (_label, mutate, where) => {
    const value = clone();
    mutate(value);
    expect(errorsOf(value).some((error) => error.startsWith(where))).toBe(true);
  });

  it('keeps an optional import switch (ADR-026)', () => {
    const value = clone();
    value.apps[0].windows.preOperationBackup.importArgument = '--import-backup=';
    const result = validateCatalog(value);
    expect(result.ok && result.catalog.apps[0].windows.preOperationBackup?.importArgument).toBe('--import-backup=');
  });

  it('accepts only "installed-only" as a visibility (ADR-033)', () => {
    const app = SOURCE.apps.find((candidate: { id: string }) => candidate.id === 'nebula.finance-enterprise');
    expect(validateCatalog({ ...SOURCE, apps: [{ ...app, visibility: 'hidden' }] }).ok).toBe(false);
    const without = validateCatalog({ ...SOURCE, apps: [{ ...app, visibility: undefined }] });
    expect(without.ok && without.catalog.apps[0].visibility).toBe(undefined);
  });

  it('rejects non-objects and empty lists', () => {
    expect(errorsOf(null)).toEqual(['$: expected an object']);
    expect(errorsOf({ schema: 1, generatedAt: '2026-10-01T00:00:00Z', apps: [] })).toContain('$.apps: expected 1 to 50 apps');
  });
});

describe('helpers', () => {
  it('validates asset paths and installer switches', () => {
    expect(isSafeAssetPath('icons/finterest.svg')).toBe(true);
    expect(isSafeAssetPath('icons/a/b.svg')).toBe(false);
    expect(isAllowedInstallerArg('/S')).toBe(true);
    expect(isAllowedInstallerArg('--updated')).toBe(true);
    expect(isAllowedInstallerArg('/D=C:\\x')).toBe(false);
  });

  it('falls back to French', () => {
    expect(localize({ fr: 'Bonjour' }, 'en')).toBe('Bonjour');
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello');
  });
});
