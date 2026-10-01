/**
 * @jest-environment node
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { downloadFile, DownloadError, verifyFile } from '../../src/electron/net/download';
import { NetError } from '../../src/electron/net/http';
import type { NetPolicy } from '../../src/shared/net-policy';

// A small "installer", served by a local server that can misbehave on demand (brief §13).
const FILE = randomBytes(256 * 1024 + 123);
const SHA512 = createHash('sha512').update(FILE).digest('base64');
const SIZE = FILE.length;
const HALF = Math.floor(SIZE / 2);

let server: http.Server;
let base = '';
let policy: NetPolicy;
let directory = '';
let partPath = '';
const rangesSeen: string[] = [];

function serveRange(request: http.IncomingMessage, response: http.ServerResponse): void {
  const range = /^bytes=(\d+)-$/.exec(request.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    if (start >= SIZE) {
      response.writeHead(416, { 'content-range': `bytes */${SIZE}` });
      response.end();
      return;
    }
    response.writeHead(206, { 'content-length': String(SIZE - start), 'content-range': `bytes ${start}-${SIZE - 1}/${SIZE}` });
    response.end(FILE.subarray(start));
    return;
  }
  response.writeHead(200, { 'content-length': String(SIZE) });
  response.end(FILE);
}

beforeAll(async () => {
  server = http.createServer((request, response) => {
    rangesSeen.push(request.headers.range ?? '');
    const url = new URL(request.url ?? '/', 'http://x');
    switch (url.pathname) {
      case '/file':
        serveRange(request, response);
        break;
      case '/no-range':
        response.writeHead(200, { 'content-length': String(SIZE) });
        response.end(FILE);
        break;
      case '/wrong-range':
        response.writeHead(request.headers.range ? 206 : 200, request.headers.range ? { 'content-range': `bytes 0-${SIZE - 1}/${SIZE}` } : { 'content-length': String(SIZE) });
        response.end(FILE);
        break;
      case '/cut':
        // Sends half of the file, then drops the connection.
        response.writeHead(200, { 'content-length': String(SIZE) });
        response.write(FILE.subarray(0, HALF), () => setTimeout(() => response.socket?.destroy(), 20));
        break;
      case '/stall':
        response.writeHead(200, { 'content-length': String(SIZE) });
        response.write(FILE.subarray(0, 1000));
        break;
      case '/declared-wrong':
        response.writeHead(200, { 'content-length': String(SIZE + 10) });
        response.end(Buffer.concat([FILE, Buffer.alloc(10)]));
        break;
      case '/too-long-chunked':
        response.writeHead(200);
        response.write(FILE);
        response.end(Buffer.alloc(5000));
        break;
      case '/tampered': {
        const copy = Buffer.from(FILE);
        copy[100] ^= 0xff;
        response.writeHead(200, { 'content-length': String(SIZE) });
        response.end(copy);
        break;
      }
      case '/redirect-ok':
        response.writeHead(302, { location: '/file' });
        response.end();
        break;
      case '/redirect-elsewhere':
        response.writeHead(302, { location: `http://localhost:${(server.address() as AddressInfo).port}/file` });
        response.end();
        break;
      case '/slow':
        response.writeHead(200, { 'content-length': String(SIZE) });
        response.write(FILE.subarray(0, 1000));
        setTimeout(() => response.end(FILE.subarray(1000)), 1500);
        break;
      default:
        response.writeHead(404);
        response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = String((server.address() as AddressInfo).port);
  base = `http://127.0.0.1:${port}`;
  policy = { protocols: ['http:'], hosts: ['127.0.0.1'], ports: [port] };
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-download-'));
  partPath = path.join(directory, 'Nebula-Test-Setup-1.0.0.exe.part');
  rangesSeen.length = 0;
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    if (error instanceof DownloadError) return error.code;
    if (error instanceof NetError) return error.code;
    return String(error);
  }
}

const exists = (file: string) => fs.stat(file).then(() => true, () => false);

describe('downloadFile', () => {
  it('downloads to the part file and reports progress', async () => {
    const progress: number[] = [];
    const outcome = await downloadFile(`${base}/file`, partPath, { expectedSize: SIZE, policy, onProgress: (received) => progress.push(received) });
    expect(outcome.resumed).toBe(false);
    expect((await fs.readFile(partPath)).equals(FILE)).toBe(true);
    expect(progress[progress.length - 1]).toBe(SIZE);
    await expect(verifyFile(partPath, SIZE, SHA512)).resolves.toBeUndefined();
  });

  it('follows an allowed redirect', async () => {
    await downloadFile(`${base}/redirect-ok`, partPath, { expectedSize: SIZE, policy });
    expect((await fs.readFile(partPath)).equals(FILE)).toBe(true);
  });

  it('refuses a redirect to a host outside the allowlist, before connecting', async () => {
    expect(await failure(downloadFile(`${base}/redirect-elsewhere`, partPath, { expectedSize: SIZE, policy }))).toBe('ERR_NET_BLOCKED');
    expect(rangesSeen).toHaveLength(1);
    expect(await exists(partPath)).toBe(false);
  });

  it('refuses a URL outside the allowlist', async () => {
    expect(await failure(downloadFile('https://evil.example/x.exe', partPath, { expectedSize: SIZE, policy }))).toBe('ERR_NET_BLOCKED');
  });

  it('keeps the part file after a cut, then resumes with Range', async () => {
    expect(await failure(downloadFile(`${base}/cut`, partPath, { expectedSize: SIZE, policy }))).toBe('ERR_NET_OFFLINE');
    const kept = (await fs.stat(partPath)).size;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(SIZE);

    const outcome = await downloadFile(`${base}/file`, partPath, { expectedSize: SIZE, policy });
    expect(outcome.resumed).toBe(true);
    expect(rangesSeen[rangesSeen.length - 1]).toBe(`bytes=${kept}-`);
    await expect(verifyFile(partPath, SIZE, SHA512)).resolves.toBeUndefined();
  });

  it('starts over when the server ignores Range', async () => {
    await fs.writeFile(partPath, FILE.subarray(0, HALF));
    const outcome = await downloadFile(`${base}/no-range`, partPath, { expectedSize: SIZE, policy });
    expect(outcome.resumed).toBe(false);
    await expect(verifyFile(partPath, SIZE, SHA512)).resolves.toBeUndefined();
  });

  it('starts over when the server answers another range', async () => {
    await fs.writeFile(partPath, FILE.subarray(0, HALF));
    const outcome = await downloadFile(`${base}/wrong-range`, partPath, { expectedSize: SIZE, policy });
    expect(outcome.resumed).toBe(false);
    expect(rangesSeen).toEqual([`bytes=${HALF}-`, '']);
    await expect(verifyFile(partPath, SIZE, SHA512)).resolves.toBeUndefined();
  });

  it('drops a part file bigger than the expected size', async () => {
    await fs.writeFile(partPath, Buffer.alloc(SIZE + 1));
    await downloadFile(`${base}/file`, partPath, { expectedSize: SIZE, policy });
    expect(rangesSeen).toEqual(['']);
    await expect(verifyFile(partPath, SIZE, SHA512)).resolves.toBeUndefined();
  });

  it('refuses a declared size different from latest.yml, and deletes the part', async () => {
    expect(await failure(downloadFile(`${base}/declared-wrong`, partPath, { expectedSize: SIZE, policy }))).toBe('size-mismatch');
    expect(await exists(partPath)).toBe(false);
  });

  it('stops as soon as the body goes beyond the expected size', async () => {
    expect(await failure(downloadFile(`${base}/too-long-chunked`, partPath, { expectedSize: SIZE, policy }))).toBe('size-mismatch');
    expect(await exists(partPath)).toBe(false);
  });

  it('times out when the server stalls, keeping the part file', async () => {
    expect(await failure(downloadFile(`${base}/stall`, partPath, { expectedSize: SIZE, policy, stallTimeoutMs: 300 }))).toBe('ERR_NET_TIMEOUT');
    expect((await fs.stat(partPath)).size).toBe(1000);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const promise = downloadFile(`${base}/slow`, partPath, {
      expectedSize: SIZE,
      policy,
      signal: controller.signal,
      onProgress: (received) => {
        if (received >= 1000) controller.abort();
      },
    });
    expect(await failure(promise)).toBe('cancelled');
  });

  it('reports an HTTP error', async () => {
    expect(await failure(downloadFile(`${base}/missing`, partPath, { expectedSize: SIZE, policy }))).toBe('ERR_NET_STATUS');
  });
});

describe('verifyFile (R02)', () => {
  it('deletes a file whose SHA-512 does not match', async () => {
    await downloadFile(`${base}/tampered`, partPath, { expectedSize: SIZE, policy });
    expect(await failure(verifyFile(partPath, SIZE, SHA512))).toBe('hash-mismatch');
    expect(await exists(partPath)).toBe(false);
  });

  it('deletes a file whose size does not match', async () => {
    await fs.writeFile(partPath, FILE.subarray(0, HALF));
    expect(await failure(verifyFile(partPath, SIZE, SHA512))).toBe('size-mismatch');
    expect(await exists(partPath)).toBe(false);
  });
});
