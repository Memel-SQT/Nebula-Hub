import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseManifestBytes, sha256Hex, type Intent } from '@nebula/link';
import { HUB_ID, pairKey, type ConsentState } from '../../src/shared/consent';
import { LinkServer, type LinkServerDeps } from '../../src/electron/link/link-server';
import type { AuditEntry } from '../../src/electron/link/link-store';
import { writeSession } from '../../src/electron/link/session';

/**
 * The Hub's Link server in test mode (brief § 8.8): pipe and session file in a temporary
 * folder, "installed apps" and consents in memory, every side effect recorded.
 */
// Next to this file under Jest; from the repository root when bundled by `npm run link:demo`.
export const APPS_DIR = fs.existsSync(path.join(__dirname, 'apps')) ? path.join(__dirname, 'apps') : path.resolve('tests', 'link-harness', 'apps');
export const manifestOf = (name: string) => path.join(APPS_DIR, name, 'nebula.app.json');

export const APPEARANCE = { theme: 'nebula-dark', accentPreset: 'nebula', customPrimary: '#7c5cff', customSecondary: '#38bdf8', background: 'nebula', motion: 'full', soundEnabled: true, soundVolume: 45, language: 'fr' };

export interface TestHub {
  server: LinkServer;
  dir: string;
  sessionFile: string;
  pipe: string;
  token: string;
  /** appId → manifest file of the "installed" app. */
  installed: Map<string, string>;
  /** Apps in the catalog but not installed. */
  catalogOnly: Set<string>;
  consents: Map<string, ConsentState>;
  consentRequests: Array<{ consumer: string; capability: string }>;
  notifications: Array<{ appId: string; notification: Record<string, unknown> }>;
  launches: Array<{ appId: string; intent: Intent }>;
  pages: string[];
  hubOpens: Array<{ path: string; params: Record<string, string> }>;
  audit: AuditEntry[];
  grant(consumer: string, capability: string): void;
  deny(consumer: string, capability: string): void;
  stop(): Promise<void>;
}

export async function startTestHub(options: { installed?: Record<string, string>; catalogOnly?: string[]; deps?: Partial<LinkServerDeps> } = {}): Promise<TestHub> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-link-'));
  const pipe = `\\\\.\\pipe\\nebula-link-test-${randomBytes(8).toString('hex')}`;
  const session = await writeSession(dir, pipe, '9.9.9-test');
  const hub = {
    dir,
    sessionFile: path.join(dir, 'session.json'),
    pipe,
    token: session.token,
    installed: new Map(Object.entries(options.installed ?? { 'nebula.alpha': manifestOf('alpha'), 'nebula.beta': manifestOf('beta') })),
    catalogOnly: new Set(options.catalogOnly ?? ['nebula.gamma']),
    consents: new Map<string, ConsentState>(),
    consentRequests: [] as TestHub['consentRequests'],
    notifications: [] as TestHub['notifications'],
    launches: [] as TestHub['launches'],
    pages: [] as string[],
    hubOpens: [] as TestHub['hubOpens'],
    audit: [] as AuditEntry[],
  } as TestHub;
  hub.grant = (consumer, capability) => {
    hub.consents.set(pairKey(consumer, capability), 'granted');
    hub.server.consentChanged(consumer, capability, 'granted');
  };
  hub.deny = (consumer, capability) => {
    hub.consents.set(pairKey(consumer, capability), 'denied');
    hub.server.consentChanged(consumer, capability, 'denied');
  };
  hub.server = new LinkServer({
    pipe,
    token: session.token,
    hubVersion: '9.9.9-test',
    async admit(appId) {
      const file = hub.installed.get(appId);
      if (!file) return null;
      const bytes = fs.readFileSync(file);
      const parsed = parseManifestBytes(bytes);
      return parsed.ok && parsed.manifest.appId === appId ? { appId, manifest: parsed.manifest, hash: sha256Hex(bytes) } : null;
    },
    appIdForHost: (host) => (host === 'hub' ? HUB_ID : hub.installed.has(`nebula.${host}`) || hub.catalogOnly.has(`nebula.${host}`) ? `nebula.${host}` : null),
    isInstalled: (appId) => hub.installed.has(appId),
    consent: (consumer, capability) => hub.consents.get(pairKey(consumer, capability)) ?? null,
    requestConsent: (consumer, capability) => hub.consentRequests.push({ consumer, capability }),
    audit: (entry) => hub.audit.push(entry),
    appearance: () => APPEARANCE,
    managesUpdates: () => true,
    notification: (appId, notification) => hub.notifications.push({ appId, notification }),
    launchWithIntent: async (appId, intent) => {
      hub.launches.push({ appId, intent });
      return true;
    },
    openAppPage: (appId) => hub.pages.push(appId),
    openHub: (route, params) => {
      hub.hubOpens.push({ path: route, params });
      return true;
    },
    requestTimeoutMs: 1000,
    ...options.deps,
  });
  await hub.server.start();
  hub.stop = async () => {
    await hub.server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return hub;
}
