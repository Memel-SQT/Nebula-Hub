import fs from 'node:fs';
import path from 'node:path';
import { validateCatalog } from '../../src/shared/catalog';
import { EMPTY_CATALOG_VIEW, type CatalogEntry, type CatalogView } from '../../src/shared/catalog-view';
import type { DownloadsView, HistoryEntry, OperationView } from '../../src/shared/install-state';
import type { InstalledView } from '../../src/shared/installed-view';

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../catalog/nebula-catalog.json'), 'utf8'));
const validation = validateCatalog(raw);
if (!validation.ok) {
  throw new Error(validation.errors.join('\n'));
}
export const CATALOG = validation.catalog;

const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';

export function entries(): CatalogEntry[] {
  return CATALOG.apps.map((app) => ({
    app,
    icon: ICON,
    release: app.id === 'nebula.finterest'
      ? {
          version: '0.1.36',
          tag: 'v0.1.36',
          name: 'Nebula Finterest 0.1.36',
          publishedAt: '2026-10-01T09:12:04Z',
          notes: '## Nouveautés\n- **Icônes** redessinées\n\n[Toutes les versions](https://github.com/Memel-SQT/Nebula-Finterest/releases)',
          prerelease: false,
          installer: { fileName: 'Nebula-Finterest-Setup-0.1.36.exe', size: 88626634, sha512: 'x', url: 'https://github.com/x' },
        }
      : null,
    releaseIssue: app.id === 'nebula.clock' ? 'rate-limited' : app.id === 'nebula.news' ? 'no-release' : null,
    releaseCheckedAt: '2026-10-01T10:00:00Z',
    requiresNewerHub: false,
  }));
}

export function catalogView(patch: Partial<CatalogView> = {}): CatalogView {
  return {
    ...EMPTY_CATALOG_VIEW,
    state: 'ready',
    entries: entries(),
    source: 'raw',
    generatedAt: CATALOG.generatedAt,
    syncedAt: '2026-10-01T10:00:00Z',
    publicKeyFingerprint: 'ABCD 1234',
    sources: [{ id: 'raw', url: 'https://raw.githubusercontent.com/x' }, { id: 'bundled', url: 'app' }],
    ...patch,
  };
}

export function installedView(patch: Partial<InstalledView> = {}): InstalledView {
  return {
    state: 'ready',
    detectedAt: '2026-10-01T10:05:00Z',
    apps: [
      { appId: 'nebula.finterest', version: '0.1.35', scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest', exeFound: true, running: false },
      { appId: 'nebula.clock', version: '1.1.3', scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\Nebula Clock', exeFound: true, running: true },
      { appId: 'nebula.news', version: '0.1.0', scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\Nebula News', exeFound: false, running: false },
    ],
    ...patch,
  };
}

export function operation(patch: Partial<OperationView> = {}): OperationView {
  return {
    id: 'op-1',
    appId: 'nebula.finterest',
    kind: 'install',
    version: '0.1.36',
    fromVersion: null,
    phase: 'downloading',
    failure: null,
    failureDetail: null,
    received: 44_313_317,
    total: 88_626_634,
    bytesPerSecond: 3_145_728,
    etaSeconds: 14,
    resumed: false,
    queuedAt: '2026-10-01T10:10:00Z',
    finishedAt: null,
    ...patch,
  };
}

export function historyEntry(patch: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 1,
    appId: 'nebula.clock',
    kind: 'install',
    version: '1.1.3',
    fromVersion: null,
    outcome: 'success',
    failure: null,
    detail: null,
    startedAt: '2026-10-01T09:00:00Z',
    finishedAt: '2026-10-01T09:01:00Z',
    ...patch,
  };
}

export function downloadsView(patch: Partial<DownloadsView> = {}): DownloadsView {
  return { operations: [operation()], history: [historyEntry()], ...patch };
}
