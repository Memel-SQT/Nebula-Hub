/**
 * @jest-environment node
 */
import { classify, encode, errorName, LineDecoder, MAX_MESSAGE_BYTES, newToken, parseSession, proof, randomNonce, sameProof } from './protocol';

describe('JSON-RPC classification', () => {
  it.each([
    ['request', { jsonrpc: '2.0', id: 1, method: 'link.ping', params: {} }],
    ['request', { jsonrpc: '2.0', id: 'a', method: 'link.query' }],
    ['notification', { jsonrpc: '2.0', method: 'link.emit', params: { event: 'x' } }],
    ['response', { jsonrpc: '2.0', id: 1, result: null }],
    ['response', { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse' } }],
  ])('recognizes a %s', (type, value) => {
    expect(classify(value)?.type).toBe(type);
  });

  it.each([
    ['no version', { id: 1, method: 'x.y' }],
    ['wrong version', { jsonrpc: '1.0', id: 1, method: 'x.y' }],
    ['bad method name', { jsonrpc: '2.0', id: 1, method: 'Link Ping' }],
    ['scalar params', { jsonrpc: '2.0', id: 1, method: 'x.y', params: 3 }],
    ['result and error', { jsonrpc: '2.0', id: 1, result: 1, error: { code: 1, message: 'x' } }],
    ['neither result nor error', { jsonrpc: '2.0', id: 1 }],
    ['malformed error', { jsonrpc: '2.0', id: 1, error: 'boom' }],
    ['null id request', { jsonrpc: '2.0', id: null, method: 'x.y' }],
    ['array', [1]],
  ])('refuses %s', (_label, value) => {
    expect(classify(value)).toBeNull();
  });

  it('names error codes', () => {
    expect(errorName(-32002)).toBe('consent-required');
    expect(errorName(-1)).toBe('unknown');
  });
});

describe('framing (NDJSON, 256 KiB)', () => {
  it('splits lines across chunks and ignores blank ones', () => {
    const lines: string[] = [];
    const decoder = new LineDecoder((line) => lines.push(line), () => lines.push('OVERSIZED'));
    decoder.push(Buffer.from('{"a":1}\n{"b"'));
    decoder.push(Buffer.from(':2}\r\n\n{"c":3}\n'));
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('drops an oversized line up to its end and keeps the stream in sync', () => {
    const lines: string[] = [];
    const decoder = new LineDecoder((line) => lines.push(line), () => lines.push('OVERSIZED'), 10);
    decoder.push(Buffer.from('0123456789ABCDEF'));
    decoder.push(Buffer.from('GHI\n{"ok":1}\n'));
    expect(lines).toEqual(['OVERSIZED', '{"ok":1}']);
  });

  it('refuses to encode a message over the limit', () => {
    expect(() => encode({ jsonrpc: '2.0', method: 'link.emit', params: { big: 'x'.repeat(MAX_MESSAGE_BYTES) } })).toThrow('ERR_LINK_TOO_LARGE');
    expect(encode({ jsonrpc: '2.0', id: 1, result: {} })).toBe('{"jsonrpc":"2.0","id":1,"result":{}}\n');
  });
});

describe('handshake proofs', () => {
  const token = newToken();
  const client = randomNonce();
  const server = randomNonce();

  it('are deterministic and bound to the token, the nonces, the role and the app', () => {
    const hub = proof(token, 'hub', client, server, 'nebula.clock');
    expect(sameProof(hub, proof(token, 'hub', client, server, 'nebula.clock'))).toBe(true);
    expect(sameProof(hub, proof(newToken(), 'hub', client, server, 'nebula.clock'))).toBe(false);
    expect(sameProof(hub, proof(token, 'client', server, client, 'nebula.clock'))).toBe(false);
    expect(sameProof(hub, proof(token, 'hub', client, server, 'nebula.news'))).toBe(false);
    expect(sameProof(hub, proof(token, 'hub', server, client, 'nebula.clock'))).toBe(false);
  });

  it('never accept a non-string or a truncated proof', () => {
    const hub = proof(token, 'hub', client, server, 'nebula.clock');
    expect(sameProof(hub, undefined)).toBe(false);
    expect(sameProof(hub, hub.slice(1))).toBe(false);
  });
});

describe('session file', () => {
  const valid = { protocol: 'nebula-link/1', pipe: '\\\\.\\pipe\\nebula-link-3f1a9c0b2e7d4a51', token: newToken(), hubVersion: '0.2.0', pid: 1, createdAt: '2026-10-02T08:00:00.000Z' };

  it('accepts the Hub session', () => {
    expect(parseSession(valid)).toEqual(valid);
  });

  it.each([
    ['another protocol', { ...valid, protocol: 'nebula-link/2' }],
    ['a path that is not a pipe', { ...valid, pipe: 'C:\\temp\\x' }],
    ['a short token', { ...valid, token: 'abc' }],
  ])('refuses %s', (_label, value) => {
    expect(parseSession(value)).toBeNull();
  });
});
