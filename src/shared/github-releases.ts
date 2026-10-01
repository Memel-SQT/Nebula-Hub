import { isSafeFileName } from './latest-yml';
import { checkUrl } from './net-policy';
import { compareSemver, isSemver } from './semver';

/**
 * GitHub releases (`GET /repos/{owner}/{repo}/releases`), reduced to what the Hub needs and
 * validated: a release must have a semver tag, its assets must be downloadable from an
 * allowlisted host (R05). The release body is the release notes (Finterest publishes them only
 * there since v0.1.36), rendered later from markdown tokens, never as HTML (R12).
 */
export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}

export interface Release {
  tag: string;
  version: string;
  name: string;
  prerelease: boolean;
  publishedAt: string;
  notes: string;
  assets: ReleaseAsset[];
}

export type Channel = 'stable' | 'beta';

const MAX_NOTES = 64 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Keeps every well-formed, published release; silently skips the rest (drafts, odd tags). */
export function parseReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) {
    return [];
  }
  const releases: Release[] = [];
  for (const raw of json.slice(0, 100)) {
    const release = asRecord(raw);
    if (!release || release.draft === true || typeof release.tag_name !== 'string') continue;
    const version = release.tag_name.replace(/^v/, '');
    if (!isSemver(version) || typeof release.published_at !== 'string' || Number.isNaN(Date.parse(release.published_at))) continue;
    const assets: ReleaseAsset[] = [];
    for (const rawAsset of Array.isArray(release.assets) ? release.assets : []) {
      const asset = asRecord(rawAsset);
      const size = Number(asset?.size);
      if (!asset || !isSafeFileName(asset.name) || !Number.isSafeInteger(size) || size < 0 || typeof asset.browser_download_url !== 'string') continue;
      if (!checkUrl(asset.browser_download_url).ok) continue;
      assets.push({ name: asset.name, size, url: asset.browser_download_url });
    }
    releases.push({
      tag: release.tag_name,
      version,
      name: typeof release.name === 'string' && release.name.trim() ? release.name.slice(0, 200) : release.tag_name,
      prerelease: release.prerelease === true,
      publishedAt: release.published_at,
      notes: typeof release.body === 'string' ? release.body.slice(0, MAX_NOTES) : '',
      assets,
    });
  }
  return releases;
}

/**
 * The release offered to the user: the highest version on the channel (stable skips
 * pre-releases, beta includes them). Highest version, not most recent date: a hotfix published
 * on an older line must not hide the current one.
 */
export function pickRelease(releases: readonly Release[], channel: Channel): Release | null {
  const eligible = releases.filter((release) => channel === 'beta' || !release.prerelease);
  return eligible.reduce<Release | null>((best, release) => (!best || compareSemver(release.version, best.version) > 0 ? release : best), null);
}
