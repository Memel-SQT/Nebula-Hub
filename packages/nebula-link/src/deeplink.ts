import type { Manifest, ParamType } from './manifest';
import { DEEP_LINK_PATH } from './manifest';

/**
 * `nebula://<app>/<path>?<params>` links and the `--nebula-intent=<base64url JSON>` argument
 * (docs/NEBULA_LINK.md § 7). Everything is checked against the target's manifest: an undeclared
 * path, an undeclared parameter or a value of the wrong type is refused.
 */
export interface Intent {
  path: string;
  params: Record<string, string>;
  /** App id that asked for it (`nebula.hub` for a link opened from Windows). */
  source: string;
}

export interface ParsedLink { host: string; path: string; params: Record<string, string> }

export const MAX_LINK_LENGTH = 2000;
const HOST = /^[a-z0-9-]{1,40}$/;

export function parseDeepLink(value: unknown): ParsedLink | null {
  if (typeof value !== 'string' || value.length > MAX_LINK_LENGTH || !value.startsWith('nebula://')) return null;
  // `.` and `..` segments would be silently normalized by the URL parser: refuse them outright.
  if (/\/\.{1,2}(?=\/|\?|$)/.test(value.slice('nebula://'.length))) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'nebula:' || url.username || url.password || url.port || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (!HOST.test(host)) return null;
  const path = url.pathname === '' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  if (!DEEP_LINK_PATH.test(path)) return null;
  const params: Record<string, string> = {};
  for (const [name, content] of url.searchParams) {
    if (name in params) return null;
    params[name] = content;
  }
  return { host, path, params };
}

function valueMatches(type: ParamType, value: string): boolean {
  if (Array.isArray(type)) return type.includes(value);
  switch (type) {
    case 'date':
      return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
    case 'month':
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    case 'integer':
      return /^\d{1,10}$/.test(value) && Number(value) <= 1e9;
    case 'text':
      return value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
    default:
      return false;
  }
}

/** True when the manifest declares this path and every parameter with a valid value. */
export function isDeclaredIntent(manifest: Manifest, path: string, params: Record<string, string>): boolean {
  const spec = manifest.deepLinks.find((link) => link.path === path);
  if (!spec) return false;
  return Object.entries(params).every(([name, value]) => name in spec.params && typeof value === 'string' && valueMatches(spec.params[name], value));
}

export const INTENT_ARG = '--nebula-intent=';

export function encodeIntentArg(intent: Intent): string {
  return `${INTENT_ARG}${Buffer.from(JSON.stringify(intent)).toString('base64url')}`;
}

/** The intent passed on the command line, if any and well-formed (the app re-checks its manifest). */
export function intentFromArgv(argv: readonly string[]): Intent | null {
  const arg = argv.find((candidate) => candidate.startsWith(INTENT_ARG));
  if (!arg || arg.length > INTENT_ARG.length + 4 * MAX_LINK_LENGTH) return null;
  try {
    const value = JSON.parse(Buffer.from(arg.slice(INTENT_ARG.length), 'base64url').toString('utf8')) as unknown;
    if (!value || typeof value !== 'object') return null;
    const { path, params, source } = value as Record<string, unknown>;
    if (typeof path !== 'string' || !DEEP_LINK_PATH.test(path) || typeof source !== 'string' || source.length > 80) return null;
    if (!params || typeof params !== 'object' || Array.isArray(params) || !Object.values(params).every((item) => typeof item === 'string')) return null;
    return { path, params: params as Record<string, string>, source };
  } catch {
    return null;
  }
}
