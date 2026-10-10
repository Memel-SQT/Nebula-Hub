import type { CatalogApp } from './catalog';
import type { Channel } from './github-releases';

/**
 * Where the Hub reads an app's releases (ADR-038). By default its GitHub repository (`source`);
 * an app published elsewhere declares `releases` in the catalog: a Gitea server of the allowlist
 * (R05), whose releases API answers in the same shape as GitHub's, optionally following its
 * pre-releases (an app that only ships beta builds) and its own update feed (`beta.yml`).
 * Older Hubs ignore the field and keep reading `source`.
 */
export interface ReleaseRequest {
  url: string;
  headers: Record<string, string>;
}

export function releasesRequest(app: CatalogApp): ReleaseRequest {
  const gitea = app.releases;
  if (gitea) {
    return {
      url: `https://${gitea.host}/api/v1/repos/${encodeURIComponent(gitea.owner)}/${encodeURIComponent(gitea.repo)}/releases?draft=false&limit=20`,
      headers: { accept: 'application/json' },
    };
  }
  return {
    url: `https://api.github.com/repos/${app.source.owner}/${app.source.repo}/releases?per_page=20`,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  };
}

/** The channel to read: an app that only ships pre-releases is followed on them whatever the Hub's channel. */
export function releaseChannel(app: CatalogApp, channel: Channel): Channel {
  return app.releases?.prereleases ? 'beta' : channel;
}

/** The update feed of the app's releases (`latest.yml`, or `beta.yml` for pre-release builds). */
export function updateFeedOf(app: CatalogApp): string {
  return app.releases?.updateFeed ?? app.windows.updateFeed;
}
