import { isSchemaName, type SchemaName } from './schemas';

/**
 * `nebula.app.json` (docs/NEBULA_LINK.md § 5): what an app offers and uses on Link. Parsed field
 * by field; one invalid known field makes the whole manifest invalid (the app is then not admitted
 * on Link), unknown fields are ignored (additive changes stay compatible).
 */
export type CapabilityKind = 'query' | 'event' | 'intent' | 'widget';
export type Sensitivity = 'public' | 'private';
export type ParamType = 'date' | 'month' | 'integer' | 'text' | readonly string[];

export interface Localized { fr: string; en?: string }

export interface Capability {
  id: string;
  kind: CapabilityKind;
  sensitivity: Sensitivity;
  title: Localized;
  description: Localized;
  /** query and widget results. */
  resultSchema?: SchemaName;
  /** event and intent payloads. */
  payloadSchema?: SchemaName;
  /** widget only: the Hub refreshes it at most this often (≥ 60 s). */
  refreshSeconds?: number;
  /** intent only: the deep link path it opens. */
  path?: string;
}

export interface DeepLinkSpec { path: string; params: Record<string, ParamType> }

export interface Manifest {
  schema: 1;
  appId: string;
  provides: Capability[];
  consumes: Array<{ id: string; kind: CapabilityKind }>;
  deepLinks: DeepLinkSpec[];
}

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; errors: string[] };

export const MAX_MANIFEST_BYTES = 64 * 1024;
export const APP_ID = /^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/;
export const CAPABILITY_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){1,4}$/;
export const DEEP_LINK_PATH = /^\/[a-z0-9/-]{0,60}$/;
const PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,30}$/;
const KINDS: readonly CapabilityKind[] = ['query', 'event', 'intent', 'widget'];

/** `nebula.finterest` → `finterest`: capability prefix and deep link host (§ 5.1). */
export function shortName(appId: string): string {
  return appId.startsWith('nebula.') ? appId.slice('nebula.'.length) : appId;
}

/** The app that provides a capability, from its prefix (`nebula.*` is the Hub's). */
export function providerOf(capability: string): string {
  const prefix = capability.split('.')[0];
  return prefix === 'nebula' || prefix === 'hub' ? 'nebula.hub' : `nebula.${prefix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function localized(value: unknown, max: number): Localized | null {
  if (!isRecord(value) || typeof value.fr !== 'string' || !value.fr.trim() || value.fr.length > max) return null;
  if (value.en !== undefined && (typeof value.en !== 'string' || value.en.length > max)) return null;
  return value.en === undefined ? { fr: value.fr } : { fr: value.fr, en: value.en };
}

function paramType(value: unknown): ParamType | null {
  if (value === 'date' || value === 'month' || value === 'integer' || value === 'text') return value;
  if (Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every((item) => typeof item === 'string' && /^[a-z0-9-]{1,30}$/.test(item))) return value as string[];
  return null;
}

export function parseManifest(value: unknown): ManifestResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['$: expected an object'] };
  if (value.schema !== 1) errors.push('$.schema: expected 1');
  const appId = value.appId;
  if (typeof appId !== 'string' || !APP_ID.test(appId)) errors.push('$.appId: expected an app id');
  const prefix = typeof appId === 'string' ? `${shortName(appId)}.` : '\0';

  const provides: Capability[] = [];
  const rawProvides = value.provides ?? [];
  if (!Array.isArray(rawProvides) || rawProvides.length > 50) errors.push('$.provides: expected at most 50 capabilities');
  else {
    const seen = new Set<string>();
    rawProvides.forEach((raw, index) => {
      const at = `$.provides[${index}]`;
      if (!isRecord(raw)) return void errors.push(`${at}: expected an object`);
      const id = raw.id;
      if (typeof id !== 'string' || !CAPABILITY_ID.test(id) || !id.startsWith(prefix)) return void errors.push(`${at}.id: expected "${prefix}…"`);
      if (seen.has(id)) return void errors.push(`${at}.id: duplicate`);
      seen.add(id);
      const kind = raw.kind as CapabilityKind;
      if (!KINDS.includes(kind)) return void errors.push(`${at}.kind: expected query, event, intent or widget`);
      if (raw.sensitivity !== 'public' && raw.sensitivity !== 'private') return void errors.push(`${at}.sensitivity: expected public or private`);
      const title = localized(raw.title, 80);
      const description = localized(raw.description, 300);
      if (!title || !description) return void errors.push(`${at}: title (80) and description (300) need at least "fr"`);
      const capability: Capability = { id, kind, sensitivity: raw.sensitivity, title, description };
      if (kind === 'query' || kind === 'widget') {
        if (!isSchemaName(raw.resultSchema)) return void errors.push(`${at}.resultSchema: unknown schema`);
        capability.resultSchema = raw.resultSchema;
      } else {
        if (!isSchemaName(raw.payloadSchema)) return void errors.push(`${at}.payloadSchema: unknown schema`);
        capability.payloadSchema = raw.payloadSchema;
      }
      if (kind === 'widget') {
        if (!Number.isInteger(raw.refreshSeconds) || (raw.refreshSeconds as number) < 60 || (raw.refreshSeconds as number) > 86_400) return void errors.push(`${at}.refreshSeconds: expected 60…86400`);
        capability.refreshSeconds = raw.refreshSeconds as number;
      }
      if (kind === 'intent') {
        if (typeof raw.path !== 'string' || !DEEP_LINK_PATH.test(raw.path)) return void errors.push(`${at}.path: expected a deep link path`);
        capability.path = raw.path;
      }
      provides.push(capability);
    });
  }

  const consumes: Manifest['consumes'] = [];
  const rawConsumes = value.consumes ?? [];
  if (!Array.isArray(rawConsumes) || rawConsumes.length > 50) errors.push('$.consumes: expected at most 50 entries');
  else {
    rawConsumes.forEach((raw, index) => {
      if (!isRecord(raw) || typeof raw.id !== 'string' || !CAPABILITY_ID.test(raw.id) || !KINDS.includes(raw.kind as CapabilityKind)) {
        errors.push(`$.consumes[${index}]: expected { id, kind }`);
        return;
      }
      consumes.push({ id: raw.id, kind: raw.kind as CapabilityKind });
    });
  }

  const deepLinks: DeepLinkSpec[] = [];
  const rawLinks = value.deepLinks ?? [];
  if (!Array.isArray(rawLinks) || rawLinks.length > 30) errors.push('$.deepLinks: expected at most 30 links');
  else {
    rawLinks.forEach((raw, index) => {
      const at = `$.deepLinks[${index}]`;
      if (!isRecord(raw) || typeof raw.path !== 'string' || !DEEP_LINK_PATH.test(raw.path)) return void errors.push(`${at}.path: expected "/…"`);
      const params: Record<string, ParamType> = {};
      const rawParams = raw.params ?? {};
      if (!isRecord(rawParams) || Object.keys(rawParams).length > 10) return void errors.push(`${at}.params: expected at most 10 parameters`);
      for (const [name, type] of Object.entries(rawParams)) {
        const parsed = paramType(type);
        if (!PARAM_NAME.test(name) || !parsed) return void errors.push(`${at}.params.${name}: expected date, month, integer, text or a list`);
        params[name] = parsed;
      }
      deepLinks.push({ path: raw.path, params });
    });
  }

  for (const capability of provides) {
    if (capability.path && !deepLinks.some((link) => link.path === capability.path)) errors.push(`$.provides: intent ${capability.id} opens ${capability.path}, which is not in deepLinks`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: { schema: 1, appId: appId as string, provides, consumes, deepLinks } };
}

/** Parses the raw bytes of a manifest file (size limit included). */
export function parseManifestBytes(bytes: Buffer | string): ManifestResult {
  const size = Buffer.byteLength(bytes);
  if (size > MAX_MANIFEST_BYTES) return { ok: false, errors: ['$: larger than 64 KiB'] };
  try {
    return parseManifest(JSON.parse(bytes.toString()));
  } catch {
    return { ok: false, errors: ['$: not JSON'] };
  }
}

export function capabilityOf(manifest: Manifest, id: string): Capability | undefined {
  return manifest.provides.find((capability) => capability.id === id);
}

export function consumesCapability(manifest: Manifest, id: string): boolean {
  return manifest.consumes.some((entry) => entry.id === id);
}
