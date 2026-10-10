import type { CatalogApp } from './catalog';
import { releaseChannel, releasesRequest, updateFeedOf } from './release-source';

const GITHUB_APP = {
  id: 'nebula.clock',
  source: { provider: 'github', owner: 'Memel-SQT', repo: 'nebula-clock' },
  windows: { updateFeed: 'latest.yml' },
} as unknown as CatalogApp;

const GITEA_APP = {
  ...GITHUB_APP,
  id: 'nebula.sample',
  releases: { provider: 'gitea', host: 'git.rodriguesnoa.fr', owner: 'noa', repo: 'Sample App', prereleases: true, updateFeed: 'beta.yml' },
} as unknown as CatalogApp;

describe('where the Hub reads an app releases (ADR-038)', () => {
  it('reads GitHub by default, with the GitHub API headers', () => {
    expect(releasesRequest(GITHUB_APP)).toEqual({
      url: 'https://api.github.com/repos/Memel-SQT/nebula-clock/releases?per_page=20',
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    });
    expect(releaseChannel(GITHUB_APP, 'stable')).toBe('stable');
    expect(updateFeedOf(GITHUB_APP)).toBe('latest.yml');
  });

  it('reads the Gitea server the catalog names, following its pre-releases and its own feed', () => {
    expect(releasesRequest(GITEA_APP).url).toBe('https://git.rodriguesnoa.fr/api/v1/repos/noa/Sample%20App/releases?draft=false&limit=20');
    expect(releaseChannel(GITEA_APP, 'stable')).toBe('beta');
    expect(updateFeedOf(GITEA_APP)).toBe('beta.yml');
  });
});
