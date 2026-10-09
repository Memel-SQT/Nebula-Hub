/**
 * @jest-environment node
 */
import { encodeIntentArg, intentFromArgv, isDeclaredIntent, parseDeepLink } from './deeplink';
import { parseManifest, parseManifestBytes, providerOf, shortName, type Manifest } from './manifest';
import { validateSchema } from './schemas';

const FINTEREST = {
  schema: 1,
  appId: 'nebula.finterest',
  provides: [
    { id: 'finterest.budget.remaining', kind: 'widget', sensitivity: 'private', title: { fr: 'Reste à vivre', en: 'Left to spend' }, description: { fr: 'Montant restant ce mois-ci.' }, resultSchema: 'WidgetV1', refreshSeconds: 300 },
    { id: 'finterest.payment.upcoming', kind: 'event', sensitivity: 'private', title: { fr: 'Prélèvement' }, description: { fr: 'Prévu demain.' }, payloadSchema: 'NotificationV1' },
    { id: 'finterest.open-calendar', kind: 'intent', sensitivity: 'public', title: { fr: 'Calendrier' }, description: { fr: 'Ouvre le calendrier.' }, payloadSchema: 'EmptyV1', path: '/calendar' },
  ],
  consumes: [{ id: 'nebula.appearance.changed', kind: 'event' }],
  deepLinks: [
    { path: '/calendar', params: { date: 'date' } },
    { path: '/start', params: { preset: ['classic', 'long'], minutes: 'integer', note: 'text', month: 'month' } },
  ],
  futureField: 'ignored',
};

const parsed = () => (parseManifest(FINTEREST) as { ok: true; manifest: Manifest }).manifest;

describe('manifest (nebula.app.json)', () => {
  it('accepts a complete manifest and ignores unknown fields', () => {
    const result = parseManifest(FINTEREST);
    expect(result.ok).toBe(true);
    expect(parsed().provides.map((capability) => capability.id)).toEqual(['finterest.budget.remaining', 'finterest.payment.upcoming', 'finterest.open-calendar']);
    expect('futureField' in parsed()).toBe(false);
  });

  it.each([
    ['wrong schema', { schema: 2 }],
    ['bad app id', { appId: 'Nebula Finterest' }],
    ['another app prefix', { provides: [{ ...FINTEREST.provides[0], id: 'clock.focus.today' }] }],
    ['the Hub prefix', { provides: [{ ...FINTEREST.provides[0], id: 'nebula.appearance.changed' }] }],
    ['a duplicate', { provides: [FINTEREST.provides[0], FINTEREST.provides[0]] }],
    ['an unknown kind', { provides: [{ ...FINTEREST.provides[0], kind: 'stream' }] }],
    ['an unknown sensitivity', { provides: [{ ...FINTEREST.provides[0], sensitivity: 'secret' }] }],
    ['no French title', { provides: [{ ...FINTEREST.provides[0], title: { en: 'x' } }] }],
    ['an unknown schema', { provides: [{ ...FINTEREST.provides[0], resultSchema: 'HtmlV1' }] }],
    ['a widget refreshed too often', { provides: [{ ...FINTEREST.provides[0], refreshSeconds: 5 }] }],
    ['an intent without its deep link', { provides: [{ ...FINTEREST.provides[2], path: '/missing' }] }],
    ['a bad deep link path', { deepLinks: [{ path: 'calendar', params: {} }] }],
    ['an unknown parameter type', { deepLinks: [{ path: '/x', params: { when: 'datetime' } }] }],
    ['a malformed consume', { consumes: [{ id: 'nebula.appearance.changed' }] }],
  ])('refuses %s', (_label, patch) => {
    expect(parseManifest({ ...FINTEREST, ...patch }).ok).toBe(false);
  });

  it('refuses files that are not JSON or too large', () => {
    expect(parseManifestBytes('{ broken').ok).toBe(false);
    expect(parseManifestBytes(JSON.stringify({ ...FINTEREST, pad: 'x'.repeat(70_000) })).ok).toBe(false);
    expect(parseManifestBytes(JSON.stringify(FINTEREST)).ok).toBe(true);
  });

  it('knows who provides what', () => {
    expect(shortName('nebula.finterest')).toBe('finterest');
    expect(providerOf('finterest.budget.remaining')).toBe('nebula.finterest');
    expect(providerOf('nebula.appearance.changed')).toBe('nebula.hub');
    expect(providerOf('hub.open')).toBe('nebula.hub');
  });
});

describe('deep links and intents', () => {
  it('parses nebula:// links', () => {
    expect(parseDeepLink('nebula://finterest/calendar?date=2026-10-15')).toEqual({ host: 'finterest', path: '/calendar', params: { date: '2026-10-15' } });
    expect(parseDeepLink('nebula://hub/')).toEqual({ host: 'hub', path: '/', params: {} });
    expect(parseDeepLink('nebula://news')).toEqual({ host: 'news', path: '/', params: {} });
  });

  it.each([
    'https://finterest/calendar',
    'nebula://user:pass@finterest/calendar',
    'nebula://finterest:80/calendar',
    'nebula://finterest/calendar#x',
    'nebula://finterest/../etc',
    'nebula://finterest/calendar?date=1&date=2',
    `nebula://finterest/${'a'.repeat(2000)}`,
    42,
  ])('refuses %s', (value) => {
    expect(parseDeepLink(value)).toBeNull();
  });

  it('checks paths and parameters against the manifest', () => {
    const manifest = parsed();
    expect(isDeclaredIntent(manifest, '/calendar', { date: '2026-10-15' })).toBe(true);
    expect(isDeclaredIntent(manifest, '/calendar', {})).toBe(true);
    expect(isDeclaredIntent(manifest, '/calendar', { date: '2026-13-01' })).toBe(false);
    expect(isDeclaredIntent(manifest, '/calendar', { other: 'x' })).toBe(false);
    expect(isDeclaredIntent(manifest, '/unknown', {})).toBe(false);
    expect(isDeclaredIntent(manifest, '/start', { preset: 'classic', minutes: '25', note: 'Pause café', month: '2026-10' })).toBe(true);
    expect(isDeclaredIntent(manifest, '/start', { preset: 'turbo' })).toBe(false);
    expect(isDeclaredIntent(manifest, '/start', { minutes: '-1' })).toBe(false);
    expect(isDeclaredIntent(manifest, '/start', { note: 'a\nb' })).toBe(false);
  });

  it('round-trips the --nebula-intent argument', () => {
    const intent = { path: '/calendar', params: { date: '2026-10-15' }, source: 'nebula.hub' };
    expect(intentFromArgv(['app.exe', encodeIntentArg(intent)])).toEqual(intent);
    expect(intentFromArgv(['app.exe', '--nebula-intent=not-base64-json'])).toBeNull();
    expect(intentFromArgv(['app.exe'])).toBeNull();
  });
});

describe('schemas', () => {
  it('accepts well-formed values', () => {
    expect(validateSchema('WidgetV1', { title: 'Reste à vivre', value: '412,50 €', updatedAt: '2026-10-02T08:00:00Z' })).toBe(true);
    expect(validateSchema('NotificationV1', { title: 'Briefing prêt', body: '3 sujets', sensitivity: 'public', deepLink: 'nebula://news/briefing' })).toBe(true);
    expect(validateSchema('HeadlinesV1', { date: '2026-10-02', items: [{ title: 'Titre', source: 'Le Monde', deepLink: 'nebula://news/briefing' }] })).toBe(true);
    expect(validateSchema('FocusTodayV1', { date: '2026-10-02', done: 3, goal: 8, streak: 12 })).toBe(true);
    expect(validateSchema('BreakStartedV1', { kind: 'long', durationMin: 15 })).toBe(true);
    expect(validateSchema('EmptyV1', {})).toBe(true);
    expect(validateSchema('ArticlesV1', { title: 'Finance', updatedAt: '2026-10-09T08:00:00Z', items: [{ title: 'Comprendre le taux d’usure', source: 'Le Monde', publishedAt: '2026-10-09T06:00:00Z', summary: 'Résumé court.', deepLink: 'nebula://news/article?id=abc' }, { title: 'Sans résumé', source: 'Les Échos', publishedAt: '2026-10-08T06:00:00Z', deepLink: 'nebula://news/article?id=def' }] })).toBe(true);
    expect(validateSchema('AppearanceV1', { theme: 'nebula-dark', accentPreset: 'nebula', customPrimary: '#7c5cff', customSecondary: '#38bdf8', background: 'nebula', motion: 'full', soundEnabled: true, soundVolume: 45, language: 'fr' })).toBe(true);
  });

  it.each([
    ['an extra field', 'WidgetV1', { title: 'x', updatedAt: '2026-10-02T08:00:00Z', html: '<b>' }],
    ['a text too long', 'WidgetV1', { title: 'x'.repeat(81), updatedAt: '2026-10-02T08:00:00Z' }],
    ['too many items', 'WidgetV1', { title: 'x', updatedAt: '2026-10-02T08:00:00Z', items: Array.from({ length: 6 }, () => ({ label: 'a', value: 'b' })) }],
    ['a link that is not nebula://', 'NotificationV1', { title: 'x', body: 'y', sensitivity: 'public', deepLink: 'https://evil.example' }],
    ['a control character', 'NotificationV1', { title: 'x\u0007', body: 'y', sensitivity: 'public' }],
    ['a bad date', 'FocusTodayV1', { date: 'today', done: 1, goal: 2, streak: 0 }],
    ['an article with a web link', 'ArticlesV1', { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [{ title: 'a', source: 'b', publishedAt: '2026-10-09T06:00:00Z', deepLink: 'https://evil.example' }] }],
    ['an article with an image', 'ArticlesV1', { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [{ title: 'a', source: 'b', publishedAt: '2026-10-09T06:00:00Z', deepLink: 'nebula://news/article?id=a', imageUrl: 'https://x/y.png' }] }],
    ['too many articles', 'ArticlesV1', { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: Array.from({ length: 21 }, () => ({ title: 'a', source: 'b', publishedAt: '2026-10-09T06:00:00Z', deepLink: 'nebula://news/article?id=a' })) }],
    ['a summary too long', 'ArticlesV1', { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [{ title: 'a', source: 'b', publishedAt: '2026-10-09T06:00:00Z', summary: 's'.repeat(401), deepLink: 'nebula://news/article?id=a' }] }],
    ['a missing field', 'AppearanceV1', { theme: 'nebula-dark' }],
  ])('refuses %s', (_label, name, value) => {
    expect(validateSchema(name as never, value)).toBe(false);
  });
});
