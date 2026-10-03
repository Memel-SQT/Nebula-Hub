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
  for (const event of ['alpha.tick', 'alpha.alert', 'nebula.appearance.changed', 'nebula.hub.present', 'nebula.hub.dock']) {
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

/** What the fake News answers for each widget (null: the theme is empty today). */
export type NewsWidgets = Partial<Record<'news.headlines.today' | 'news.focus.today' | 'news.finance.today' | 'news.tech.today', () => unknown>>;

/**
 * A fake Nebula News 0.4.0 (ADR-031): the real manifest of News (apps/news/nebula.app.json is a
 * copy of Nebula-News/nebula.app.json), one widget per theme plus "Top stories".
 */
export function news(sessionFile: string, widgets: NewsWidgets = {}): { link: NebulaLink } {
  const link = NebulaLink.create({ appId: 'nebula.news', appVersion: '0.4.0', manifestPath: manifestOf('news'), sessionFile, minBackoffMs: 50, maxBackoffMs: 200, requestTimeoutMs: 1500 });
  const theme = (title: string, path: string) => () => ({
    title,
    caption: 'Nebula News',
    items: [
      { label: 'Un article', value: 'Une source' },
      { label: 'Un autre article', value: 'Une autre source' },
    ],
    deepLink: `nebula://news/theme/${path}`,
    updatedAt: now(),
  });
  link.provide('news.headlines.today', widgets['news.headlines.today'] ?? theme('À la une', 'tech'));
  link.provide('news.focus.today', widgets['news.focus.today'] ?? theme('Développement personnel du jour', 'focus'));
  link.provide('news.finance.today', widgets['news.finance.today'] ?? theme('Finance du jour', 'finance'));
  link.provide('news.tech.today', widgets['news.tech.today'] ?? theme('Tech du jour', 'tech'));
  return { link };
}
