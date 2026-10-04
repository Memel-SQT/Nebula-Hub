import { entries } from '../../tests/renderer/fixtures';
import type { CatalogApp } from './catalog';
import { backgroundStartBlocker, isExtension, MAX_STARTS, STARTING_MS } from './extensions';
import type { InstalledApp } from './installed-view';

const NEWS = entries().find((entry) => entry.app.id === 'nebula.news')!.app;
const CLOCK = entries().find((entry) => entry.app.id === 'nebula.clock')!.app;

function installed(patch: Partial<InstalledApp> = {}): InstalledApp {
  return { appId: 'nebula.news', version: '0.5.0', scope: 'user', location: 'C:\\Users\\<user>\\AppData\\Local\\Programs\\Nebula News', exeFound: true, running: false, ...patch };
}

describe('extensions kept in the background (ADR-034)', () => {
  it('marks Nebula News as an extension in the shipped catalog', () => {
    expect(NEWS.extension).toEqual({ backgroundArgument: '--background', minVersion: '0.5.0' });
    expect(isExtension(NEWS)).toBe(true);
    expect(isExtension(CLOCK)).toBe(false);
  });

  it('starts an installed extension that is not running', () => {
    expect(backgroundStartBlocker(NEWS, installed(), [], 1_000_000, false)).toBeNull();
  });

  it('never starts an app that is not an extension, missing, running, busy or too old', () => {
    expect(backgroundStartBlocker(CLOCK as CatalogApp, installed({ appId: 'nebula.clock' }), [], 0, false)).toBe('not-extension');
    expect(backgroundStartBlocker(NEWS, undefined, [], 0, false)).toBe('not-installed');
    expect(backgroundStartBlocker(NEWS, installed({ exeFound: false }), [], 0, false)).toBe('not-installed');
    expect(backgroundStartBlocker(NEWS, installed({ running: true }), [], 0, false)).toBe('running');
    // News 0.4.x would open its window at every start of the Hub.
    expect(backgroundStartBlocker(NEWS, installed({ version: '0.4.1' }), [], 0, false)).toBe('too-old');
    expect(backgroundStartBlocker(NEWS, installed({ version: null }), [], 0, false)).toBe('too-old');
    expect(backgroundStartBlocker(NEWS, installed(), [], 0, true)).toBe('busy');
  });

  it('waits while a start is in progress, and gives up after a few starts in a row', () => {
    const now = 10_000_000;
    expect(backgroundStartBlocker(NEWS, installed(), [now - STARTING_MS + 1], now, false)).toBe('starting');
    const crashes = Array.from({ length: MAX_STARTS }, (_, index) => now - STARTING_MS - index * 60_000);
    expect(backgroundStartBlocker(NEWS, installed(), crashes, now, false)).toBe('too-many-starts');
    expect(backgroundStartBlocker(NEWS, installed(), [now - 11 * 60_000], now, false)).toBeNull();
  });
});
