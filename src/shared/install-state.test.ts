import {
  canTransition,
  IllegalTransitionError,
  INSTALL_PHASES,
  isActive,
  isCancellable,
  restingPhase,
  transition,
  type InstallPhase,
} from './install-state';
import type { CatalogEntry } from './catalog-view';

// The complete table, written out independently of the implementation: every pair not listed
// here must be refused.
const LEGAL: Record<InstallPhase, InstallPhase[]> = {
  absent: ['queued'],
  installed: ['update-available', 'repairing', 'uninstalling'],
  'update-available': ['queued', 'installed', 'repairing', 'uninstalling'],
  repairing: ['queued', 'failed', 'cancelled'],
  queued: ['downloading', 'failed', 'cancelled'],
  downloading: ['verifying', 'failed', 'cancelled'],
  verifying: ['ready', 'failed', 'cancelled'],
  ready: ['waiting-for-app-exit', 'installing', 'failed', 'cancelled'],
  'waiting-for-app-exit': ['installing', 'failed', 'cancelled'],
  installing: ['verifying-install', 'failed'],
  'verifying-install': ['installed', 'failed'],
  uninstalling: ['absent', 'failed'],
  failed: ['queued', 'absent', 'installed', 'update-available'],
  cancelled: ['queued', 'absent', 'installed', 'update-available'],
};

describe('install state machine', () => {
  const pairs = INSTALL_PHASES.flatMap((from) => INSTALL_PHASES.map((to) => [from, to] as const));

  it.each(pairs.filter(([from, to]) => LEGAL[from].includes(to)))('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transition(from, to)).toBe(to);
  });

  it.each(pairs.filter(([from, to]) => !LEGAL[from].includes(to)))('refuses %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transition(from, to)).toThrow(IllegalTransitionError);
  });

  it('covers every phase of the brief', () => {
    expect([...INSTALL_PHASES].sort()).toEqual(Object.keys(LEGAL).sort());
  });

  it('walks the full install path', () => {
    const path: InstallPhase[] = ['absent', 'queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'installed'];
    let phase = path[0];
    for (const next of path.slice(1)) phase = transition(phase, next);
    expect(phase).toBe('installed');
  });

  it('never cancels a running installer', () => {
    expect(isCancellable('installing')).toBe(false);
    expect(isCancellable('verifying-install')).toBe(false);
    expect(isCancellable('downloading')).toBe(true);
    expect(isCancellable('waiting-for-app-exit')).toBe(true);
  });

  it('knows which phases are in flight', () => {
    expect(INSTALL_PHASES.filter(isActive)).toEqual(['queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'repairing', 'uninstalling']);
  });
});

describe('resting phase', () => {
  const entry = (version: string | null) => ({ release: version ? { version } : null }) as unknown as CatalogEntry;
  const app = (version: string | null) => ({ appId: 'nebula.finterest', version, scope: 'user' as const, location: 'C:\\x', exeFound: true, running: false });

  it('derives absent, installed and update-available from the detection', () => {
    expect(restingPhase(entry('0.1.36'), undefined)).toBe('absent');
    expect(restingPhase(entry('0.1.36'), app('0.1.36'))).toBe('installed');
    expect(restingPhase(entry('0.1.36'), app('0.1.35'))).toBe('update-available');
    expect(restingPhase(entry('0.1.35'), app('0.1.36'))).toBe('installed');
    expect(restingPhase(entry(null), app('0.1.35'))).toBe('installed');
    expect(restingPhase(entry('0.1.36'), app(null))).toBe('installed');
  });
});
