import type { CatalogEntry } from './catalog-view';
import { updateAvailable, type InstalledApp } from './installed-view';

/**
 * Lifecycle of an app in the Hub (brief §7.2). An operation walks
 * `queued → downloading → verifying → ready → [waiting-for-app-exit] → installing →
 * verifying-install → installed`, and may end in `failed` or `cancelled` at any step that allows
 * it. `installed`, `update-available` and `absent` are the resting phases, derived from the
 * detection; `repairing` and `uninstalling` start from an installed app (M5).
 *
 * Every change goes through `transition`, which throws on an illegal move: the UI can then only
 * ever show a state the pipeline really reached.
 */
export type InstallPhase =
  | 'absent'
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'waiting-for-app-exit'
  | 'installing'
  | 'verifying-install'
  | 'installed'
  | 'update-available'
  | 'repairing'
  | 'uninstalling'
  | 'failed'
  | 'cancelled';

export const INSTALL_PHASES: readonly InstallPhase[] = [
  'absent',
  'queued',
  'downloading',
  'verifying',
  'ready',
  'waiting-for-app-exit',
  'installing',
  'verifying-install',
  'installed',
  'update-available',
  'repairing',
  'uninstalling',
  'failed',
  'cancelled',
];

const TRANSITIONS: Record<InstallPhase, readonly InstallPhase[]> = {
  absent: ['queued'],
  installed: ['update-available', 'repairing', 'uninstalling'],
  // An app's own updater may install the new version behind the Hub's back: back to installed.
  'update-available': ['queued', 'installed', 'repairing', 'uninstalling'],
  repairing: ['queued', 'failed', 'cancelled'],
  queued: ['downloading', 'failed', 'cancelled'],
  downloading: ['verifying', 'failed', 'cancelled'],
  verifying: ['ready', 'failed', 'cancelled'],
  ready: ['waiting-for-app-exit', 'installing', 'failed', 'cancelled'],
  'waiting-for-app-exit': ['installing', 'failed', 'cancelled'],
  // A running NSIS installer cannot be interrupted safely: no cancel from here on.
  installing: ['verifying-install', 'failed'],
  'verifying-install': ['installed', 'failed'],
  uninstalling: ['absent', 'failed'],
  // After a failure or a cancel, the next detection says where the app really is.
  failed: ['queued', 'absent', 'installed', 'update-available'],
  cancelled: ['queued', 'absent', 'installed', 'update-available'],
};

export class IllegalTransitionError extends Error {
  constructor(readonly from: InstallPhase, readonly to: InstallPhase) {
    super(`ERR_ILLEGAL_TRANSITION ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: InstallPhase, to: InstallPhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(from: InstallPhase, to: InstallPhase): InstallPhase {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

/** Phases during which an operation is in flight (shown in the queue, blocks a second one). */
const ACTIVE: ReadonlySet<InstallPhase> = new Set(['queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'repairing', 'uninstalling']);

export function isActive(phase: InstallPhase): boolean {
  return ACTIVE.has(phase);
}

export function isCancellable(phase: InstallPhase): boolean {
  return canTransition(phase, 'cancelled');
}

/** Where an app rests when nothing is running for it: absent, installed or update-available. */
export function restingPhase(entry: CatalogEntry | undefined, installed: InstalledApp | undefined): InstallPhase {
  if (!installed) return 'absent';
  return updateAvailable(entry, installed) ? 'update-available' : 'installed';
}

/** What an operation does. M4 ships `install`; `update` and `repair` reuse the pipeline in M5. */
export type OperationKind = 'install' | 'update' | 'repair';

/** Why an operation failed, in terms the UI can explain (never a raw error message). */
export type FailureReason =
  | 'offline'
  | 'timeout'
  | 'blocked'
  | 'rate-limited'
  | 'http'
  | 'size-mismatch'
  | 'hash-mismatch'
  | 'disk'
  | 'no-installer'
  | 'app-running'
  | 'installer-exit'
  | 'installer-timeout'
  | 'not-detected'
  | 'version-mismatch'
  | 'internal';

/** One operation as the renderer sees it (queue and progress). */
export interface OperationView {
  id: string;
  appId: string;
  kind: OperationKind;
  /** Version being installed. */
  version: string;
  /** Version installed before the operation, if any. */
  fromVersion: string | null;
  phase: InstallPhase;
  failure: FailureReason | null;
  /** HTTP status or installer exit code, for the details line. */
  failureDetail: string | null;
  received: number;
  total: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  /** The download continued a previous partial file (HTTP Range). */
  resumed: boolean;
  queuedAt: string;
  finishedAt: string | null;
}

export type HistoryOutcome = 'success' | 'failed' | 'cancelled';

/** One line of `install_history` (brief §9.5). */
export interface HistoryEntry {
  id: number;
  appId: string;
  kind: OperationKind;
  version: string;
  fromVersion: string | null;
  outcome: HistoryOutcome;
  failure: FailureReason | null;
  detail: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface DownloadsView {
  operations: OperationView[];
  history: HistoryEntry[];
}

export const EMPTY_DOWNLOADS_VIEW: DownloadsView = { operations: [], history: [] };

/** Answer to an install request, before anything is queued. */
export type EnqueueResult = 'queued' | 'unknown-app' | 'is-hub' | 'no-installer' | 'requires-newer-hub' | 'already-installed' | 'already-queued';
