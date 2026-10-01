import { NebulaLink, type Intent } from '@nebula/link';
import { manifestOf } from './test-hub';

/**
 * The two fake apps of the test bench (brief § 8.8), on the real SDK: Alpha provides one
 * capability of each kind (public and private), Beta consumes them.
 */
const now = () => new Date().toISOString();

export function alpha(sessionFile: string, options: { secret?: () => unknown } = {}): { link: NebulaLink; intents: Intent[] } {
  const link = NebulaLink.create({ appId: 'nebula.alpha', appVersion: '1.0.0', manifestPath: manifestOf('alpha'), sessionFile, minBackoffMs: 50, maxBackoffMs: 200, requestTimeoutMs: 1500 });
  const intents: Intent[] = [];
  link.provide('alpha.time', () => ({ title: 'Heure d’Alpha', value: '12:00', updatedAt: now() }));
  link.provide('alpha.secret', options.secret ?? (() => ({ title: 'Solde', value: '412,50 €', updatedAt: now() })));
  link.provide('alpha.status', () => ({ title: 'État', value: 'OK', caption: 'Tout va bien', updatedAt: now() }));
  link.onIntent((intent) => {
    intents.push(intent);
  });
  return { link, intents };
}

export function beta(sessionFile: string): { link: NebulaLink; events: Array<{ event: string; payload: unknown; source: string }> } {
  const link = NebulaLink.create({ appId: 'nebula.beta', appVersion: '1.0.0', manifestPath: manifestOf('beta'), sessionFile, minBackoffMs: 50, maxBackoffMs: 200, requestTimeoutMs: 1500 });
  const events: Array<{ event: string; payload: unknown; source: string }> = [];
  for (const event of ['alpha.tick', 'alpha.alert', 'nebula.appearance.changed', 'nebula.hub.present']) {
    link.on(event, (payload, source) => events.push({ event, payload, source }));
  }
  return { link, events };
}

/** Polls until the condition holds (the protocol is asynchronous). */
export async function eventually(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
