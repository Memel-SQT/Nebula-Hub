import { parseReleases, pickRelease } from './github-releases';

function release(tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: tag,
    name: `Release ${tag}`,
    draft: false,
    prerelease: false,
    published_at: '2026-10-01T09:12:04Z',
    body: '## Nouveautés\n- Icônes',
    assets: [
      { name: 'latest.yml', size: 363, browser_download_url: `https://github.com/Memel-SQT/Nebula-Finterest/releases/download/${tag}/latest.yml` },
      { name: `Nebula-Finterest-Setup-${tag.slice(1)}.exe`, size: 88626634, browser_download_url: `https://github.com/Memel-SQT/Nebula-Finterest/releases/download/${tag}/Nebula-Finterest-Setup-${tag.slice(1)}.exe` },
    ],
    ...extra,
  };
}

describe('parseReleases', () => {
  it('keeps the fields the Hub needs', () => {
    const [parsed] = parseReleases([release('v0.1.36')]);
    expect(parsed).toMatchObject({ tag: 'v0.1.36', version: '0.1.36', prerelease: false, notes: '## Nouveautés\n- Icônes' });
    expect(parsed.assets.map((asset) => asset.name)).toEqual(['latest.yml', 'Nebula-Finterest-Setup-0.1.36.exe']);
  });

  it('skips drafts, non-semver tags (the News "v0.2.0-desktop" is valid semver, "desktop" is not) and garbage', () => {
    const parsed = parseReleases([release('v1.0.0', { draft: true }), release('desktop'), release('v0.2.0-desktop', { prerelease: true }), 'x', null]);
    expect(parsed.map((item) => item.tag)).toEqual(['v0.2.0-desktop']);
  });

  it('drops assets that are not downloadable from the allowlist', () => {
    const [parsed] = parseReleases([release('v1.0.0', { assets: [
      { name: 'evil.exe', size: 1, browser_download_url: 'https://evil.example/evil.exe' },
      { name: '../x.exe', size: 1, browser_download_url: 'https://github.com/x' },
      { name: 'ok.exe', size: 1, browser_download_url: 'http://github.com/ok.exe' },
    ] })]);
    expect(parsed.assets).toEqual([]);
  });

  it('returns nothing for a non-array answer (API error object)', () => {
    expect(parseReleases({ message: 'API rate limit exceeded' })).toEqual([]);
  });
});

describe('pickRelease', () => {
  const releases = parseReleases([release('v0.1.35'), release('v0.2.0-beta.1', { prerelease: true }), release('v0.1.36'), release('v0.1.34')]);

  it('takes the highest stable version on the stable channel', () => {
    expect(pickRelease(releases, 'stable')?.version).toBe('0.1.36');
  });

  it('includes pre-releases on the beta channel', () => {
    expect(pickRelease(releases, 'beta')?.version).toBe('0.2.0-beta.1');
  });

  it('returns null when nothing is eligible', () => {
    expect(pickRelease(parseReleases([release('v0.2.0-desktop', { prerelease: true })]), 'stable')).toBeNull();
  });
});
