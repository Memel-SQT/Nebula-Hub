import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeAssetPath, validateCatalog, type Catalog, type CatalogApp } from '../../shared/catalog';
import type { CatalogEntry, CatalogSourceId, CatalogView, ReleaseInfo, ReleaseIssue } from '../../shared/catalog-view';
import { parseReleases, pickRelease, type Channel } from '../../shared/github-releases';
import { FeedError, MAX_FEED_BYTES, parseUpdateFeed, selectInstaller } from '../../shared/latest-yml';
import { compareSemver } from '../../shared/semver';
import { publicKeyFingerprint, verifyCatalogSignature } from '../catalog-signature';
import type { HubDatabase } from '../db';
import { NetError, type HttpGet } from '../net/http';

/**
 * Catalog acquisition (brief §6, rules R02/R03/R05).
 *
 * Sources, in order (ADR-010, ADR-019): the catalog on the repository's main branch
 * (raw.githubusercontent.com), then the assets of the Hub's latest release. Whatever arrives
 * must carry a valid Ed25519 signature and pass the schema; otherwise it is rejected with a
 * warning. Among the valid candidates — fresh remote, last valid cache, signed catalog bundled
 * in the app — the most recent `generatedAt` wins, so an old signed catalog replayed by the
 * network cannot roll the Hub back.
 *
 * For each app, the release offered on the channel is read from the GitHub API (conditional
 * requests with ETag), then its `latest.yml`, whose size and SHA-512 will gate the install (R02).
 * Everything is cached in store.sqlite so the full catalog shows offline.
 */
export const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CATALOG_MAX_BYTES = 512 * 1024;
const SIGNATURE_MAX_BYTES = 1024;
const RELEASES_MAX_BYTES = 2 * 1024 * 1024;
const ASSET_MAX_BYTES = 5 * 1024 * 1024;
const HUB_REPOSITORY = 'Memel-SQT/Nebula-Hub';

export interface RemoteSource {
  id: Extract<CatalogSourceId, 'raw' | 'release'>;
  catalogUrl: string;
  signatureUrl: string;
}

export const REMOTE_SOURCES: RemoteSource[] = [
  {
    id: 'raw',
    catalogUrl: `https://raw.githubusercontent.com/${HUB_REPOSITORY}/main/catalog/nebula-catalog.json`,
    signatureUrl: `https://raw.githubusercontent.com/${HUB_REPOSITORY}/main/catalog/nebula-catalog.json.sig`,
  },
  {
    id: 'release',
    catalogUrl: `https://github.com/${HUB_REPOSITORY}/releases/latest/download/nebula-catalog.json`,
    signatureUrl: `https://github.com/${HUB_REPOSITORY}/releases/latest/download/nebula-catalog.json.sig`,
  },
];

/** Icons and screenshots not shipped in the app come from the repository's catalog folder. */
export const REMOTE_ASSET_BASE = `https://raw.githubusercontent.com/${HUB_REPOSITORY}/main/catalog/`;

export interface CatalogServiceDeps {
  http: HttpGet;
  db: HubDatabase;
  publicKey: string;
  /** Folder holding the signed catalog and its assets shipped with the app. */
  bundledDir: string;
  hubVersion: string;
  channel: () => Channel;
  now?: () => Date;
  sources?: RemoteSource[];
  assetBase?: string;
}

interface Candidate {
  source: CatalogSourceId;
  catalog: Catalog;
  bytes: Uint8Array;
  signature: string;
}

interface StoredRelease {
  channel: Channel;
  release: ReleaseInfo | null;
  issue: ReleaseIssue | null;
  checkedAt: string;
}

const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function issueFor(error: unknown): ReleaseIssue {
  if (error instanceof NetError) {
    if (error.code === 'ERR_NET_RATE_LIMITED') return 'rate-limited';
    if (error.code === 'ERR_NET_OFFLINE' || error.code === 'ERR_NET_TIMEOUT') return 'offline';
    if (error.code === 'ERR_NET_STATUS' && error.detail.status === 404) return 'no-release';
  }
  if (error instanceof FeedError) return 'feed-invalid';
  return 'error';
}

export class CatalogService {
  private view: CatalogView;
  private readonly listeners = new Set<(view: CatalogView) => void>();
  private refreshing: Promise<CatalogView> | null = null;
  private catalog: Candidate | null = null;
  private readonly fingerprint: string;

  constructor(private readonly deps: CatalogServiceDeps) {
    this.fingerprint = publicKeyFingerprint(deps.publicKey);
    this.view = {
      state: 'loading',
      entries: [],
      source: null,
      generatedAt: null,
      syncedAt: null,
      refreshing: false,
      channel: deps.channel(),
      warning: null,
      rateLimitedUntil: null,
      publicKeyFingerprint: this.fingerprint,
      sources: [...this.sources().map((source) => ({ id: source.id, url: source.catalogUrl })), { id: 'bundled' as const, url: 'app' }],
    };
  }

  private sources(): RemoteSource[] {
    return this.deps.sources ?? REMOTE_SOURCES;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  getView(): CatalogView {
    return this.view;
  }

  onChange(listener: (view: CatalogView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(patch: Partial<CatalogView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener(this.view);
  }

  /** Shows what is known locally (cache or bundled catalog) without touching the network. */
  async loadLocal(): Promise<CatalogView> {
    const local = await this.bestLocalCandidate();
    if (!local) {
      this.publish({ state: 'error' });
      return this.view;
    }
    this.catalog = local;
    const syncedAt = this.state('catalog_synced_at');
    this.publish({
      state: 'ready',
      source: local.source,
      generatedAt: local.catalog.generatedAt,
      syncedAt,
      entries: await this.buildEntries(local.catalog),
    });
    return this.view;
  }

  /** Network refresh. Without `force`, a sync younger than 6 h on the same channel is reused. */
  refresh(force = false): Promise<CatalogView> {
    if (this.refreshing) {
      return this.refreshing;
    }
    this.refreshing = this.doRefresh(force).finally(() => {
      this.refreshing = null;
      this.publish({ refreshing: false });
    });
    return this.refreshing;
  }

  private async doRefresh(force: boolean): Promise<CatalogView> {
    const channel = this.deps.channel();
    const last = this.state('catalog_synced_at');
    const fresh = last && this.now().getTime() - Date.parse(last) < CATALOG_MAX_AGE_MS && this.state('catalog_channel') === channel;
    if (!force && fresh && this.catalog) {
      return this.view;
    }
    this.publish({ refreshing: true, channel });

    let reachedNetwork = false;
    let rejected = false;
    let rateLimitedUntil: string | null = null;
    let remote: Candidate | null = null;
    for (const source of this.sources()) {
      try {
        const bytes = await this.cachedGet(source.catalogUrl, CATALOG_MAX_BYTES);
        const signature = (await this.cachedGet(source.signatureUrl, SIGNATURE_MAX_BYTES)).toString('utf8');
        reachedNetwork = true;
        const candidate = this.verify(source.id, bytes, signature);
        if (candidate) {
          remote = candidate;
          break;
        }
        rejected = true;
      } catch (error) {
        if (error instanceof NetError && error.code === 'ERR_NET_STATUS') reachedNetwork = true;
        if (error instanceof NetError && error.code === 'ERR_NET_RATE_LIMITED') rateLimitedUntil = error.detail.resetAt ?? null;
      }
    }

    const local = await this.bestLocalCandidate();
    const chosen = [remote, local].filter((candidate): candidate is Candidate => candidate !== null)
      .sort((a, b) => Date.parse(b.catalog.generatedAt) - Date.parse(a.catalog.generatedAt))[0] ?? null;
    if (!chosen) {
      this.publish({ state: 'error', warning: rejected ? 'signature-invalid' : null, rateLimitedUntil });
      return this.view;
    }
    if (remote && chosen === remote) {
      await this.saveCatalog(remote);
    }
    this.catalog = chosen;

    const entries = await this.buildEntries(chosen.catalog, true, channel);
    const online = reachedNetwork && entries.every((entry) => entry.releaseIssue !== 'offline');
    if (online) {
      await this.setState({ catalog_synced_at: this.now().toISOString(), catalog_channel: channel });
    }
    this.publish({
      state: online ? 'ready' : 'offline',
      entries,
      source: chosen.source,
      generatedAt: chosen.catalog.generatedAt,
      syncedAt: this.state('catalog_synced_at'),
      warning: rejected ? 'signature-invalid' : null,
      rateLimitedUntil,
      channel,
    });
    return this.view;
  }

  /** R03: signature over the exact bytes, then the schema. Null when either fails. */
  private verify(source: CatalogSourceId, bytes: Uint8Array, signature: string): Candidate | null {
    if (!verifyCatalogSignature(bytes, signature, this.deps.publicKey)) {
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      return null;
    }
    const validation = validateCatalog(json);
    return validation.ok ? { source, catalog: validation.catalog, bytes, signature } : null;
  }

  private async bestLocalCandidate(): Promise<Candidate | null> {
    const candidates: Candidate[] = [];
    const cached = this.deps.db.get<{ body: Uint8Array; signature: string }>('SELECT body, signature FROM catalog_cache WHERE id = 1');
    if (cached) {
      // Re-verified on every load: the cache file lives in userData and could be edited.
      const candidate = this.verify('cache', cached.body, cached.signature);
      if (candidate) candidates.push(candidate);
    }
    try {
      const bytes = await fs.readFile(path.join(this.deps.bundledDir, 'nebula-catalog.json'));
      const signature = await fs.readFile(path.join(this.deps.bundledDir, 'nebula-catalog.json.sig'), 'utf8');
      const candidate = this.verify('bundled', bytes, signature);
      if (candidate) candidates.push(candidate);
    } catch {
      // No bundled catalog (should not happen in a packaged build).
    }
    return candidates.sort((a, b) => Date.parse(b.catalog.generatedAt) - Date.parse(a.catalog.generatedAt))[0] ?? null;
  }

  private async saveCatalog(candidate: Candidate): Promise<void> {
    await this.deps.db.transaction((run) => {
      run('INSERT OR REPLACE INTO catalog_cache (id, source, body, signature, generated_at, verified_at) VALUES (1, ?, ?, ?, ?, ?)', [
        candidate.source, candidate.bytes, candidate.signature, candidate.catalog.generatedAt, this.now().toISOString(),
      ]);
    });
  }

  private state(key: string): string | null {
    return this.deps.db.get<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key])?.value ?? null;
  }

  private async setState(values: Record<string, string>): Promise<void> {
    await this.deps.db.transaction((run) => {
      for (const [key, value] of Object.entries(values)) run('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);
    });
  }

  /** GET with ETag: a 304 serves the cached body; any success refreshes the cache. */
  private async cachedGet(url: string, maxBytes: number, headers?: Record<string, string>): Promise<Buffer> {
    const cached = this.deps.db.get<{ etag: string | null; body: Uint8Array }>('SELECT etag, body FROM http_cache WHERE url = ?', [url]);
    const response = await this.deps.http(url, { maxBytes, headers, etag: cached?.etag ?? null });
    if (response.notModified && cached) {
      return Buffer.from(cached.body);
    }
    await this.deps.db.transaction((run) => {
      run('INSERT OR REPLACE INTO http_cache (url, etag, body, fetched_at) VALUES (?, ?, ?, ?)', [url, response.etag, response.body, this.now().toISOString()]);
    });
    return response.body;
  }

  private async buildEntries(catalog: Catalog, network = false, channel: Channel = this.deps.channel()): Promise<CatalogEntry[]> {
    return Promise.all(catalog.apps.map(async (app) => {
      const stored = network ? await this.fetchRelease(app, channel) : this.storedRelease(app, channel);
      return {
        app,
        icon: await this.assetDataUrl(app, app.icon),
        release: stored?.release ?? null,
        releaseIssue: stored?.issue ?? null,
        releaseCheckedAt: stored?.checkedAt ?? null,
        requiresNewerHub: compareSemver(app.minHubVersion, this.deps.hubVersion) > 0,
      };
    }));
  }

  private storedRelease(app: CatalogApp, channel: Channel): StoredRelease | null {
    const raw = this.state(`release:${app.id}`);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw) as StoredRelease;
      return stored.channel === channel ? stored : null;
    } catch {
      return null;
    }
  }

  private async fetchRelease(app: CatalogApp, channel: Channel): Promise<StoredRelease> {
    const previous = this.storedRelease(app, channel);
    const checkedAt = this.now().toISOString();
    let result: StoredRelease;
    try {
      const url = `https://api.github.com/repos/${app.source.owner}/${app.source.repo}/releases?per_page=20`;
      const body = await this.cachedGet(url, RELEASES_MAX_BYTES, { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' });
      const release = pickRelease(parseReleases(JSON.parse(body.toString('utf8'))), channel);
      if (!release) {
        result = { channel, release: null, issue: 'no-release', checkedAt };
      } else {
        const info: ReleaseInfo = { version: release.version, tag: release.tag, name: release.name, publishedAt: release.publishedAt, notes: release.notes, prerelease: release.prerelease, installer: null };
        const feedAsset = release.assets.find((asset) => asset.name === app.windows.updateFeed);
        if (!feedAsset) {
          result = { channel, release: info, issue: 'no-feed', checkedAt };
        } else {
          const feed = parseUpdateFeed((await this.cachedGet(feedAsset.url, MAX_FEED_BYTES)).toString('utf8'));
          if (compareSemver(feed.version, release.version) !== 0) {
            throw new FeedError('ERR_FEED_VERSION_MISMATCH');
          }
          const file = selectInstaller(feed, release.assets.map((asset) => asset.name));
          const asset = release.assets.find((candidate) => candidate.name === file.url)!;
          if (asset.size !== file.size) {
            throw new FeedError('ERR_FEED_SIZE_MISMATCH');
          }
          info.installer = { fileName: file.url, size: file.size, sha512: file.sha512, url: asset.url };
          result = { channel, release: info, issue: null, checkedAt };
        }
      }
    } catch (error) {
      const issue = issueFor(error);
      // Offline or rate-limited: keep showing what was known, flagged.
      result = { channel, release: issue === 'offline' || issue === 'rate-limited' ? previous?.release ?? null : null, issue, checkedAt: previous?.checkedAt ?? checkedAt };
    }
    await this.setState({ [`release:${app.id}`]: JSON.stringify(result) });
    return result;
  }

  /** A declared icon or screenshot of a catalog app, as a data: URL (bundled copy first). */
  async getAsset(appId: string, assetPath: string): Promise<string | null> {
    const app = this.catalog?.catalog.apps.find((candidate) => candidate.id === appId);
    if (!app || (assetPath !== app.icon && !app.screenshots.includes(assetPath))) {
      return null;
    }
    return this.assetDataUrl(app, assetPath);
  }

  private async assetDataUrl(_app: CatalogApp, assetPath: string): Promise<string | null> {
    if (!isSafeAssetPath(assetPath)) {
      return null;
    }
    const mime = MIME[assetPath.split('.').pop()!.toLowerCase()];
    const local = path.resolve(this.deps.bundledDir, assetPath);
    if (local.startsWith(path.resolve(this.deps.bundledDir) + path.sep)) {
      try {
        return `data:${mime};base64,${(await fs.readFile(local)).toString('base64')}`;
      } catch {
        // Not shipped with this build: fetch it.
      }
    }
    try {
      const body = await this.cachedGet(`${this.deps.assetBase ?? REMOTE_ASSET_BASE}${assetPath}`, ASSET_MAX_BYTES);
      return `data:${mime};base64,${body.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
