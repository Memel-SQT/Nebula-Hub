import type { BackupProblem } from './backup';
import type { CatalogEntry } from './catalog-view';
import { updateAvailable, type InstalledApp } from './installed-view';

/**
 * Lifecycle of an app in the Hub (brief §7.2). An operation walks
 * `queued → downloading → verifying → ready → [waiting-for-app-exit] → installing →
 * verifying-install → installed`, and may end in `failed` or `cancelled` at any step that allows
 * it. `installed`, `update-available` and `absent` are the resting phases, derived from the
 * detection; `repairing` and `uninstalling` start from an installed app (M5).
 *
 * M5 (ADR-022) adds three phases: `backing-up` (the app writes its own backup before an update,
 * a repair or an uninstall, brief §7.6), `backup-failed` (the operation waits for the user's
 * second confirmation, or a cancel) and `removing` (the uninstaller runs; the registry key must
 * disappear).
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
  | 'backing-up'
  | 'backup-failed'
  | 'removing'
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
  'backing-up',
  'backup-failed',
  'removing',
  'failed',
  'cancelled',
];

const TRANSITIONS: Record<InstallPhase, readonly InstallPhase[]> = {
  absent: ['queued'],
  installed: ['update-available', 'repairing', 'uninstalling'],
  // An app's own updater may install the new version behind the Hub's back: back to installed.
  'update-available': ['queued', 'installed', 'repairing', 'uninstalling'],
  // A repair reinstalls the same version: it goes through the download pipeline.
  repairing: ['queued', 'failed', 'cancelled'],
  // An uninstall waits for the app to be closed, lets it back up its data, then removes it.
  uninstalling: ['waiting-for-app-exit', 'backing-up', 'removing', 'failed', 'cancelled'],
  queued: ['downloading', 'failed', 'cancelled'],
  downloading: ['verifying', 'failed', 'cancelled'],
  verifying: ['ready', 'failed', 'cancelled'],
  ready: ['waiting-for-app-exit', 'backing-up', 'installing', 'failed', 'cancelled'],
  // Once the app is closed, the version is read again (ADR-004): its own updater may already
  // have installed the update, hence the jump to verifying-install.
  'waiting-for-app-exit': ['backing-up', 'installing', 'removing', 'verifying-install', 'failed', 'cancelled'],
  'backing-up': ['backup-failed', 'installing', 'removing', 'failed', 'cancelled'],
  // R04: continuing without a backup needs a second, explicit confirmation.
  'backup-failed': ['installing', 'removing', 'failed', 'cancelled'],
  // A running NSIS installer or uninstaller cannot be interrupted safely: no cancel from here on.
  installing: ['verifying-install', 'failed'],
  'verifying-install': ['installed', 'failed'],
  removing: ['absent', 'failed'],
  // After a failure or a cancel, the next detection says where the app really is, and any
  // operation can be tried again.
  failed: ['queued', 'absent', 'installed', 'update-available', 'repairing', 'uninstalling'],
  cancelled: ['queued', 'absent', 'installed', 'update-available', 'repairing', 'uninstalling'],
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
const ACTIVE: ReadonlySet<InstallPhase> = new Set(['queued', 'downloading', 'verifying', 'ready', 'waiting-for-app-exit', 'installing', 'verifying-install', 'repairing', 'uninstalling', 'backing-up', 'backup-failed', 'removing']);

/** Phases an operation waits in before its turn comes (the queue only ever runs one at a time). */
export const PENDING_PHASES: readonly InstallPhase[] = ['queued', 'repairing', 'uninstalling'];

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

/** What an operation does: `install` (M4), then `update`, `repair` and `uninstall` (M5). */
export type OperationKind = 'install' | 'update' | 'repair' | 'uninstall';

/** R04: these need an explicit confirmation stating what happens to the data. */
export function needsConfirmation(kind: OperationKind, entry: CatalogEntry | undefined): boolean {
  if (kind === 'repair' || kind === 'uninstall') return true;
  return kind === 'update' && Boolean(entry?.app.windows.preOperationBackup);
}

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
  | 'no-uninstaller'
  | 'uninstall-timeout'
  | 'backup-failed'
  | 'internal';

/** The app's own backup before the operation (brief §7.6). */
export interface BackupStatus {
  /** Full path of the file the app is asked to write (shown before confirming). */
  path: string;
  state: 'pending' | 'running' | 'ok' | 'failed' | 'skipped';
  /** Accounts found in a valid backup (0 is valid: nothing to lose). */
  accounts: number | null;
  problem: BackupProblem | null;
}

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
  /** Present for apps that back up their data before an update, repair or uninstall. */
  backup: BackupStatus | null;
  /** Started by the automatic updates, not by a click (never waits for the user). */
  auto: boolean;
  /** The user asked the Hub to close the app (R08): one polite close request was sent. */
  closeRequested: boolean;
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
export type EnqueueResult =
  | 'queued'
  | 'unknown-app'
  | 'is-hub'
  | 'no-installer'
  | 'requires-newer-hub'
  | 'already-installed'
  | 'already-queued'
  | 'not-installed'
  | 'no-update'
  | 'repair-unavailable'
  | 'no-uninstaller'
  | 'confirmation-required';

/** What the confirmation screen shows before an update, repair or uninstall (R04). */
export interface OperationPlan {
  appId: string;
  kind: OperationKind;
  /** Version installed by the operation (null for an uninstall). */
  version: string | null;
  fromVersion: string | null;
  needsConfirmation: boolean;
  /** Where the app's backup will be written, when it makes one. */
  backupPath: string | null;
  /** The app is open now: it will have to be closed (never by force, R08). */
  running: boolean;
  /** Why the operation is not possible, when it is not. */
  blocked: Exclude<EnqueueResult, 'queued' | 'confirmation-required'> | null;
}
