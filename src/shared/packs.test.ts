import { catalogView } from '../../tests/renderer/fixtures';
import type { InstalledView } from './installed-view';
import { activePack, displayName, installedPacks, namedCatalog, packLabel, renameIn, renamePairs, type PackView } from './packs';
import { parseSettings } from './settings';

const SAMPLE_PACK: PackView = {
  id: 'sample',
  ownerAppId: 'nebula.sample',
  themes: [
    { id: 'sample-dark', scheme: 'dark', label: { fr: 'Exemple nuit', en: 'Sample night' }, tokens: { '--page': '#101010', '--accent': '#3080c0' }, chrome: { page: '#101010', ink: '#f0f0f0' } },
    { id: 'sample-light', scheme: 'light', label: { fr: 'Exemple jour' }, tokens: { '--page': '#fafafa' }, chrome: { page: '#fafafa', ink: '#101010' } },
  ],
  names: { 'nebula.hub': 'Sample Hub', 'nebula.clock': 'Sample Clock' },
  markUrl: null,
  iconUrls: { 'nebula.clock': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
};

function view(state: InstalledView['state'], ownerInstalled: boolean): InstalledView {
  return { state, detectedAt: null, apps: ownerInstalled ? [{ appId: 'nebula.sample', version: '1.0.0', scope: 'user', location: 'C:\Programs\Owner', exeFound: true, running: false }] : [] };
}

describe('appearance packs in the Hub (spec § 18)', () => {
  it('keeps a pack only while its owner is detected installed (trusted until the first detection)', () => {
    expect(installedPacks([SAMPLE_PACK], view('ready', true))).toEqual([SAMPLE_PACK]);
    expect(installedPacks([SAMPLE_PACK], view('ready', false))).toEqual([]);
    expect(installedPacks([SAMPLE_PACK], view('loading', false))).toEqual([SAMPLE_PACK]);
  });

  it('finds the chosen pack theme, or falls back to the built-in theme', () => {
    expect(activePack([SAMPLE_PACK], 'sample-light')?.theme.scheme).toBe('light');
    expect(activePack([SAMPLE_PACK], null)).toBeNull();
    expect(activePack([], 'sample-dark')).toBeNull();
    expect(packLabel(SAMPLE_PACK.themes[0].label, 'en')).toBe('Sample night');
    expect(packLabel(SAMPLE_PACK.themes[1].label, 'en')).toBe('Exemple jour');
  });

  it('renames the apps for display only while the pack is active', () => {
    const active = activePack([SAMPLE_PACK], 'sample-dark');
    expect(displayName('nebula.clock', 'Nebula Clock', active)).toBe('Sample Clock');
    expect(displayName('nebula.news', 'Nebula News', active)).toBe('Nebula News');
    expect(displayName('nebula.clock', 'Nebula Clock', null)).toBe('Nebula Clock');
    const named = namedCatalog(catalogView(), active);
    expect(named.entries.find((entry) => entry.app.id === 'nebula.clock')?.app.name).toBe('Sample Clock');
    expect(named.entries.find((entry) => entry.app.id === 'nebula.clock')?.icon).toBe(SAMPLE_PACK.iconUrls['nebula.clock']);
    const news = catalogView().entries.find((entry) => entry.app.id === 'nebula.news');
    expect(named.entries.find((entry) => entry.app.id === 'nebula.news')?.icon).toBe(news?.icon);
    expect(namedCatalog(catalogView(), null)).toEqual(catalogView());
    const pairs = renamePairs([{ id: 'nebula.hub', name: 'Nebula Hub' }, { id: 'nebula.clock', name: 'Nebula Clock' }], active);
    expect(renameIn('Ouvrir Nebula Hub et Nebula Clock', pairs)).toBe('Ouvrir Sample Hub et Sample Clock');
    expect(renameIn('Ouvrir Nebula Hub', [])).toBe('Ouvrir Nebula Hub');
  });

  it('saves the chosen pack theme in the settings, field by field', () => {
    expect(parseSettings({ packTheme: 'sample-dark' }).packTheme).toBe('sample-dark');
    expect(parseSettings({ packTheme: null }).packTheme).toBeNull();
    expect(parseSettings({ packTheme: 'Not A Theme' }).packTheme).toBeNull();
    expect(parseSettings({}).packTheme).toBeNull();
  });
});
