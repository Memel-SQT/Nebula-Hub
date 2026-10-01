/**
 * Network allowlist (rule R05): HTTPS only, to a closed list of hosts; credentials in the URL
 * and non-default ports are refused. Every request and every redirect hop is checked against
 * the policy, in the main process only (the renderer has no network at all).
 */
export interface NetPolicy {
  protocols: readonly string[];
  hosts: readonly string[];
  /** Ports allowed besides the protocol default (tests only). */
  ports?: readonly string[];
}

export const ALLOWED_HOSTS = [
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
  'git.rodriguesnoa.fr',
] as const;

export const PRODUCTION_POLICY: NetPolicy = { protocols: ['https:'], hosts: ALLOWED_HOSTS };

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: 'invalid' | 'protocol' | 'host' | 'credentials' | 'port' };

export function checkUrl(value: string, policy: NetPolicy = PRODUCTION_POLICY): UrlCheck {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!policy.protocols.includes(url.protocol)) {
    return { ok: false, reason: 'protocol' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials' };
  }
  // Exact host match: no subdomain wildcard, and the URL parser has already lower-cased and
  // punycode-normalized the host, so look-alike tricks do not pass.
  if (!policy.hosts.includes(url.hostname)) {
    return { ok: false, reason: 'host' };
  }
  if (url.port && !(policy.ports ?? []).includes(url.port)) {
    return { ok: false, reason: 'port' };
  }
  return { ok: true, url };
}
