/**
 * @jest-environment node
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { httpGet, NetError } from '../../src/electron/net/http';
import type { NetPolicy } from '../../src/shared/net-policy';

let server: http.Server;
let base = '';
let policy: NetPolicy;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x');
    switch (url.pathname) {
      case '/ok':
        response.writeHead(200, { etag: '"v1"', 'content-type': 'application/json' });
        response.end('{"ok":true}');
        break;
      case '/etag':
        if (request.headers['if-none-match'] === '"v1"') {
          response.writeHead(304);
          response.end();
        } else {
          response.writeHead(200, { etag: '"v1"' });
          response.end('fresh');
        }
        break;
      case '/redirect-ok':
        response.writeHead(302, { location: '/ok' });
        response.end();
        break;
      case '/redirect-elsewhere':
        // Same machine, but "localhost" is not on the allowlist: must be refused before connecting.
        response.writeHead(302, { location: `http://localhost:${(server.address() as AddressInfo).port}/ok` });
        response.end();
        break;
      case '/redirect-loop':
        response.writeHead(302, { location: '/redirect-loop' });
        response.end();
        break;
      case '/big-declared':
        response.writeHead(200, { 'content-length': '5000' });
        response.end('x'.repeat(5000));
        break;
      case '/big-chunked':
        response.writeHead(200);
        for (let index = 0; index < 10; index += 1) response.write('x'.repeat(1000));
        response.end();
        break;
      case '/slow':
        setTimeout(() => response.end('late'), 2000);
        break;
      case '/rate-limited':
        response.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790870400' });
        response.end('{}');
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
  await new Promise((resolve) => server.close(resolve));
});

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof NetError ? `${error.code}${error.detail.reason ? `:${error.detail.reason}` : ''}${error.detail.status ? `:${error.detail.status}` : ''}` : String(error);
  }
}

describe('httpGet', () => {
  it('fetches and returns the ETag', async () => {
    const result = await httpGet(`${base}/ok`, { maxBytes: 1000, policy });
    expect(result.body.toString()).toBe('{"ok":true}');
    expect(result.etag).toBe('"v1"');
  });

  it('turns a matching ETag into notModified', async () => {
    const result = await httpGet(`${base}/etag`, { maxBytes: 1000, policy, etag: '"v1"' });
    expect(result.notModified).toBe(true);
    expect(result.etag).toBe('"v1"');
  });

  it('follows redirects that stay on the allowlist', async () => {
    const result = await httpGet(`${base}/redirect-ok`, { maxBytes: 1000, policy });
    expect(result.url).toBe(`${base}/ok`);
  });

  it('refuses a redirect to a host outside the allowlist (R05)', async () => {
    expect(await code(httpGet(`${base}/redirect-elsewhere`, { maxBytes: 1000, policy }))).toBe('ERR_NET_BLOCKED:host');
  });

  it('refuses the production policy for plain HTTP before connecting', async () => {
    expect(await code(httpGet(`${base}/ok`, { maxBytes: 1000 }))).toBe('ERR_NET_BLOCKED:protocol');
  });

  it('stops redirect loops', async () => {
    expect(await code(httpGet(`${base}/redirect-loop`, { maxBytes: 1000, policy, maxRedirects: 3 }))).toBe('ERR_NET_REDIRECTS');
  });

  it('caps the size, declared or streamed', async () => {
    expect(await code(httpGet(`${base}/big-declared`, { maxBytes: 1000, policy }))).toBe('ERR_NET_TOO_LARGE');
    expect(await code(httpGet(`${base}/big-chunked`, { maxBytes: 1000, policy }))).toBe('ERR_NET_TOO_LARGE');
  });

  it('times out', async () => {
    expect(await code(httpGet(`${base}/slow`, { maxBytes: 1000, policy, timeoutMs: 200 }))).toBe('ERR_NET_TIMEOUT');
  });

  it('reports HTTP errors and GitHub rate limits distinctly', async () => {
    expect(await code(httpGet(`${base}/missing`, { maxBytes: 1000, policy }))).toBe('ERR_NET_STATUS:404');
    expect(await code(httpGet(`${base}/rate-limited`, { maxBytes: 1000, policy }))).toBe('ERR_NET_RATE_LIMITED:403');
  });

  it('reports an unreachable host as offline', async () => {
    const closed = { protocols: ['http:'], hosts: ['127.0.0.1'], ports: ['1'] };
    expect(await code(httpGet('http://127.0.0.1:1/x', { maxBytes: 1000, policy: closed, timeoutMs: 2000 }))).toMatch(/^ERR_NET_OFFLINE/);
  });
});
