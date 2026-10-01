import type { CatalogApp } from './catalog';
import type { Channel } from './github-releases';

/** What the renderer receives about the catalog (it never sees raw network data). */
export type CatalogSourceId = 'raw' | 'release' | 'cache' | 'bundled';

export type ReleaseIssue = 'no-release' | 'no-feed' | 'feed-invalid' | 'offline' | 'rate-limited' | 'error';

export interface InstallerInfo {
  fileName: string;
  size: number;
  /** Base64 SHA-512 from latest.yml (R02). */
  sha512: string;
  url: string;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  name: string;
  publishedAt: string;
  /** Markdown, rendered from tokens (R12). */
  notes: string;
  prerelease: boolean;
  installer: InstallerInfo | null;
}

export interface CatalogEntry {
  app: CatalogApp;
  /** data: URL of the icon, or null if it could not be loaded. */
  icon: string | null;
  release: ReleaseInfo | null;
  releaseIssue: ReleaseIssue | null;
  releaseCheckedAt: string | null;
  /** The app needs a newer Hub than this one (`minHubVersion`). */
  requiresNewerHub: boolean;
}

export interface CatalogView {
  /** `offline`: shown from cache, the network was unreachable at the last attempt. */
  state: 'loading' | 'ready' | 'offline' | 'error';
  entries: CatalogEntry[];
  source: CatalogSourceId | null;
  generatedAt: string | null;
  /** Last successful network synchronization of the catalog. */
  syncedAt: string | null;
  refreshing: boolean;
  channel: Channel;
  /** A remote catalog was rejected (bad signature or invalid content): the cache was used. */
  warning: 'signature-invalid' | null;
  rateLimitedUntil: string | null;
  publicKeyFingerprint: string;
  sources: Array<{ id: CatalogSourceId; url: string }>;
}

export const EMPTY_CATALOG_VIEW: CatalogView = {
  state: 'loading',
  entries: [],
  source: null,
  generatedAt: null,
  syncedAt: null,
  refreshing: false,
  channel: 'stable',
  warning: null,
  rateLimitedUntil: null,
  publicKeyFingerprint: '',
  sources: [],
};
