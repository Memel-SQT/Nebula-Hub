import {
  canTransition,
  IllegalTransitionError,
  INSTALL_PHASES,
  isActive,
  isCancellable,
  needsConfirmation,
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
  uninstalling: ['waiting-for-app-exit', 'backing-up', 'removing', 'failed', 'cancelled'],
  queued: ['downloading', 'failed', 'cancelled'],
  downloading: ['verifying', 'failed', 'cancelled'],
  verifying: ['ready', 'failed', 'cancelled'],
  ready: ['waiting-for-app-exit', 'backing-up', 'installing', 'failed', 'cancelled'],
  'waiting-for-app-exit': ['backing-up', 'installing', 'removing', 'verifying-install', 'failed', 'cancelled'],
  'backing-up': ['backup-failed', 'installing', 'removing', 'failed', 'cancelled'],
  'backup-failed': ['installing', 'removing', 'failed', 'cancelled'],
  installing: ['verifying-install', 'failed'],
  'verifying-install': ['installed', 'failed'],
  removing: ['absent', 'failed'],
  failed: ['queued', 'absent', 'installed', 'update-available', 'repairing', 'uninstalling'],
  cancelled: ['queued', 'absent', 'installed', 'update-available', 'repairing', 'uninstalling'],
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

  it('walks the update, repair and uninstall paths', () => {
    const walk = (path: InstallPhase[]) => path.slice(1).reduce((phase, next) => transition(phase, next), path[0]);
    expect(walk(['update-available', 'queued', 'downloading', 'verifying', 'ready', 'backing-up', 'backup-failed', 'installing', 'verifying-install', 'installed'])).toBe('installed');
    expect(walk(['installed', 'repairing', 'queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'backing-up', 'installing', 'verifying-install', 'installed'])).toBe('installed');
    expect(walk(['installed', 'uninstalling', 'waiting-for-app-exit', 'backing-up', 'removing', 'absent'])).toBe('absent');
    expect(walk(['update-available', 'queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'verifying-install', 'installed'])).toBe('installed');
  });

  it('never cancels a running installer or uninstaller', () => {
    expect(isCancellable('installing')).toBe(false);
    expect(isCancellable('removing')).toBe(false);
    expect(isCancellable('backup-failed')).toBe(true);
    expect(isCancellable('verifying-install')).toBe(false);
    expect(isCancellable('downloading')).toBe(true);
    expect(isCancellable('waiting-for-app-exit')).toBe(true);
  });

  it('knows which phases are in flight', () => {
    expect(INSTALL_PHASES.filter(isActive)).toEqual(['queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'repairing', 'uninstalling', 'backing-up', 'backup-failed', 'removing']);
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

describe('confirmation (R04)', () => {
  const entry = (backup: boolean) => ({ app: { windows: backup ? { preOperationBackup: {} } : {} } }) as unknown as CatalogEntry;

  it('is required for repairs and uninstalls, and for updates of apps that back up their data', () => {
    expect(needsConfirmation('install', entry(true))).toBe(false);
    expect(needsConfirmation('update', entry(false))).toBe(false);
    expect(needsConfirmation('update', entry(true))).toBe(true);
    expect(needsConfirmation('repair', entry(false))).toBe(true);
    expect(needsConfirmation('uninstall', entry(false))).toBe(true);
  });
});
