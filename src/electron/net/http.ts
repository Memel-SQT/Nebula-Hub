import http from 'node:http';
import https from 'node:https';
import { checkUrl, PRODUCTION_POLICY, type NetPolicy } from '../../shared/net-policy';

/**
 * The only way the Hub talks to the network (rule R05). Every URL — including every redirect
 * hop — is checked against the allowlist before a socket is opened; responses are size-capped
 * and time-limited. Buffered GET for small resources (catalog, GitHub API, feeds, images);
 * installers go through the streaming downloader (`download.ts`), which applies the same policy.
 */
export class NetError extends Error {
  constructor(
    readonly code: 'ERR_NET_BLOCKED' | 'ERR_NET_OFFLINE' | 'ERR_NET_TIMEOUT' | 'ERR_NET_TOO_LARGE' | 'ERR_NET_STATUS' | 'ERR_NET_REDIRECTS' | 'ERR_NET_RATE_LIMITED',
    readonly detail: { url?: string; status?: number; reason?: string; resetAt?: string } = {},
  ) {
    super(code);
    this.name = 'NetError';
  }
}

export interface GetOptions {
  maxBytes: number;
  headers?: Record<string, string>;
  /** Sent as If-None-Match; a 304 answer comes back as `notModified`. */
  etag?: string | null;
  timeoutMs?: number;
  maxRedirects?: number;
  policy?: NetPolicy;
}

export interface GetResult {
  status: number;
  /** URL that finally answered, after redirects. */
  url: string;
  headers: Record<string, string>;
  body: Buffer;
  etag: string | null;
  notModified: boolean;
}

export type HttpGet = (url: string, options: GetOptions) => Promise<GetResult>;

export const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT']);
export const USER_AGENT = 'NebulaHub (+https://github.com/Memel-SQT/Nebula-Hub)';

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : value ?? '';
}

function once(url: URL, options: GetOptions): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const client = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, 'accept-encoding': 'identity', ...options.headers };
  if (options.etag) {
    headers['if-none-match'] = options.etag;
  }
  return new Promise((resolve, reject) => {
    const request = client.get(url, { headers, timeout: options.timeoutMs ?? 20_000 }, (response) => {
      const status = response.statusCode ?? 0;
      const declared = Number(response.headers['content-length']);
      if (status >= 200 && status < 300 && Number.isFinite(declared) && declared > options.maxBytes) {
        response.destroy();
        reject(new NetError('ERR_NET_TOO_LARGE', { url: url.href }));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > options.maxBytes) {
          response.destroy();
          reject(new NetError('ERR_NET_TOO_LARGE', { url: url.href }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', (error: NodeJS.ErrnoException) => reject(OFFLINE_CODES.has(error.code ?? '') ? new NetError('ERR_NET_OFFLINE', { url: url.href }) : error));
    });
    request.on('timeout', () => request.destroy(new NetError('ERR_NET_TIMEOUT', { url: url.href })));
    request.on('error', (error: NodeJS.ErrnoException) => {
      if (error instanceof NetError) reject(error);
      else reject(OFFLINE_CODES.has(error.code ?? '') ? new NetError('ERR_NET_OFFLINE', { url: url.href, reason: error.code }) : error);
    });
  });
}

export const httpGet: HttpGet = async (startUrl, options) => {
  const policy = options.policy ?? PRODUCTION_POLICY;
  let current = startUrl;
  for (let hop = 0; hop <= (options.maxRedirects ?? 5); hop += 1) {
    const check = checkUrl(current, policy);
    if (!check.ok) {
      throw new NetError('ERR_NET_BLOCKED', { url: current, reason: check.reason });
    }
    // The ETag belongs to the first URL only; redirect targets are fetched fresh.
    const response = await once(check.url, hop === 0 ? options : { ...options, etag: null });
    const { status, headers } = response;
    if ([301, 302, 303, 307, 308].includes(status) && headers.location) {
      current = new URL(headerValue(headers.location), check.url).href;
      continue;
    }
    const flatHeaders = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, headerValue(value)]));
    if (status === 304) {
      return { status, url: current, headers: flatHeaders, body: Buffer.alloc(0), etag: options.etag ?? null, notModified: true };
    }
    if ((status === 403 || status === 429) && (flatHeaders['x-ratelimit-remaining'] === '0' || status === 429)) {
      const reset = Number(flatHeaders['x-ratelimit-reset']);
      throw new NetError('ERR_NET_RATE_LIMITED', { url: current, status, resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : undefined });
    }
    if (status < 200 || status >= 300) {
      throw new NetError('ERR_NET_STATUS', { url: current, status });
    }
    return { status, url: current, headers: flatHeaders, body: response.body, etag: flatHeaders.etag || null, notModified: false };
  }
  throw new NetError('ERR_NET_REDIRECTS', { url: startUrl });
};
