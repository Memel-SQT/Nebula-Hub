import { isSafeFileName } from './latest-yml';
import { isSemver } from './semver';

/**
 * Catalog format, schema 1 (brief §6.2, documented in docs/CATALOG.md). The catalog is signed
 * (R03), but it is still validated field by field before use: a signature proves who wrote it,
 * not that it is well-formed, and every remote string that ends up in a path or a command line
 * is checked here (R11).
 *
 * Differences from the brief's sketch: `minHubVersion` replaces `minStoreVersion` (ADR-013);
 * `role: 'hub'` marks the Hub's own entry (listed, never uninstallable from itself);
 * `windows.preOperationBackup` is structured instead of a free command line.
 */
export const CATALOG_SCHEMA = 1;

export type Localized = { fr: string; en?: string };
export type AppCategory = 'finance' | 'info' | 'productivity' | 'system';
export type AppStatus = 'stable' | 'beta' | 'coming-soon' | 'deprecated';
export type InstallScope = 'user' | 'machine' | 'either';

export interface PreOperationBackup {
  /** Command-line switch the app understands, value appended: `--backup-before-uninstall=`. */
  argument: string;
  /** Folder created under the user's Documents. */
  documentsFolder: string;
  /** File name prefix; the Hub appends `-<timestamp>.json`. */
  filePrefix: string;
  /** Known content format the Hub can check after the backup ran. */
  format: 'finterest-backup-v1';
}

export interface CatalogApp {
  id: string;
  name: string;
  role?: 'hub';
  tagline: Localized;
  description: Localized;
  category: AppCategory;
  status: AppStatus;
  icon: string;
  screenshots: string[];
  source: { provider: 'github'; owner: string; repo: string };
  windows: {
    productName: string;
    appId: string;
    exeName: string;
    installScope: InstallScope;
    updateFeed: string;
    silentArgs: string[];
    selfUpdates: boolean;
    preOperationBackup?: PreOperationBackup;
  };
  dataNotice?: Localized;
  link?: { manifest: string; minProtocol: number };
  minHubVersion: string;
}

export interface Catalog {
  schema: typeof CATALOG_SCHEMA;
  generatedAt: string;
  apps: CatalogApp[];
}

export type CatalogValidation = { ok: true; catalog: Catalog } | { ok: false; errors: string[] };

const CATEGORIES: AppCategory[] = ['finance', 'info', 'productivity', 'system'];
const STATUSES: AppStatus[] = ['stable', 'beta', 'coming-soon', 'deprecated'];
const SCOPES: InstallScope[] = ['user', 'machine', 'either'];
const MAX_APPS = 50;

/** `icons/x.svg`, `screenshots/x.png`: relative to the catalog, one known folder, no traversal. */
export function isSafeAssetPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 120
    && /^(icons|screenshots)\/[a-z0-9][a-z0-9._-]*\.(svg|png|webp|jpg|jpeg)$/i.test(value)
    && !value.includes('..');
}

/** A single folder name for Documents\<name> (no separator, no drive, no traversal). */
export function isSafeFolderName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(value) && !value.includes('..') && !/[. ]$/.test(value);
}

/** Installer switches the catalog may add: `/S`-style or `--flag`, never data deletion (ADR-004). */
export function isAllowedInstallerArg(value: unknown): value is string {
  return typeof value === 'string' && (/^\/[A-Z]{1,16}$/.test(value) || /^--[a-z][a-z-]{1,30}$/.test(value)) && value !== '--delete-app-data';
}

class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  text(value: unknown, path: string, max: number): value is string {
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
      this.fail(path, `expected a non-empty string of at most ${max} characters`);
      return false;
    }
    return true;
  }

  pattern(value: unknown, path: string, pattern: RegExp, label: string): value is string {
    if (typeof value !== 'string' || !pattern.test(value)) {
      this.fail(path, `expected ${label}`);
      return false;
    }
    return true;
  }

  oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): value is T {
    if (!allowed.includes(value as T)) {
      this.fail(path, `expected one of ${allowed.join(', ')}`);
      return false;
    }
    return true;
  }

  localized(value: unknown, path: string, max: number): value is Localized {
    const record = asRecord(value);
    if (!record) {
      this.fail(path, 'expected { fr, en? }');
      return false;
    }
    const fr = this.text(record.fr, `${path}.fr`, max);
    const en = record.en === undefined || this.text(record.en, `${path}.en`, max);
    return fr && en;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickLocalized(value: unknown): Localized {
  const record = asRecord(value) ?? {};
  return record.en === undefined ? { fr: String(record.fr) } : { fr: String(record.fr), en: String(record.en) };
}

function validateApp(value: unknown, path: string, check: Checker): CatalogApp | null {
  const app = asRecord(value);
  if (!app) {
    check.fail(path, 'expected an object');
    return null;
  }
  const before = check.errors.length;
  check.pattern(app.id, `${path}.id`, /^nebula\.[a-z][a-z0-9-]{1,30}$/, 'nebula.<name>');
  check.text(app.name, `${path}.name`, 64);
  if (app.role !== undefined) check.oneOf(app.role, `${path}.role`, ['hub'] as const);
  check.localized(app.tagline, `${path}.tagline`, 120);
  check.localized(app.description, `${path}.description`, 2000);
  check.oneOf(app.category, `${path}.category`, CATEGORIES);
  check.oneOf(app.status, `${path}.status`, STATUSES);
  if (!isSafeAssetPath(app.icon)) check.fail(`${path}.icon`, 'expected icons/<file>.(svg|png|webp|jpg)');
  if (!Array.isArray(app.screenshots) || app.screenshots.length > 8 || !app.screenshots.every(isSafeAssetPath)) {
    check.fail(`${path}.screenshots`, 'expected at most 8 screenshots/<file> paths');
  }

  const source = asRecord(app.source);
  if (!source || source.provider !== 'github') {
    check.fail(`${path}.source`, 'expected { provider: "github", owner, repo }');
  } else {
    check.pattern(source.owner, `${path}.source.owner`, /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'a GitHub owner');
    check.pattern(source.repo, `${path}.source.repo`, /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/, 'a GitHub repository');
  }

  const windows = asRecord(app.windows);
  let backup: PreOperationBackup | undefined;
  if (!windows) {
    check.fail(`${path}.windows`, 'expected an object');
  } else {
    check.pattern(windows.productName, `${path}.windows.productName`, /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/, 'a product name');
    check.pattern(windows.appId, `${path}.windows.appId`, /^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/, 'a reverse-DNS appId');
    if (!isSafeFileName(windows.exeName) || !String(windows.exeName).toLowerCase().endsWith('.exe')) check.fail(`${path}.windows.exeName`, 'expected a bare .exe file name');
    check.oneOf(windows.installScope, `${path}.windows.installScope`, SCOPES);
    if (!isSafeFileName(windows.updateFeed) || !/\.ya?ml$/i.test(String(windows.updateFeed))) check.fail(`${path}.windows.updateFeed`, 'expected a bare .yml file name');
    if (!Array.isArray(windows.silentArgs) || windows.silentArgs.length > 4 || !windows.silentArgs.every(isAllowedInstallerArg)) {
      check.fail(`${path}.windows.silentArgs`, 'expected up to 4 allowed installer switches');
    }
    if (typeof windows.selfUpdates !== 'boolean') check.fail(`${path}.windows.selfUpdates`, 'expected a boolean');
    if (windows.preOperationBackup !== undefined) {
      const raw = asRecord(windows.preOperationBackup);
      if (
        !raw
        || !/^--[a-z][a-z-]{1,40}=$/.test(String(raw.argument))
        || !isSafeFolderName(raw.documentsFolder)
        || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(raw.filePrefix))
        || raw.format !== 'finterest-backup-v1'
      ) {
        check.fail(`${path}.windows.preOperationBackup`, 'expected { argument: "--x=", documentsFolder, filePrefix, format }');
      } else {
        backup = { argument: String(raw.argument), documentsFolder: String(raw.documentsFolder), filePrefix: String(raw.filePrefix), format: 'finterest-backup-v1' };
      }
    }
  }

  if (app.dataNotice !== undefined) check.localized(app.dataNotice, `${path}.dataNotice`, 600);
  const link = app.link === undefined ? undefined : asRecord(app.link);
  if (app.link !== undefined && (!link || !isSafeFileName(link.manifest) || !Number.isInteger(link.minProtocol) || Number(link.minProtocol) < 1)) {
    check.fail(`${path}.link`, 'expected { manifest: <file name>, minProtocol: integer >= 1 }');
  }
  if (!isSemver(app.minHubVersion)) check.fail(`${path}.minHubVersion`, 'expected a semantic version');

  if (check.errors.length > before || !windows || !source) {
    return null;
  }
  return {
    id: String(app.id),
    name: String(app.name),
    ...(app.role === 'hub' ? { role: 'hub' as const } : {}),
    tagline: pickLocalized(app.tagline),
    description: pickLocalized(app.description),
    category: app.category as AppCategory,
    status: app.status as AppStatus,
    icon: String(app.icon),
    screenshots: (app.screenshots as string[]).slice(),
    source: { provider: 'github', owner: String(source.owner), repo: String(source.repo) },
    windows: {
      productName: String(windows.productName),
      appId: String(windows.appId),
      exeName: String(windows.exeName),
      installScope: windows.installScope as InstallScope,
      updateFeed: String(windows.updateFeed),
      silentArgs: (windows.silentArgs as string[]).slice(),
      selfUpdates: Boolean(windows.selfUpdates),
      ...(backup ? { preOperationBackup: backup } : {}),
    },
    ...(app.dataNotice !== undefined ? { dataNotice: pickLocalized(app.dataNotice) } : {}),
    ...(link ? { link: { manifest: String(link.manifest), minProtocol: Number(link.minProtocol) } } : {}),
    minHubVersion: String(app.minHubVersion),
  };
}

/** Strict validation: any invalid field rejects the whole catalog (it is signed and versioned as one unit). */
export function validateCatalog(value: unknown): CatalogValidation {
  const check = new Checker();
  const root = asRecord(value);
  if (!root) {
    return { ok: false, errors: ['$: expected an object'] };
  }
  if (root.schema !== CATALOG_SCHEMA) check.fail('$.schema', `expected ${CATALOG_SCHEMA}`);
  if (typeof root.generatedAt !== 'string' || Number.isNaN(Date.parse(root.generatedAt))) check.fail('$.generatedAt', 'expected an ISO date');
  if (!Array.isArray(root.apps) || root.apps.length === 0 || root.apps.length > MAX_APPS) {
    check.fail('$.apps', `expected 1 to ${MAX_APPS} apps`);
    return { ok: false, errors: check.errors };
  }
  const apps = root.apps.map((app, index) => validateApp(app, `$.apps[${index}]`, check));
  const ids = new Set<string>();
  const appIds = new Set<string>();
  apps.forEach((app, index) => {
    if (!app) return;
    if (ids.has(app.id)) check.fail(`$.apps[${index}].id`, 'duplicate id');
    if (appIds.has(app.windows.appId)) check.fail(`$.apps[${index}].windows.appId`, 'duplicate appId');
    ids.add(app.id);
    appIds.add(app.windows.appId);
  });
  if (apps.filter((app) => app?.role === 'hub').length > 1) check.fail('$.apps', 'at most one app with role "hub"');
  if (check.errors.length > 0) {
    return { ok: false, errors: check.errors };
  }
  return { ok: true, catalog: { schema: CATALOG_SCHEMA, generatedAt: String(root.generatedAt), apps: apps as CatalogApp[] } };
}

/** Text in the UI language, French as the fallback (brief §11). */
export function localize(text: Localized, language: 'fr' | 'en'): string {
  return language === 'en' && text.en ? text.en : text.fr;
}
