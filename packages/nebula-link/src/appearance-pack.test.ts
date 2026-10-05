/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPackTheme, parseAppearancePack, parseAppearancePackBytes, readAppearancePacks, removeAppearancePack, writeAppearancePack, type AppearancePack } from './appearance-pack';

function sample(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 1,
    id: 'sample',
    owner: { appId: 'nebula.sample', exe: 'C:\\Programs\\Sample\\Sample.exe' },
    themes: [
      {
        id: 'sample-dark',
        scheme: 'dark',
        label: { fr: 'Exemple nuit', en: 'Sample night' },
        tokens: {
          '--page': '#101010',
          '--accent': 'var(--sample-tint)',
          '--sample-tint': '#3080c0',
          '--accent-soft': 'color-mix(in srgb, var(--sample-tint) 14%, transparent)',
          '--shadow': '0 12px 30px rgba(0, 0, 0, 0.5)',
          '--accent-gradient': 'linear-gradient(135deg, #60a0e0, #3070b0)',
        },
        chrome: { page: '#101010', ink: '#f0f0f0' },
      },
    ],
    names: { 'nebula.clock': 'Sample Clock' },
    mark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    ...patch,
  };
}

function theme(patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(sample().themes as Array<Record<string, unknown>>)[0], ...patch };
}

describe('appearance packs (spec § 18)', () => {
  it('reads a valid pack', () => {
    const pack = parseAppearancePack(sample());
    expect(pack?.id).toBe('sample');
    expect(pack?.themes[0].tokens['--accent']).toBe('var(--sample-tint)');
    expect(pack?.names).toEqual({ 'nebula.clock': 'Sample Clock' });
    expect(pack?.mark).toContain('<svg');
    expect(parseAppearancePack(sample({ names: undefined, mark: undefined }))).toMatchObject({ names: {}, mark: null, marks: {} });
    expect(parseAppearancePack(sample({ marks: { 'nebula.clock': '<svg viewBox="0 0 1 1"></svg>' } }))?.marks['nebula.clock']).toContain('<svg');
  });

  it('rejects token values that could load or escape anything', () => {
    for (const value of ['url(https://example.com/x.png)', 'image-set(a 1x)', '#fff; color: red', '"quoted"', 'a\\9', 'element(#x)', 'x{}', '/* */']) {
      expect(parseAppearancePack(sample({ themes: [theme({ tokens: { '--page': value } })] }))).toBeNull();
    }
    expect(parseAppearancePack(sample({ themes: [theme({ tokens: { color: '#fff' } })] }))).toBeNull();
    expect(parseAppearancePack(sample({ themes: [theme({ tokens: {} })] }))).toBeNull();
  });

  it('rejects built-in or foreign theme ids, duplicates, bad chrome and bad owners', () => {
    expect(parseAppearancePack(sample({ themes: [theme({ id: 'nebula-dark' })] }))).toBeNull();
    expect(parseAppearancePack(sample({ themes: [theme({ id: 'other-dark' })] }))).toBeNull();
    expect(parseAppearancePack(sample({ themes: [theme({}), theme({})] }))).toBeNull();
    expect(parseAppearancePack(sample({ themes: [theme({ chrome: { page: 'red', ink: '#ffffff' } })] }))).toBeNull();
    expect(parseAppearancePack(sample({ themes: [theme({ scheme: 'dim' })] }))).toBeNull();
    expect(parseAppearancePack(sample({ owner: { appId: 'nebula.sample', exe: 'Sample.exe' } }))).toBeNull();
    expect(parseAppearancePack(sample({ owner: { appId: 'nebula.sample', exe: 'C:\\Sample\\run.bat' } }))).toBeNull();
    expect(parseAppearancePack(sample({ schema: 2 }))).toBeNull();
    expect(parseAppearancePack(sample({ id: 'Bad Id' }))).toBeNull();
  });

  it('rejects names with markup and marks that are not plain SVG', () => {
    expect(parseAppearancePack(sample({ names: { 'nebula.clock': '<b>Clock</b>' } }))).toBeNull();
    expect(parseAppearancePack(sample({ mark: '<svg><script>alert(1)</script></svg>' }))).toBeNull();
    expect(parseAppearancePack(sample({ mark: '<svg onload="x()"></svg>' }))).toBeNull();
    expect(parseAppearancePack(sample({ mark: '<img src=x>' }))).toBeNull();
    expect(parseAppearancePack(sample({ marks: { 'nebula.clock': '<svg onclick="x()"></svg>' } }))).toBeNull();
    expect(parseAppearancePack(sample({ marks: { 'Not An Id': '<svg></svg>' } }))).toBeNull();
    expect(parseAppearancePackBytes(Buffer.alloc(300 * 1024, 32))).toBeNull();
    expect(parseAppearancePackBytes('{not json')).toBeNull();
  });

  it('writes, reads (owner installed only) and removes packs in a folder', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-packs-'));
    try {
      const pack = parseAppearancePack(sample()) as AppearancePack;
      expect(writeAppearancePack(pack, directory)).toBe(true);
      fs.writeFileSync(path.join(directory, 'broken.json'), '{');
      fs.writeFileSync(path.join(directory, 'renamed.json'), JSON.stringify(sample()));
      expect(readAppearancePacks({ directory, ownerInstalled: () => true }).map((found) => found.id)).toEqual(['sample']);
      expect(readAppearancePacks({ directory, ownerInstalled: () => false })).toEqual([]);
      // The default check: the owner's executable must exist (it does not here).
      expect(readAppearancePacks({ directory })).toEqual([]);
      expect(findPackTheme([pack], 'sample-dark')?.theme.scheme).toBe('dark');
      expect(findPackTheme([pack], 'nebula-dark')).toBeNull();
      removeAppearancePack('sample', directory);
      expect(readAppearancePacks({ directory, ownerInstalled: () => true })).toEqual([]);
      expect(readAppearancePacks({ directory: path.join(directory, 'missing') })).toEqual([]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
