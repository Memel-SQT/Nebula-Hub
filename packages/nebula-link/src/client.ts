import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { intentFromArgv, isDeclaredIntent, type Intent } from './deeplink';
import { capabilityOf, consumesCapability, parseManifestBytes, type Manifest } from './manifest';
import {
  classify,
  encode,
  errorName,
  errorResponse,
  LineDecoder,
  parseSession,
  proof,
  PROTOCOL,
  randomNonce,
  sameProof,
  sha256Hex,
  type LinkErrorName,
  type RpcId,
  type RpcRequest,
  type RpcResponse,
} from './protocol';
import { validateSchema } from './schemas';

/**
 * Nebula Link client for an app's main process (docs/NEBULA_LINK.md § 11).
 *
 * R09 first: nothing here throws or waits because the Hub is absent. `connect()` resolves after
 * one attempt; without a Hub the client is `offline` and retries in the background with an
 * exponential delay (1 s → 60 s). Calls made while offline resolve at once with
 * `{ ok: false, error: 'offline' }`, events are dropped, the app keeps working.
 *
 * Only what the app's own manifest declares can be provided, emitted, listened to or asked for.
 */
export type LinkStatus = 'connected' | 'offline';
export type LinkResult<T> = { ok: true; value: T } | { ok: false; error: LinkErrorName | 'offline' | 'unknown' };

export interface QueryContext {
  /** App id asking (`nebula.hub` for the Hub's widgets). */
  requester: string;
  params: Record<string, unknown>;
}

export interface NotificationInput {
  id?: string;
  title: string;
  body: string;
  sensitivity: 'public' | 'private';
  deepLink?: string;
  category?: string;
}

export interface CreateOptions {
  appId: string;
  appVersion: string;
  /** The app's `nebula.app.json`, the same bytes as the one shipped in its install folder. */
  manifestPath: string;
  /** Defaults to `%LOCALAPPDATA%\Nebula Link\session.json`. */
  sessionFile?: string;
  requestTimeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Background retries while offline (default true). */
  autoReconnect?: boolean;
}

type Provider = (context: QueryContext) => unknown | Promise<unknown>;
type Listener = (payload: unknown, source: string) => void;

export function defaultSessionFile(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Nebula Link', 'session.json');
}

export class NebulaLink {
  static create(options: CreateOptions): NebulaLink {
    return new NebulaLink(options);
  }

  /** The intent an app was started with (`--nebula-intent=…`), checked against its manifest. */
  static intentFromArgv(argv: readonly string[], manifest?: Manifest | null): Intent | null {
    const intent = intentFromArgv(argv);
    if (!intent) return null;
    return !manifest || isDeclaredIntent(manifest, intent.path, intent.params) ? intent : null;
  }

  readonly manifest: Manifest | null;
  private readonly manifestHash: string | null;
  private statusValue: LinkStatus = 'offline';
  private socket: net.Socket | null = null;
  private authenticated = false;
  private disposed = false;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff: number;
  private nextId = 1;
  private readonly pending = new Map<RpcId, { resolve: (response: RpcResponse | null) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly providers = new Map<string, Provider>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly intentHandlers = new Set<(intent: Intent) => unknown>();
  private readonly statusHandlers = new Set<(status: LinkStatus) => void>();
  private appearanceValue: unknown = null;

  private constructor(private readonly options: CreateOptions) {
    this.backoff = options.minBackoffMs ?? 1000;
    let manifest: Manifest | null = null;
    let hash: string | null = null;
    try {
      const bytes = fs.readFileSync(options.manifestPath);
      const parsed = parseManifestBytes(bytes);
      if (parsed.ok && parsed.manifest.appId === options.appId) {
        manifest = parsed.manifest;
        hash = sha256Hex(bytes);
      }
    } catch {
      // No manifest: Link stays off for this app, which keeps working (R09).
    }
    this.manifest = manifest;
    this.manifestHash = hash;
  }

  get status(): LinkStatus {
    return this.statusValue;
  }

  /** Last appearance pushed by the Hub (I1), or null. */
  get appearance(): unknown {
    return this.appearanceValue;
  }

  onStatus(handler: (status: LinkStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** One connection attempt (then background retries). Never rejects. */
  async connect(): Promise<LinkStatus> {
    if (this.disposed || !this.manifest) return this.statusValue;
    if (this.statusValue === 'connected') return 'connected';
    if (!this.connecting) {
      this.connecting = this.attempt().finally(() => {
        this.connecting = null;
      });
    }
    await this.connecting;
    return this.statusValue;
  }

  /** Answers a query or widget capability of this app's manifest. */
  provide(capability: string, handler: Provider): () => void {
    const declared = this.manifest ? capabilityOf(this.manifest, capability) : undefined;
    if (this.manifest && (!declared || (declared.kind !== 'query' && declared.kind !== 'widget'))) {
      throw new Error(`ERR_LINK_UNDECLARED_CAPABILITY ${capability}`);
    }
    this.providers.set(capability, handler);
    this.scheduleReady();
    return () => {
      this.providers.delete(capability);
      this.scheduleReady();
    };
  }

  /** Listens to an event the manifest consumes (e.g. `nebula.appearance.changed`). */
  on(event: string, listener: Listener): () => void {
    if (this.manifest && !consumesCapability(this.manifest, event)) throw new Error(`ERR_LINK_UNDECLARED_CAPABILITY ${event}`);
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
      if (this.authenticated) void this.call('link.subscribe', { event });
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(event);
        if (this.authenticated) void this.call('link.unsubscribe', { event });
      }
    };
  }

  /** Publishes an event this app declares; dropped while offline. Returns whether it was sent. */
  emit(event: string, payload: unknown = {}): boolean {
    const declared = this.manifest ? capabilityOf(this.manifest, event) : undefined;
    if (!declared || declared.kind !== 'event' || !declared.payloadSchema || !validateSchema(declared.payloadSchema, payload)) return false;
    return this.send({ jsonrpc: '2.0', method: 'link.emit', params: { event, payload } });
  }

  notify(notification: NotificationInput): Promise<LinkResult<{ accepted: boolean }>> {
    if (!validateSchema('NotificationV1', notification)) return Promise.resolve({ ok: false, error: 'invalid-params' });
    return this.call('link.notify', notification as unknown as Record<string, unknown>) as Promise<LinkResult<{ accepted: boolean }>>;
  }

  /** Asks the Hub to open a screen of another app (or of the Hub: `nebula.hub`, `/…`). */
  intent(target: string, path: string, params: Record<string, string> = {}): Promise<LinkResult<{ delivered: 'link' | 'launched' | 'store' }>> {
    return this.call('link.intent', { target, path, params }) as Promise<LinkResult<{ delivered: 'link' | 'launched' | 'store' }>>;
  }

  /** Reads a capability of another app, through the Hub and its consent rules. */
  query<T = unknown>(capability: string, params: Record<string, unknown> = {}): Promise<LinkResult<T>> {
    return this.call('link.query', { capability, params }) as Promise<LinkResult<T>>;
  }

  /** Intents delivered over Link. Apps also pass `NebulaLink.intentFromArgv(...)` to the same handler. */
  onIntent(handler: (intent: Intent) => unknown): () => void {
    this.intentHandlers.add(handler);
    return () => this.intentHandlers.delete(handler);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.reconnectTimer = null;
    this.close();
  }

  // ---- Connection.

  private setStatus(status: LinkStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // A faulty status handler never breaks the client.
      }
    }
  }

  private async attempt(): Promise<void> {
    try {
      const session = parseSession(JSON.parse(await readFile(this.options.sessionFile ?? defaultSessionFile(), 'utf8')));
      if (!session) throw new Error('ERR_LINK_NO_SESSION');
      await this.open(session.pipe);
      await this.handshake(session.token);
      this.backoff = this.options.minBackoffMs ?? 1000;
      this.setStatus('connected');
      this.scheduleReady(0);
      for (const event of this.listeners.keys()) void this.call('link.subscribe', { event });
      this.pingTimer = setInterval(() => void this.call('link.ping', {}).then((result) => {
        if (!result.ok && result.error === 'timeout') this.close();
      }), 30_000);
      this.pingTimer.unref?.();
    } catch {
      this.close();
      this.scheduleReconnect();
    }
  }

  private open(pipe: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(pipe);
      const timer = setTimeout(() => socket.destroy(new Error('ERR_LINK_CONNECT_TIMEOUT')), 3000);
      socket.once('connect', () => {
        clearTimeout(timer);
        this.socket = socket;
        const decoder = new LineDecoder((line) => this.onLine(line), () => this.close());
        socket.on('data', (chunk: Buffer) => decoder.push(chunk));
        socket.on('close', () => {
          if (this.socket === socket) {
            this.close();
            this.scheduleReconnect();
          }
        });
        socket.on('error', () => undefined);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private async handshake(token: string): Promise<void> {
    const appId = this.options.appId;
    const clientNonce = randomNonce();
    const hello = await this.call('link.hello', { protocol: PROTOCOL, appId, appVersion: this.options.appVersion, manifestHash: this.manifestHash, clientNonce }, true);
    if (!hello.ok) throw new Error('ERR_LINK_HELLO');
    const { serverNonce, serverProof } = hello.value as { serverNonce?: unknown; serverProof?: unknown };
    // A Hub that cannot prove the token is not the Hub (another account's pipe, stale session).
    if (typeof serverNonce !== 'string' || !sameProof(proof(token, 'hub', clientNonce, serverNonce, appId), serverProof)) throw new Error('ERR_LINK_NOT_THE_HUB');
    const auth = await this.call('link.auth', { clientProof: proof(token, 'client', serverNonce, clientNonce, appId) }, true);
    if (!auth.ok) throw new Error('ERR_LINK_AUTH');
    this.appearanceValue = (auth.value as { appearance?: unknown }).appearance ?? null;
    this.authenticated = true;
  }

  private close(): void {
    this.authenticated = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve(null);
      this.pending.delete(id);
    }
    this.setStatus('offline');
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer || this.options.autoReconnect === false || !this.manifest) return;
    const delay = Math.round(this.backoff * (0.8 + Math.random() * 0.4));
    this.backoff = Math.min(this.backoff * 2, this.options.maxBackoffMs ?? 60_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private scheduleReady(delay = 20): void {
    if (!this.authenticated) return;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      void this.call('link.ready', { provides: [...this.providers.keys()] });
    }, delay);
    this.readyTimer.unref?.();
  }

  // ---- Messages.

  private send(message: Parameters<typeof encode>[0]): boolean {
    if (!this.socket || (!this.authenticated && !('method' in message && (message.method === 'link.hello' || message.method === 'link.auth')))) return false;
    try {
      this.socket.write(encode(message));
      return true;
    } catch {
      return false;
    }
  }

  private call(method: string, params: Record<string, unknown>, handshake = false): Promise<LinkResult<unknown>> {
    if (!this.socket || (!this.authenticated && !handshake)) return Promise.resolve({ ok: false, error: 'offline' });
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'timeout' });
      }, this.options.requestTimeoutMs ?? 5000);
      timer.unref?.();
      this.pending.set(id, {
        timer,
        resolve: (response) => {
          if (!response) resolve({ ok: false, error: 'offline' });
          else if (response.error) {
            const name = errorName(response.error.code);
            resolve({ ok: false, error: name });
          } else resolve({ ok: true, value: response.result });
        },
      });
      if (!this.send({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: 'too-large' });
      }
    });
  }

  private onLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const message = classify(parsed);
    if (!message) return;
    if (message.type === 'response') {
      const entry = this.pending.get(message.message.id as RpcId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(message.message.id as RpcId);
        entry.resolve(message.message);
      }
      return;
    }
    if (!this.authenticated) return;
    if (message.type === 'notification') {
      this.onNotification(message.message.method, (message.message.params ?? {}) as Record<string, unknown>);
      return;
    }
    void this.onRequest(message.message);
  }

  private onNotification(method: string, params: Record<string, unknown>): void {
    if (method !== 'link.event' || typeof params.event !== 'string') return;
    if (params.event === 'nebula.appearance.changed') this.appearanceValue = params.payload;
    for (const listener of this.listeners.get(params.event) ?? []) {
      try {
        listener(params.payload, typeof params.source === 'string' ? params.source : 'nebula.hub');
      } catch {
        // A faulty listener never breaks the client.
      }
    }
  }

  private async onRequest(request: RpcRequest): Promise<void> {
    const params = (request.params ?? {}) as Record<string, unknown>;
    const reply = (result: unknown) => this.send({ jsonrpc: '2.0', id: request.id, result });
    const fail = (name: LinkErrorName, message?: string) => this.send(errorResponse(request.id, name, message));
    switch (request.method) {
      case 'link.ping':
        reply({});
        return;
      case 'link.query.invoke': {
        const capability = typeof params.capability === 'string' ? params.capability : '';
        const declared = this.manifest ? capabilityOf(this.manifest, capability) : undefined;
        const provider = this.providers.get(capability);
        if (!declared || !provider || !declared.resultSchema) return void fail('unknown-capability');
        try {
          const result = await provider({ requester: typeof params.requester === 'string' ? params.requester : 'unknown', params: (params.params ?? {}) as Record<string, unknown> });
          // `null` means "nothing to show" (e.g. no account unlocked in Finterest).
          if (result === null || result === undefined) return void reply(null);
          if (!validateSchema(declared.resultSchema, result)) return void fail('invalid-result');
          reply(result);
        } catch {
          fail('invalid-result', 'provider failed');
        }
        return;
      }
      case 'link.intent.deliver': {
        const intent = { path: params.path, params: params.params, source: params.source } as Intent;
        if (!this.manifest || typeof intent.path !== 'string' || typeof intent.source !== 'string' || !intent.params || typeof intent.params !== 'object' || !isDeclaredIntent(this.manifest, intent.path, intent.params)) {
          return void reply({ handled: false });
        }
        let handled = false;
        for (const handler of this.intentHandlers) {
          try {
            await handler(intent);
            handled = true;
          } catch {
            // Keep trying the other handlers.
          }
        }
        reply({ handled });
        return;
      }
      default:
        fail('method-not-found');
    }
  }
}
