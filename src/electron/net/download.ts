import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkUrl, PRODUCTION_POLICY, type NetPolicy } from '../../shared/net-policy';
import { NetError, OFFLINE_CODES, USER_AGENT } from './http';

/**
 * Streaming download of an installer (brief §7.3, R02, R05): written to a `.part` file, resumed
 * with an HTTP `Range` request when the server allows it, every redirect hop checked against the
 * allowlist, never more bytes than the size announced by `latest.yml`. The caller then runs
 * `verifyFile` (size + SHA-512) and only renames the file after it passed.
 *
 * A network cut keeps the `.part` file (the next attempt resumes); a size or hash mismatch
 * deletes it.
 */
export class DownloadError extends Error {
  constructor(readonly code: 'size-mismatch' | 'hash-mismatch' | 'cancelled' | 'disk', readonly detail: string | null = null) {
    super(`ERR_DOWNLOAD_${code.toUpperCase().replace('-', '_')}`);
    this.name = 'DownloadError';
  }
}

export interface DownloadOptions {
  /** Size from latest.yml: the download never goes beyond it. */
  expectedSize: number;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number) => void;
  policy?: NetPolicy;
  /** No byte for this long: the attempt fails as a timeout (the part file is kept). */
  stallTimeoutMs?: number;
  maxRedirects?: number;
}

export interface DownloadOutcome {
  /** Part of the file was already on disk and the server continued it. */
  resumed: boolean;
}

export type Downloader = (url: string, partPath: string, options: DownloadOptions) => Promise<DownloadOutcome>;

/** The server cannot continue the part file: start again from zero (once). */
class RestartFromZero extends Error {}

const DISK_CODES = new Set(['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EBUSY', 'EMFILE']);

async function sizeOf(filePath: string): Promise<number> {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : value ?? '';
}

export const downloadFile: Downloader = async (url, partPath, options) => {
  let offset = await sizeOf(partPath);
  if (offset > options.expectedSize) {
    await fs.rm(partPath, { force: true });
    offset = 0;
  }
  if (offset > 0 && offset === options.expectedSize) {
    // Already complete: verification decides whether it is the right file.
    options.onProgress?.(offset, options.expectedSize);
    return { resumed: true };
  }
  try {
    return await fetchInto(url, partPath, offset, options);
  } catch (error) {
    if (error instanceof RestartFromZero) {
      await fs.rm(partPath, { force: true });
      return fetchInto(url, partPath, 0, options);
    }
    throw error;
  }
};

function request(url: URL, headers: Record<string, string>, options: DownloadOptions, onTimeout: () => void): Promise<http.IncomingMessage> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const outgoing = client.get(url, { headers, timeout: options.stallTimeoutMs ?? 30_000, signal: options.signal }, resolve);
    outgoing.on('timeout', () => {
      onTimeout();
      outgoing.destroy(new NetError('ERR_NET_TIMEOUT', { url: url.href }));
    });
    outgoing.on('error', reject);
  });
}

async function fetchInto(startUrl: string, partPath: string, offset: number, options: DownloadOptions): Promise<DownloadOutcome> {
  const policy = options.policy ?? PRODUCTION_POLICY;
  const total = options.expectedSize;
  let timedOut = false;
  let current = startUrl;

  try {
    for (let hop = 0; hop <= (options.maxRedirects ?? 5); hop += 1) {
      const check = checkUrl(current, policy);
      if (!check.ok) {
        throw new NetError('ERR_NET_BLOCKED', { url: current, reason: check.reason });
      }
      const headers: Record<string, string> = { 'user-agent': USER_AGENT, 'accept-encoding': 'identity', accept: 'application/octet-stream' };
      if (offset > 0) headers.range = `bytes=${offset}-`;
      const response = await request(check.url, headers, options, () => {
        timedOut = true;
      });
      const status = response.statusCode ?? 0;

      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        current = new URL(headerValue(response.headers.location), check.url).href;
        continue;
      }

      let start = 0;
      if (status === 206 && offset > 0) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headerValue(response.headers['content-range']));
        if (!range || Number(range[1]) !== offset || Number(range[3]) !== total) {
          response.destroy();
          throw new RestartFromZero();
        }
        start = offset;
      } else if (status === 416 && offset > 0) {
        response.destroy();
        throw new RestartFromZero();
      } else if (status === 403 || status === 429) {
        response.destroy();
        throw new NetError('ERR_NET_RATE_LIMITED', { url: current, status });
      } else if (status !== 200) {
        response.destroy();
        throw new NetError('ERR_NET_STATUS', { url: current, status });
      }
      // A 200 to a Range request: the server ignored it, the body is the whole file.

      const declared = Number(response.headers['content-length']);
      if (response.headers['content-length'] !== undefined && declared !== total - start) {
        response.destroy();
        throw new DownloadError('size-mismatch', `${start + declared}/${total}`);
      }

      let received = start;
      options.onProgress?.(received, total);
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > total) {
            callback(new DownloadError('size-mismatch', `>${total}`));
            return;
          }
          options.onProgress?.(received, total);
          callback(null, chunk);
        },
      });
      await pipeline(response, counter, createWriteStream(partPath, { flags: start > 0 ? 'a' : 'w' }), options.signal ? { signal: options.signal } : {});
      if (received !== total) {
        // The server closed early without an error: the part is kept, the next try resumes.
        throw new NetError('ERR_NET_OFFLINE', { url: current, reason: 'short-body' });
      }
      return { resumed: start > 0 };
    }
    throw new NetError('ERR_NET_REDIRECTS', { url: startUrl });
  } catch (error) {
    throw await mapError(error, partPath, options, timedOut);
  }
}

async function mapError(error: unknown, partPath: string, options: DownloadOptions, timedOut: boolean): Promise<Error> {
  if (error instanceof RestartFromZero) return error;
  if (options.signal?.aborted) return new DownloadError('cancelled');
  if (error instanceof DownloadError) {
    if (error.code === 'size-mismatch') await fs.rm(partPath, { force: true }).catch(() => undefined);
    return error;
  }
  if (timedOut) return new NetError('ERR_NET_TIMEOUT');
  if (error instanceof NetError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? '';
  if (DISK_CODES.has(code)) return new DownloadError('disk', code);
  if (OFFLINE_CODES.has(code) || code === 'ERR_STREAM_PREMATURE_CLOSE' || (error as Error | undefined)?.message === 'aborted') {
    return new NetError('ERR_NET_OFFLINE', { reason: code || 'aborted' });
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * R02: the file must have exactly the size and the SHA-512 (base64) of latest.yml. A file that
 * does not match is deleted at once.
 */
export async function verifyFile(filePath: string, expectedSize: number, expectedSha512: string): Promise<void> {
  const size = await sizeOf(filePath);
  if (size !== expectedSize) {
    await fs.rm(filePath, { force: true });
    throw new DownloadError('size-mismatch', `${size}/${expectedSize}`);
  }
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  if (hash.digest('base64') !== expectedSha512) {
    await fs.rm(filePath, { force: true });
    throw new DownloadError('hash-mismatch');
  }
}
