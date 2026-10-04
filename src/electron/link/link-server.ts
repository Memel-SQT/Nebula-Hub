import { randomUUID } from 'node:crypto';
import net from 'node:net';
import {
  APP_ID,
  capabilityOf,
  classify,
  consumesCapability,
  encode,
  errorResponse,
  isDeclaredIntent,
  LineDecoder,
  parseDeepLink,
  proof,
  providerOf,
  PROTOCOL,
  randomNonce,
  sameProof,
  shortName,
  validateSchema,
  type Capability,
  type Intent,
  type LinkErrorName,
  type Manifest,
  type RpcId,
  type RpcRequest,
  type RpcResponse,
} from '@nebula/link';
import { decide, HUB_ID, hubConsumes, notifyCapability, type ConsentDecision, type ConsentState } from '../../shared/consent';
import type { AuditEntry } from './link-store';

/**
 * The Nebula Link hub (docs/NEBULA_LINK.md): a named pipe server for the apps of the family.
 *
 * Nothing is answered before the mutual handshake but `link.hello` / `link.auth`; every exchange
 * is checked against the manifests (declared capabilities, deep links, schemas) and the user's
 * consents, and journaled without its content. Limits: 256 KiB per message, 100 messages per
 * second, 3 invalid messages, 60 s of silence, 5 s for a relayed request.
 */
export interface AdmittedApp {
  appId: string;
  manifest: Manifest;
  /** SHA-256 (hex) of the manifest file in the app's install folder. */
  hash: string;
}

export interface LinkServerDeps {
  pipe: string;
  token: string;
  hubVersion: string;
  /** The app is in the catalog, installed, and its installed manifest is valid. */
  admit(appId: string): Promise<AdmittedApp | null>;
  /** `nebula://<host>/…` → app id (`hub` → the Hub), or null if unknown. */
  appIdForHost(host: string): string | null;
  isInstalled(appId: string): boolean;
  consent(consumer: string, capability: string): ConsentState | null;
  /** A private pair is undecided: ask the user (the Hub de-duplicates). */
  requestConsent(consumer: string, capability: string): void;
  audit(entry: AuditEntry): void;
  appearance(): unknown;
  managesUpdates(): boolean;
  /** I5: a notification accepted for the activity center. */
  notification(appId: string, notification: Record<string, unknown>): void;
  /** Deep link or intent for an installed app that is not connected (`--nebula-intent`). */
  launchWithIntent(appId: string, intent: Intent): Promise<boolean>;
  openAppPage(appId: string): void;
  /** `hub.open` and `nebula://hub/…`. */
  openHub(path: string, params: Record<string, string>): boolean;
  /** Connections or readiness changed (Integrations screen). */
  onChange?(): void;
  now?(): Date;
  requestTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxPerSecond?: number;
}

const HUB_CAPABILITIES: Capability[] = [
  { id: 'nebula.appearance.changed', kind: 'event', sensitivity: 'public', title: { fr: 'Apparence Nebula', en: 'Nebula appearance' }, description: { fr: 'Thème, accent, fond, animations, sons et langue réglés dans le Hub.', en: 'Theme, accent, background, motion, sounds and language set in the Hub.' }, payloadSchema: 'AppearanceV1' },
  { id: 'nebula.hub.present', kind: 'event', sensitivity: 'public', title: { fr: 'Présence du Hub', en: 'Hub presence' }, description: { fr: 'Le Hub est ouvert, avec sa version.', en: 'The Hub is running, with its version.' }, payloadSchema: 'PresenceV1' },
  { id: 'nebula.hub.dock', kind: 'event', sensitivity: 'public', title: { fr: 'Mode Hub', en: 'Hub mode' }, description: { fr: 'Où placer la fenêtre de l’app quand elle s’ouvre dans le Hub.', en: 'Where to place the app window when it opens inside the Hub.' }, payloadSchema: 'DockV1' },
  { id: 'hub.open', kind: 'intent', sensitivity: 'public', title: { fr: 'Ouvrir le Hub', en: 'Open the Hub' }, description: { fr: 'Ouvre le Hub sur un écran.', en: 'Opens the Hub on a screen.' }, payloadSchema: 'EmptyV1', path: '/' },
];

export const HUB_MANIFEST: Manifest = {
  schema: 1,
  appId: HUB_ID,
  provides: HUB_CAPABILITIES,
  consumes: [],
  deepLinks: [
    { path: '/', params: {} },
    { path: '/my-apps', params: {} },
    { path: '/downloads', params: {} },
    { path: '/integrations', params: {} },
    { path: '/settings', params: {} },
    { path: '/app', params: { id: 'text' } },
    // ADR-034: an app asks to be shown inside the Hub (an extension never opens its own window).
    { path: '/docked', params: { id: 'text' } },
  ],
};

interface Connection {
  id: string;
  socket: net.Socket;
  since: Date;
  appId: string | null;
  manifest: Manifest | null;
  handshake: { appId: string; clientNonce: string; serverNonce: string; manifestHash: string } | null;
  authenticated: boolean;
  subscriptions: Set<string>;
  ready: Set<string>;
  pending: Map<RpcId, { resolve: (response: RpcResponse | null) => void; timer: ReturnType<typeof setTimeout> }>;
  nextId: number;
  invalid: number;
  window: { second: number; count: number; floodingSince: number | null };
  lastSeen: number;
}

type Reply = { result: unknown } | { error: LinkErrorName; message?: string };

const NONCE = /^[A-Za-z0-9_-]{43}$/;

function bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch {
    return 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export class LinkServer {
  private server: net.Server | null = null;
  private readonly connections = new Set<Connection>();
  private readonly manifests = new Map<string, Manifest>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  state: 'starting' | 'listening' | 'error' = 'starting';

  constructor(private readonly deps: LinkServerDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Listens on the pipe. A pipe already taken (another Hub, or squatted) is an error state. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.accept(socket));
      server.once('error', (error) => {
        this.state = 'error';
        reject(error);
      });
      server.listen(this.deps.pipe, () => {
        this.server = server;
        this.state = 'listening';
        this.idleTimer = setInterval(() => this.closeIdle(), 15_000);
        this.idleTimer.unref?.();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.idleTimer) clearInterval(this.idleTimer);
    for (const connection of this.connections) connection.socket.destroy();
    this.connections.clear();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /** Authenticated apps, oldest first. */
  connectedApps(): Array<{ appId: string; since: string }> {
    return [...this.connections].filter((connection) => connection.authenticated && connection.appId).map((connection) => ({ appId: connection.appId!, since: connection.since.toISOString() }));
  }

  /** Manifests known to the server (connected apps), the Hub's included. */
  knownManifests(): Manifest[] {
    return [HUB_MANIFEST, ...this.manifests.values()];
  }

  // ---- Hub-side actions.

  /** A Hub event (I1 appearance, I6 presence) to every subscriber allowed to receive it. */
  broadcast(event: string, payload: unknown): void {
    const capability = capabilityOf(HUB_MANIFEST, event);
    if (!capability?.payloadSchema || !validateSchema(capability.payloadSchema, payload)) return;
    for (const connection of this.connections) {
      if (connection.authenticated && connection.subscriptions.has(event)) this.deliverEvent(connection, HUB_ID, capability, payload);
    }
  }

  /**
   * A Hub event for one app only (`nebula.hub.dock`, § 17): delivered if that app is connected,
   * subscribed and allowed. Returns whether it was sent.
   */
  sendTo(appId: string, event: string, payload: unknown): boolean {
    const capability = capabilityOf(HUB_MANIFEST, event);
    if (!capability?.payloadSchema || !validateSchema(capability.payloadSchema, payload)) return false;
    const connection = [...this.connections].find((candidate) => candidate.authenticated && candidate.appId === appId && candidate.subscriptions.has(event));
    if (!connection || this.decision(appId, capability) !== 'allow') return false;
    this.deliverEvent(connection, HUB_ID, capability, payload);
    return true;
  }

  /** Apps connected, subscribed and allowed for a Hub event (`nebula.hub.dock`: ready for the Hub mode). */
  subscribersOf(event: string): string[] {
    const capability = capabilityOf(HUB_MANIFEST, event);
    if (!capability) return [];
    // A pair the user turned off is not reachable: the app is not counted (no prompt, it is public).
    return [...this.connections]
      .filter((connection) => connection.authenticated && connection.appId && connection.subscriptions.has(event) && decide(capability.sensitivity, this.deps.consent(connection.appId, event)) === 'allow')
      .map((connection) => connection.appId!);
  }

  /** The Hub reads a capability (widgets), under the same consent rules as an app. */
  queryAs(consumer: string, capabilityId: string, params: Record<string, unknown> = {}): Promise<Reply> {
    return this.query(consumer, null, capabilityId, params);
  }

  /** The user changed a pair: both sides are told, and a revoked subscription stops at once. */
  consentChanged(consumer: string, capability: string, state: ConsentState | null): void {
    const provider = providerOf(capability);
    for (const connection of this.connections) {
      if (connection.authenticated && (connection.appId === consumer || connection.appId === provider)) {
        this.notify(connection, 'link.consent.changed', { consumer, capability, state });
      }
    }
  }

  /** A `nebula://` link opened from Windows (§ 7). */
  async routeDeepLink(url: string): Promise<'link' | 'launched' | 'store' | 'invalid'> {
    const link = parseDeepLink(url);
    if (!link) return 'invalid';
    const appId = this.deps.appIdForHost(link.host);
    if (!appId) return 'invalid';
    const outcome = await this.routeIntent(HUB_ID, appId, link.path, link.params);
    return 'error' in outcome ? 'invalid' : (outcome.result as { delivered: 'link' | 'launched' | 'store' }).delivered;
  }

  // ---- Connections.

  private accept(socket: net.Socket): void {
    const connection: Connection = {
      id: randomUUID(),
      socket,
      since: this.now(),
      appId: null,
      manifest: null,
      handshake: null,
      authenticated: false,
      subscriptions: new Set(),
      ready: new Set(),
      pending: new Map(),
      nextId: 1,
      invalid: 0,
      window: { second: 0, count: 0, floodingSince: null },
      lastSeen: Date.now(),
    };
    this.connections.add(connection);
    const decoder = new LineDecoder(
      (line) => this.onLine(connection, line),
      () => this.invalid(connection, errorResponse(null, 'too-large')),
    );
    socket.on('data', (chunk: Buffer) => decoder.push(chunk));
    socket.on('error', () => undefined);
    socket.on('close', () => this.drop(connection));
  }

  private drop(connection: Connection): void {
    if (!this.connections.delete(connection)) return;
    for (const [id, entry] of connection.pending) {
      clearTimeout(entry.timer);
      entry.resolve(null);
      connection.pending.delete(id);
    }
    if (connection.appId && ![...this.connections].some((other) => other.appId === connection.appId && other.authenticated)) {
      this.manifests.delete(connection.appId);
    }
    if (connection.authenticated) this.deps.onChange?.();
  }

  private close(connection: Connection): void {
    connection.socket.end();
    connection.socket.destroy();
    this.drop(connection);
  }

  private closeIdle(): void {
    const limit = Date.now() - (this.deps.idleTimeoutMs ?? 60_000);
    for (const connection of [...this.connections]) {
      if (connection.lastSeen < limit) this.close(connection);
    }
  }

  private write(connection: Connection, message: Parameters<typeof encode>[0]): boolean {
    try {
      connection.socket.write(encode(message));
      return true;
    } catch {
      return false;
    }
  }

  private notify(connection: Connection, method: string, params: Record<string, unknown>): void {
    this.write(connection, { jsonrpc: '2.0', method, params });
  }

  /** Three invalid messages close the connection (§ 3). */
  private invalid(connection: Connection, response: RpcResponse): void {
    this.write(connection, response);
    connection.invalid += 1;
    if (connection.invalid >= 3) this.close(connection);
  }

  /** 100 messages per second; flooding for more than 10 s closes the connection. */
  private overRate(connection: Connection): boolean {
    const now = Date.now();
    const second = Math.floor(now / 1000);
    if (connection.window.second !== second) {
      if (connection.window.count <= (this.deps.maxPerSecond ?? 100)) connection.window.floodingSince = null;
      connection.window.second = second;
      connection.window.count = 0;
    }
    connection.window.count += 1;
    if (connection.window.count <= (this.deps.maxPerSecond ?? 100)) return false;
    connection.window.floodingSince ??= now;
    if (now - connection.window.floodingSince > 10_000) this.close(connection);
    return true;
  }

  private onLine(connection: Connection, line: string): void {
    connection.lastSeen = Date.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return this.invalid(connection, errorResponse(null, 'parse-error'));
    }
    const message = classify(parsed);
    if (!message) return this.invalid(connection, errorResponse(null, 'invalid-request'));
    if (message.type === 'response') {
      const entry = connection.pending.get(message.message.id as RpcId);
      if (entry) {
        clearTimeout(entry.timer);
        connection.pending.delete(message.message.id as RpcId);
        entry.resolve(message.message);
      }
      return;
    }
    if (this.overRate(connection)) {
      if (message.type === 'request') this.write(connection, errorResponse(message.message.id, 'rate-limited'));
      return;
    }
    if (!connection.authenticated) {
      // § 4.2: before authentication, only the handshake; anything else ends the connection.
      if (message.type === 'request' && (message.message.method === 'link.hello' || message.message.method === 'link.auth')) {
        void this.handshake(connection, message.message);
      } else {
        this.write(connection, errorResponse(message.type === 'request' ? message.message.id : null, 'unauthenticated'));
        this.close(connection);
      }
      return;
    }
    if (message.type === 'notification') {
      if (message.message.method === 'link.emit') this.onEmit(connection, (message.message.params ?? {}) as Record<string, unknown>);
      return;
    }
    void this.onRequest(connection, message.message);
  }

  private async handshake(connection: Connection, request: RpcRequest): Promise<void> {
    const params = (isRecord(request.params) ? request.params : {}) as Record<string, unknown>;
    const refuse = () => {
      this.write(connection, errorResponse(request.id, 'unauthenticated'));
      this.close(connection);
    };
    if (request.method === 'link.hello') {
      const { protocol, appId, appVersion, manifestHash, clientNonce } = params;
      if (connection.handshake || protocol !== PROTOCOL || typeof appId !== 'string' || !APP_ID.test(appId) || typeof appVersion !== 'string' || appVersion.length > 40
        || typeof manifestHash !== 'string' || !/^[0-9a-f]{64}$/.test(manifestHash) || typeof clientNonce !== 'string' || !NONCE.test(clientNonce)) {
        return refuse();
      }
      const serverNonce = randomNonce();
      connection.handshake = { appId, clientNonce, serverNonce, manifestHash };
      // Same answer whatever the app: nothing tells a stranger which apps are installed.
      this.write(connection, { jsonrpc: '2.0', id: request.id, result: { hubVersion: this.deps.hubVersion, serverNonce, serverProof: proof(this.deps.token, 'hub', clientNonce, serverNonce, appId) } });
      return;
    }
    const handshake = connection.handshake;
    if (!handshake || !sameProof(proof(this.deps.token, 'client', handshake.serverNonce, handshake.clientNonce, handshake.appId), params.clientProof)) return refuse();
    const admitted = await this.deps.admit(handshake.appId);
    if (!admitted || admitted.appId !== handshake.appId || admitted.hash !== handshake.manifestHash) return refuse();
    connection.appId = admitted.appId;
    connection.manifest = admitted.manifest;
    connection.authenticated = true;
    this.manifests.set(admitted.appId, admitted.manifest);
    this.write(connection, {
      jsonrpc: '2.0',
      id: request.id,
      result: { sessionId: connection.id, hubVersion: this.deps.hubVersion, appearance: this.deps.appearance(), consents: this.pairsOf(connection) },
    });
    this.deps.onChange?.();
  }

  /** Current decisions for what this app consumes. */
  private pairsOf(connection: Connection): Array<{ capability: string; state: ConsentState | null }> {
    return (connection.manifest?.consumes ?? []).map((entry) => ({ capability: entry.id, state: this.deps.consent(connection.appId!, entry.id) }));
  }

  private async manifestOf(appId: string): Promise<Manifest | null> {
    if (appId === HUB_ID) return HUB_MANIFEST;
    const known = this.manifests.get(appId);
    if (known) return known;
    const admitted = await this.deps.admit(appId);
    return admitted?.manifest ?? null;
  }

  private decision(consumer: string, capability: Capability): ConsentDecision {
    const decision = decide(capability.sensitivity, this.deps.consent(consumer, capability.id));
    if (decision === 'ask') this.deps.requestConsent(consumer, capability.id);
    return decision;
  }

  private audit(consumer: string, provider: string, capability: string, kind: string, outcome: AuditEntry['outcome'], size = 0): void {
    this.deps.audit({ at: this.now().toISOString(), consumer, provider, capability, kind, outcome, bytes: size });
  }

  private async onRequest(connection: Connection, request: RpcRequest): Promise<void> {
    const params = (isRecord(request.params) ? request.params : {}) as Record<string, unknown>;
    let reply: Reply;
    switch (request.method) {
      case 'link.ping':
        reply = { result: {} };
        break;
      case 'link.ready':
        reply = this.onReady(connection, params);
        break;
      case 'link.subscribe':
      case 'link.unsubscribe':
        reply = await this.onSubscribe(connection, params, request.method === 'link.subscribe');
        break;
      case 'link.query':
        if (typeof params.capability !== 'string' || (params.params !== undefined && !isRecord(params.params))) reply = { error: 'invalid-params' };
        else reply = await this.query(connection.appId!, connection.manifest, params.capability, (params.params ?? {}) as Record<string, unknown>);
        break;
      case 'link.notify':
        reply = this.onNotify(connection, params);
        break;
      case 'link.intent':
        if (typeof params.target !== 'string' || typeof params.path !== 'string' || (params.params !== undefined && !isRecord(params.params))) reply = { error: 'invalid-params' };
        else reply = await this.routeIntent(connection.appId!, params.target, params.path, (params.params ?? {}) as Record<string, string>, connection.manifest);
        break;
      default:
        reply = { error: 'method-not-found' };
    }
    if ('error' in reply) {
      if (reply.error === 'invalid-params' || reply.error === 'method-not-found') connection.invalid += 1;
      this.write(connection, errorResponse(request.id, reply.error, reply.message));
      if (connection.invalid >= 3) this.close(connection);
    } else {
      this.write(connection, { jsonrpc: '2.0', id: request.id, result: reply.result });
    }
  }

  private onReady(connection: Connection, params: Record<string, unknown>): Reply {
    if (!Array.isArray(params.provides) || params.provides.length > 50) return { error: 'invalid-params' };
    const ready = new Set<string>();
    for (const id of params.provides) {
      const capability = typeof id === 'string' ? capabilityOf(connection.manifest!, id) : undefined;
      if (!capability || (capability.kind !== 'query' && capability.kind !== 'widget')) return { error: 'unknown-capability', message: String(id) };
      ready.add(capability.id);
    }
    connection.ready = ready;
    this.deps.onChange?.();
    return { result: {} };
  }

  private async onSubscribe(connection: Connection, params: Record<string, unknown>, subscribe: boolean): Promise<Reply> {
    const event = params.event;
    if (typeof event !== 'string') return { error: 'invalid-params' };
    if (!subscribe) {
      connection.subscriptions.delete(event);
      // An app leaving the Hub mode by itself ("Detach" in the app, § 17): the Hub forgets it.
      if (event === 'nebula.hub.dock') this.deps.onChange?.();
      return { result: {} };
    }
    if (!consumesCapability(connection.manifest!, event)) return { error: 'unknown-capability' };
    const provider = await this.manifestOf(providerOf(event));
    const capability = provider ? capabilityOf(provider, event) : undefined;
    if (!capability || capability.kind !== 'event') return { error: 'unknown-capability' };
    connection.subscriptions.add(event);
    const consent = this.decision(connection.appId!, capability);
    // The Hub's state events are sent at once, so a new client starts in sync.
    if (consent === 'allow' && event === 'nebula.appearance.changed') this.deliverEvent(connection, HUB_ID, capability, this.deps.appearance());
    if (consent === 'allow' && event === 'nebula.hub.present') this.deliverEvent(connection, HUB_ID, capability, this.presence());
    // A docked app that (re)subscribes gets its place at once (§ 17).
    if (event === 'nebula.hub.dock') this.deps.onChange?.();
    return { result: { consent } };
  }

  presence(): Record<string, unknown> {
    return { hubVersion: this.deps.hubVersion, protocol: PROTOCOL, managesUpdates: this.deps.managesUpdates() };
  }

  private deliverEvent(connection: Connection, source: string, capability: Capability, payload: unknown): void {
    const decision = decide(capability.sensitivity, this.deps.consent(connection.appId!, capability.id));
    if (decision !== 'allow') {
      this.audit(connection.appId!, source, capability.id, 'event', decision === 'ask' ? 'consent-required' : 'denied');
      return;
    }
    this.notify(connection, 'link.event', { event: capability.id, payload, source });
    this.audit(connection.appId!, source, capability.id, 'event', 'delivered', bytes(payload));
  }

  private onEmit(connection: Connection, params: Record<string, unknown>): void {
    const capability = typeof params.event === 'string' ? capabilityOf(connection.manifest!, params.event) : undefined;
    if (!capability || capability.kind !== 'event' || !capability.payloadSchema || !validateSchema(capability.payloadSchema, params.payload)) {
      this.audit('-', connection.appId!, String(params.event ?? '?'), 'event', 'invalid');
      return;
    }
    for (const other of this.connections) {
      if (other !== connection && other.authenticated && other.subscriptions.has(capability.id)) this.deliverEvent(other, connection.appId!, capability, params.payload);
    }
    // I5: events made of notifications also feed the Hub's activity center.
    if (hubConsumes(capability)) {
      const decision = this.decision(HUB_ID, capability);
      if (decision === 'allow') {
        this.deps.notification(connection.appId!, params.payload as Record<string, unknown>);
        this.audit(HUB_ID, connection.appId!, capability.id, 'event', 'delivered', bytes(params.payload));
      } else {
        this.audit(HUB_ID, connection.appId!, capability.id, 'event', decision === 'ask' ? 'consent-required' : 'denied');
      }
    }
  }

  private onNotify(connection: Connection, params: Record<string, unknown>): Reply {
    if (!validateSchema('NotificationV1', params)) return { error: 'invalid-params' };
    const capability: Capability = {
      id: notifyCapability(connection.appId!),
      kind: 'event',
      sensitivity: params.sensitivity === 'private' ? 'private' : 'public',
      title: { fr: 'Notifications' },
      description: { fr: 'Notifications envoyées au centre d’activité.' },
      payloadSchema: 'NotificationV1',
    };
    const decision = this.decision(HUB_ID, capability);
    if (decision !== 'allow') {
      this.audit(HUB_ID, connection.appId!, capability.id, 'notify', decision === 'ask' ? 'consent-required' : 'denied');
      return { error: decision === 'ask' ? 'consent-required' : 'consent-denied' };
    }
    this.deps.notification(connection.appId!, params);
    this.audit(HUB_ID, connection.appId!, capability.id, 'notify', 'delivered', bytes(params));
    return { result: { accepted: true } };
  }

  private async query(consumer: string, consumerManifest: Manifest | null, capabilityId: string, params: Record<string, unknown>): Promise<Reply> {
    const providerId = providerOf(capabilityId);
    const provider = await this.manifestOf(providerId);
    const capability = provider ? capabilityOf(provider, capabilityId) : undefined;
    if (!capability || (capability.kind !== 'query' && capability.kind !== 'widget')) return { error: 'unknown-capability' };
    // An app only asks for what it declares; the Hub only reads widgets.
    if (consumerManifest ? !consumesCapability(consumerManifest, capabilityId) : !(consumer === HUB_ID && hubConsumes(capability))) return { error: 'unknown-capability' };
    const decision = this.decision(consumer, capability);
    if (decision !== 'allow') {
      this.audit(consumer, providerId, capabilityId, capability.kind, decision === 'ask' ? 'consent-required' : 'denied');
      return { error: decision === 'ask' ? 'consent-required' : 'consent-denied' };
    }
    const target = [...this.connections].find((connection) => connection.authenticated && connection.appId === providerId && connection.ready.has(capabilityId));
    if (!target) {
      this.audit(consumer, providerId, capabilityId, capability.kind, 'offline');
      return { error: 'provider-offline' };
    }
    const response = await this.request(target, 'link.query.invoke', { capability: capabilityId, params, requester: consumer });
    if (!response) {
      this.audit(consumer, providerId, capabilityId, capability.kind, 'timeout');
      return { error: 'timeout' };
    }
    if (response.error) {
      this.audit(consumer, providerId, capabilityId, capability.kind, 'error');
      return { error: response.error.code === -32010 ? 'invalid-result' : 'provider-offline' };
    }
    const result = response.result ?? null;
    if (result !== null && !validateSchema(capability.resultSchema!, result)) {
      this.audit(consumer, providerId, capabilityId, capability.kind, 'invalid');
      return { error: 'invalid-result' };
    }
    this.audit(consumer, providerId, capabilityId, capability.kind, 'delivered', bytes(result));
    return { result };
  }

  /** § 7: to the connected app over Link, else launch it with --nebula-intent, else its page. */
  private async routeIntent(source: string, target: string, path: string, params: Record<string, string>, sourceManifest: Manifest | null = null): Promise<Reply> {
    if (!Object.values(params).every((value) => typeof value === 'string')) return { error: 'invalid-params' };
    const manifest = await this.manifestOf(target);
    if (target === HUB_ID) {
      if (!isDeclaredIntent(HUB_MANIFEST, path, params)) return { error: 'invalid-params' };
      // An app may ask to be shown inside the Hub, never another app.
      if (path === '/docked' && params.id !== source) return { error: 'invalid-params' };
      this.audit(source, HUB_ID, 'hub.open', 'intent', 'delivered', bytes(params));
      return { result: { delivered: this.deps.openHub(path, params) ? 'link' : 'store' } };
    }
    if (!manifest) {
      // Not installed (or no Link manifest): the Hub shows its page.
      if (this.deps.isInstalled(target)) return { error: 'unknown-capability' };
      this.deps.openAppPage(target);
      return { result: { delivered: 'store' } };
    }
    if (!isDeclaredIntent(manifest, path, params)) return { error: 'invalid-params' };
    // An intent capability on this path follows its consent (public: allowed by default).
    const capability = manifest.provides.find((candidate) => candidate.kind === 'intent' && candidate.path === path);
    if (capability && sourceManifest && !consumesCapability(sourceManifest, capability.id)) return { error: 'unknown-capability' };
    if (capability) {
      const decision = this.decision(source, capability);
      if (decision !== 'allow') return { error: decision === 'ask' ? 'consent-required' : 'consent-denied' };
    }
    const intent: Intent = { path, params, source };
    const capabilityId = capability?.id ?? `${shortName(target)}${path.replace(/\//g, '.')}`;
    const connection = [...this.connections].find((candidate) => candidate.authenticated && candidate.appId === target);
    if (connection) {
      const response = await this.request(connection, 'link.intent.deliver', { ...intent });
      if (response?.result && isRecord(response.result) && response.result.handled === true) {
        this.audit(source, target, capabilityId, 'intent', 'delivered', bytes(params));
        return { result: { delivered: 'link' } };
      }
    }
    if (await this.deps.launchWithIntent(target, intent)) {
      this.audit(source, target, capabilityId, 'intent', 'delivered', bytes(params));
      return { result: { delivered: 'launched' } };
    }
    this.audit(source, target, capabilityId, 'intent', 'error');
    return { error: 'provider-offline' };
  }

  /** A request from the Hub to an app; null on timeout or disconnection. */
  private request(connection: Connection, method: string, params: Record<string, unknown>): Promise<RpcResponse | null> {
    const id = connection.nextId;
    connection.nextId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        connection.pending.delete(id);
        resolve(null);
      }, this.deps.requestTimeoutMs ?? 5000);
      connection.pending.set(id, { resolve, timer });
      if (!this.write(connection, { jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        connection.pending.delete(id);
        resolve(null);
      }
    });
  }
}
