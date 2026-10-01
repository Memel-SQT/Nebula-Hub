import fs from 'node:fs';
import path from 'node:path';
import { validateCatalog } from '../../src/shared/catalog';
import { EMPTY_CATALOG_VIEW, type CatalogEntry, type CatalogView } from '../../src/shared/catalog-view';

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
