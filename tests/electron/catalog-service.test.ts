/**
 * @jest-environment node
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CatalogService, type RemoteSource } from '../../src/electron/catalog/catalog-service';
import { HubDatabase } from '../../src/electron/db';
import { NetError, type GetOptions, type GetResult } from '../../src/electron/net/http';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const REPO_CATALOG = path.join(__dirname, '../../catalog');

const SOURCES: RemoteSource[] = [
  { id: 'raw', catalogUrl: 'https://raw.githubusercontent.com/x/catalog.json', signatureUrl: 'https://raw.githubusercontent.com/x/catalog.json.sig' },
  { id: 'release', catalogUrl: 'https://github.com/x/catalog.json', signatureUrl: 'https://github.com/x/catalog.json.sig' },
];

const FEED = (version: string, sha = 'jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==') => `version: ${version}
files:
  - url: Nebula-Finterest-Setup-${version}.exe
    sha512: ${sha}
    size: 88626634
path: Nebula-Finterest-Setup-${version}.exe
sha512: ${sha}
releaseDate: '2026-10-01T09:10:44.092Z'
`;

function releasesJson(version: string, prerelease = false) {
  return JSON.stringify([{
    tag_name: `v${version}`, name: `v${version}`, draft: false, prerelease, published_at: '2026-10-01T09:12:04Z', body: '## Notes\n- Something',
    assets: [
      { name: 'latest.yml', size: 363, browser_download_url: `https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v${version}/latest.yml` },
      { name: `Nebula-Finterest-Setup-${version}.exe`, size: 88626634, browser_download_url: `https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v${version}/Nebula-Finterest-Setup-${version}.exe` },
    ],
  }]);
}

async function catalogBytes(generatedAt: string): Promise<Buffer> {
  const json = JSON.parse(await fs.readFile(path.join(REPO_CATALOG, 'nebula-catalog.json'), 'utf8'));
  json.generatedAt = generatedAt;
  return Buffer.from(JSON.stringify(json, null, 2));
}

function sign(bytes: Buffer): string {
  return `${crypto.sign(null, bytes, privateKey).toString('base64')}\n`;
}

type Route = Buffer | string | NetError | ((options: GetOptions) => GetResult | Promise<GetResult>);

function fakeHttp(routes: Map<string, Route>) {
  const calls: Array<{ url: string; etag: string | null | undefined }> = [];
  const http = async (url: string, options: GetOptions): Promise<GetResult> => {
    calls.push({ url, etag: options.etag });
    const route = routes.get(url) ?? [...routes.entries()].find(([pattern]) => pattern.endsWith('*') && url.startsWith(pattern.slice(0, -1)))?.[1];
    if (route === undefined) throw new NetError('ERR_NET_STATUS', { url, status: 404 });
    if (route instanceof NetError) throw route;
    if (typeof route === 'function') return route(options);
    const body = Buffer.isBuffer(route) ? route : Buffer.from(route);
    return { status: 200, url, headers: {}, body, etag: `"${crypto.createHash('md5').update(body).digest('hex')}"`, notModified: false };
  };
  return { http, calls };
}

let bundledDir = '';

beforeEach(async () => {
  bundledDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-bundled-'));
  await fs.cp(path.join(REPO_CATALOG, 'icons'), path.join(bundledDir, 'icons'), { recursive: true });
  const bundled = await catalogBytes('2026-10-01T12:00:00Z');
  await fs.writeFile(path.join(bundledDir, 'nebula-catalog.json'), bundled);
  await fs.writeFile(path.join(bundledDir, 'nebula-catalog.json.sig'), sign(bundled));
});

afterEach(async () => {
  await fs.rm(bundledDir, { recursive: true, force: true });
});

async function service(routes: Map<string, Route>, options: { channel?: 'stable' | 'beta'; db?: HubDatabase; now?: () => Date } = {}) {
  const db = options.db ?? HubDatabase.inMemory();
  await db.initialize();
  const fake = fakeHttp(routes);
  const catalog = new CatalogService({
    http: fake.http, db, publicKey: PUBLIC_PEM, bundledDir, hubVersion: '0.1.0', channel: () => options.channel ?? 'stable', sources: SOURCES, assetBase: 'https://raw.githubusercontent.com/x/', now: options.now,
  });
  return { catalog, db, calls: fake.calls };
}

async function onlineRoutes(generatedAt = '2026-10-02T00:00:00Z'): Promise<Map<string, Route>> {
  const remote = await catalogBytes(generatedAt);
  return new Map<string, Route>([
    [SOURCES[0].catalogUrl, remote],
    [SOURCES[0].signatureUrl, sign(remote)],
    ['https://api.github.com/repos/Memel-SQT/Nebula-Finterest/releases?per_page=20', releasesJson('0.1.36')],
    ['https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.36/latest.yml', FEED('0.1.36')],
    ['https://api.github.com/repos/Memel-SQT/nebula-clock/releases?per_page=20', '[]'],
    ['https://api.github.com/repos/Memel-SQT/Nebula-News/releases?per_page=20', '[]'],
  ]);
}

describe('CatalogService', () => {
  it('shows the bundled catalog before any network access', async () => {
    const { catalog, calls } = await service(new Map());
    const view = await catalog.loadLocal();
    expect(view.state).toBe('ready');
    expect(view.source).toBe('bundled');
    expect(view.entries.map((entry) => entry.app.id)).toContain('nebula.finterest');
    expect(view.entries[0].icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(calls).toEqual([]);
  });

  it('takes a valid remote catalog and reads the release, its feed and its installer', async () => {
    const { catalog } = await service(await onlineRoutes());
    const view = await catalog.refresh(true);
    expect(view.state).toBe('ready');
    expect(view.source).toBe('raw');
    expect(view.warning).toBeNull();
    const finterest = view.entries.find((entry) => entry.app.id === 'nebula.finterest')!;
    expect(finterest.release).toMatchObject({ version: '0.1.36', notes: '## Notes\n- Something' });
    expect(finterest.release?.installer).toEqual({
      fileName: 'Nebula-Finterest-Setup-0.1.36.exe',
      size: 88626634,
      sha512: 'jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==',
      url: 'https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.36/Nebula-Finterest-Setup-0.1.36.exe',
    });
    expect(view.entries.find((entry) => entry.app.id === 'nebula.clock')!.releaseIssue).toBe('no-release');
    expect(view.syncedAt).not.toBeNull();
  });

  it('rejects a tampered catalog (R03), warns, and keeps the last valid one', async () => {
    const routes = await onlineRoutes();
    const tampered = Buffer.from((routes.get(SOURCES[0].catalogUrl) as Buffer).toString().replace('Votre budget, simplement', 'Votre budget, piraté'));
    routes.set(SOURCES[0].catalogUrl, tampered);
    const { catalog } = await service(routes);
    const view = await catalog.refresh(true);
    expect(view.warning).toBe('signature-invalid');
    expect(view.source).toBe('bundled');
    expect(view.entries[0].app.tagline.fr).toBe('Votre budget, simplement');
  });

  it('rejects a validly signed but invalid catalog the same way', async () => {
    const routes = await onlineRoutes();
    const json = JSON.parse((routes.get(SOURCES[0].catalogUrl) as Buffer).toString());
    json.apps[0].icon = '../../evil.svg';
    const bytes = Buffer.from(JSON.stringify(json));
    routes.set(SOURCES[0].catalogUrl, bytes);
    routes.set(SOURCES[0].signatureUrl, sign(bytes));
    const { catalog } = await service(routes);
    expect((await catalog.refresh(true)).warning).toBe('signature-invalid');
  });

  it('falls back to the second source', async () => {
    const routes = await onlineRoutes();
    routes.set(SOURCES[1].catalogUrl, routes.get(SOURCES[0].catalogUrl)!);
    routes.set(SOURCES[1].signatureUrl, routes.get(SOURCES[0].signatureUrl)!);
    routes.delete(SOURCES[0].catalogUrl);
    const { catalog } = await service(routes);
    expect((await catalog.refresh(true)).source).toBe('release');
  });

  it('refuses to roll back to an older signed catalog', async () => {
    const { catalog } = await service(await onlineRoutes('2026-09-01T00:00:00Z'));
    expect((await catalog.refresh(true)).source).toBe('bundled');
  });

  it('keeps everything visible offline, with the last sync date', async () => {
    const db = HubDatabase.inMemory();
    const online = await service(await onlineRoutes(), { db });
    const first = await online.catalog.refresh(true);

    const offlineRoutes = new Map<string, Route>([['https://*', new NetError('ERR_NET_OFFLINE')]]);
    const offline = await service(offlineRoutes, { db });
    await offline.catalog.loadLocal();
    const view = await offline.catalog.refresh(true);
    expect(view.state).toBe('offline');
    expect(view.source).toBe('cache');
    expect(view.syncedAt).toBe(first.syncedAt);
    const finterest = view.entries.find((entry) => entry.app.id === 'nebula.finterest')!;
    expect(finterest.release?.version).toBe('0.1.36');
    expect(finterest.releaseIssue).toBe('offline');
  });

  it('uses conditional requests: a 304 serves the cached body', async () => {
    const routes = await onlineRoutes();
    const db = HubDatabase.inMemory();
    const first = await service(routes, { db });
    await first.catalog.refresh(true);
    const api = 'https://api.github.com/repos/Memel-SQT/Nebula-Finterest/releases?per_page=20';
    routes.set(api, (options) => {
      expect(options.etag).toMatch(/^"/);
      return { status: 304, url: api, headers: {}, body: Buffer.alloc(0), etag: options.etag ?? null, notModified: true };
    });
    const second = await service(routes, { db });
    const view = await second.catalog.refresh(true);
    expect(view.entries.find((entry) => entry.app.id === 'nebula.finterest')!.release?.version).toBe('0.1.36');
  });

  it('does not hit the network again within 6 hours unless forced', async () => {
    const routes = await onlineRoutes();
    const { catalog, calls } = await service(routes);
    await catalog.refresh(true);
    const count = calls.length;
    await catalog.refresh();
    expect(calls.length).toBe(count);
    await catalog.refresh(true);
    expect(calls.length).toBeGreaterThan(count);
  });

  it('flags a rate-limited API without losing the known release', async () => {
    const routes = await onlineRoutes();
    const db = HubDatabase.inMemory();
    await (await service(routes, { db })).catalog.refresh(true);
    routes.set('https://api.github.com/repos/Memel-SQT/Nebula-Finterest/releases?per_page=20', new NetError('ERR_NET_RATE_LIMITED', { resetAt: '2026-10-01T13:00:00.000Z' }));
    const view = await (await service(routes, { db })).catalog.refresh(true);
    const finterest = view.entries.find((entry) => entry.app.id === 'nebula.finterest')!;
    expect(finterest.releaseIssue).toBe('rate-limited');
    expect(finterest.release?.version).toBe('0.1.36');
  });

  it('refuses a feed that disagrees with its release', async () => {
    const routes = await onlineRoutes();
    routes.set('https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.36/latest.yml', FEED('0.1.35'));
    const view = await (await service(routes)).catalog.refresh(true);
    const finterest = view.entries.find((entry) => entry.app.id === 'nebula.finterest')!;
    expect(finterest.releaseIssue).toBe('feed-invalid');
    expect(finterest.release).toBeNull();
  });

  it('follows the channel: beta sees pre-releases', async () => {
    const routes = await onlineRoutes();
    routes.set('https://api.github.com/repos/Memel-SQT/Nebula-Finterest/releases?per_page=20', releasesJson('0.2.0-beta.1', true));
    routes.set('https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.2.0-beta.1/latest.yml', FEED('0.2.0-beta.1'));
    const stable = await (await service(routes)).catalog.refresh(true);
    expect(stable.entries[0].releaseIssue).toBe('no-release');
    const beta = await (await service(routes, { channel: 'beta' })).catalog.refresh(true);
    expect(beta.entries[0].release?.version).toBe('0.2.0-beta.1');
  });

  it('serves only assets the catalog declares', async () => {
    const { catalog } = await service(new Map());
    await catalog.loadLocal();
    expect(await catalog.getAsset('nebula.finterest', 'icons/finterest.svg')).toMatch(/^data:image\/svg\+xml/);
    expect(await catalog.getAsset('nebula.finterest', 'icons/clock.svg')).toBeNull();
    expect(await catalog.getAsset('nebula.finterest', '../../package.json')).toBeNull();
    expect(await catalog.getAsset('nebula.unknown', 'icons/finterest.svg')).toBeNull();
  });
});
