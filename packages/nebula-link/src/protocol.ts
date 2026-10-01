import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Nebula Link wire protocol (docs/NEBULA_LINK.md § 3–4, § 9): JSON-RPC 2.0, one message per line
 * (NDJSON), at most 256 KiB per message, mutual HMAC handshake. Shared by the Hub's server and
 * the client SDK, so both sides frame, validate and prove things in exactly the same way.
 */
export const PROTOCOL = 'nebula-link/1';
export const MAX_MESSAGE_BYTES = 256 * 1024;

export const ERRORS = {
  'parse-error': -32700,
  'invalid-request': -32600,
  'method-not-found': -32601,
  'invalid-params': -32602,
  unauthenticated: -32001,
  'consent-required': -32002,
  'consent-denied': -32003,
  'unknown-capability': -32004,
  'provider-offline': -32005,
  timeout: -32006,
  'too-large': -32007,
  'rate-limited': -32009,
  'invalid-result': -32010,
} as const;

export type LinkErrorName = keyof typeof ERRORS;

export function errorName(code: number): LinkErrorName | 'unknown' {
  const found = (Object.keys(ERRORS) as LinkErrorName[]).find((name) => ERRORS[name] === code);
  return found ?? 'unknown';
}

export type RpcId = string | number;
export interface RpcRequest { jsonrpc: '2.0'; id: RpcId; method: string; params?: unknown }
export interface RpcNotification { jsonrpc: '2.0'; method: string; params?: unknown }
export interface RpcError { code: number; message: string }
export interface RpcResponse { jsonrpc: '2.0'; id: RpcId | null; result?: unknown; error?: RpcError }

export type Classified =
  | { type: 'request'; message: RpcRequest }
  | { type: 'notification'; message: RpcNotification }
  | { type: 'response'; message: RpcResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const METHOD = /^[a-z][a-z0-9.-]{0,63}$/;

/** What a parsed line is, or null when it is not valid JSON-RPC 2.0. */
export function classify(value: unknown): Classified | null {
  if (!isRecord(value) || value.jsonrpc !== '2.0') return null;
  const hasId = typeof value.id === 'string' || (typeof value.id === 'number' && Number.isFinite(value.id));
  if (typeof value.method === 'string') {
    if (!METHOD.test(value.method)) return null;
    if (value.params !== undefined && !isRecord(value.params) && !Array.isArray(value.params)) return null;
    if (hasId) return { type: 'request', message: value as unknown as RpcRequest };
    if (value.id === undefined) return { type: 'notification', message: value as unknown as RpcNotification };
    return null;
  }
  if (hasId || value.id === null) {
    const error = value.error;
    if (error !== undefined && !(isRecord(error) && typeof error.code === 'number' && typeof error.message === 'string')) return null;
    if (('result' in value) === (error !== undefined)) return null;
    return { type: 'response', message: value as unknown as RpcResponse };
  }
  return null;
}

/** One message as one line; refuses anything over the size limit. */
export function encode(message: RpcRequest | RpcNotification | RpcResponse): string {
  const line = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) throw new Error('ERR_LINK_TOO_LARGE');
  return line;
}

export function errorResponse(id: RpcId | null, name: LinkErrorName, message: string = name): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code: ERRORS[name], message } };
}

/**
 * Splits a byte stream into lines. A line longer than the limit is dropped (up to its newline)
 * and reported, so one oversized message never desynchronizes the stream.
 */
export class LineDecoder {
  private chunks: Buffer[] = [];
  private size = 0;
  private skipping = false;

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly onOversized: () => void,
    private readonly maxBytes = MAX_MESSAGE_BYTES,
  ) {}

  push(chunk: Buffer): void {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, start);
      const end = newline < 0 ? chunk.length : newline;
      if (!this.skipping) {
        const piece = chunk.subarray(start, end);
        this.size += piece.length;
        if (this.size > this.maxBytes) {
          this.chunks = [];
          this.size = 0;
          this.skipping = true;
          this.onOversized();
        } else {
          this.chunks.push(piece);
        }
      }
      if (newline < 0) return;
      if (!this.skipping) {
        const line = Buffer.concat(this.chunks).toString('utf8').replace(/\r$/, '');
        if (line.trim()) this.onLine(line);
      }
      this.chunks = [];
      this.size = 0;
      this.skipping = false;
      start = newline + 1;
    }
  }
}

export function randomNonce(): string {
  return randomBytes(32).toString('base64url');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Handshake proofs (§ 4.2). The Hub proves `hub|clientNonce|serverNonce|appId`, the client
 * `client|serverNonce|clientNonce|appId`: different inputs, so one proof can never be replayed as
 * the other, and the token itself never travels.
 */
export function proof(token: string, role: 'hub' | 'client', first: string, second: string, appId: string): string {
  return createHmac('sha256', token).update(`${role}|${first}|${second}|${appId}`).digest('base64url');
}

export function sameProof(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Session file written by the Hub (§ 4.1). */
export interface SessionFile {
  protocol: string;
  pipe: string;
  token: string;
  hubVersion: string;
  pid: number;
  createdAt: string;
}

export function parseSession(value: unknown): SessionFile | null {
  if (!isRecord(value)) return null;
  const { protocol, pipe, token, hubVersion, pid, createdAt } = value;
  if (protocol !== PROTOCOL || typeof pipe !== 'string' || !/^\\\\\.\\pipe\\[A-Za-z0-9._-]{1,200}$/.test(pipe)) return null;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  if (typeof hubVersion !== 'string' || typeof pid !== 'number' || typeof createdAt !== 'string') return null;
  return { protocol, pipe, token, hubVersion, pid, createdAt };
}
