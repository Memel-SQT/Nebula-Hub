import type { CSSProperties } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import { isActive, isCancellable, type InstallPhase, type OperationView } from '@shared/install-state';
import { progressRatio } from '@shared/progress';
import { formatBytes, formatDuration, formatPercent, useLanguage, useT } from '../i18n';

const PHASE_ICONS: Partial<Record<InstallPhase, IconName>> = {
  queued: 'history',
  repairing: 'history',
  uninstalling: 'history',
  downloading: 'download',
  verifying: 'shield',
  ready: 'check',
  'waiting-for-app-exit': 'pause',
  'backing-up': 'folderSync',
  'backup-failed': 'alert',
  installing: 'package',
  removing: 'uninstall',
  'verifying-install': 'shield',
  installed: 'check',
  absent: 'check',
  failed: 'alert',
  cancelled: 'close',
};

export interface OperationActions {
  onCancel?: (operationId: string) => void;
  onRetry?: (appId: string, kind: OperationView['kind']) => void;
  onDismiss?: (operationId: string) => void;
  onLaunch?: (appId: string) => void;
  /** R08: the user asks the Hub to close the app (one polite request). */
  onRequestClose?: (operationId: string) => void;
  /** R04: opens the second confirmation after a failed backup. */
  onContinueWithoutBackup?: (operation: OperationView) => void;
}

/**
 * One operation (brief §7.2): its exact phase, a progress bar in bytes, the speed and the time
 * left while downloading, the app's backup, and what the user can do now. The bar moves with
 * `transform: scaleX` only (no layout animation), and nothing loops.
 */
export function OperationStatus({ operation, name, onCancel, onRetry, onDismiss, onLaunch, onRequestClose, onContinueWithoutBackup }: OperationActions & { operation: OperationView; name: string }) {
  const t = useT();
  const language = useLanguage();
  const { phase, backup } = operation;
  const active = isActive(phase);
  const downloading = phase === 'downloading' || phase === 'queued';
  const showsBytes = operation.kind !== 'uninstall';
  const ratio = downloading ? progressRatio(operation.received, operation.total) : 1;
  const version = `v${operation.version}`;
  const failure = operation.failure ? t(`install.failure.${operation.failure}`, { detail: operation.failureDetail ?? '?', name }) : null;
  const done = phase === 'installed' || phase === 'absent';
  const doneKey = operation.failureDetail === 'self-updated' ? 'install.done.self-updated' : (`install.done.${operation.kind}` as const);
  const meta = [
    t('install.progress', { received: formatBytes(language, operation.received), total: formatBytes(language, operation.total) }),
    operation.bytesPerSecond ? t('install.speed', { speed: formatBytes(language, operation.bytesPerSecond) }) : null,
    operation.etaSeconds !== null && operation.etaSeconds > 0 ? t('install.eta', { time: formatDuration(language, operation.etaSeconds) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`operation operation-${phase}`}>
      <div className="operation-head">
        <span className="operation-phase">
          <Icon name={PHASE_ICONS[phase] ?? 'info'} size={15} />
          {t(`install.phase.${phase}`)}
          {phase === 'downloading' ? <b className="tabular">{formatPercent(language, ratio)}</b> : null}
        </span>
        <span className="operation-version tabular">{operation.kind === 'uninstall' ? t('downloads.kind.uninstall') : version}</span>
      </div>
      {active ? (
        <div
          className={`progress-track ${downloading ? '' : 'progress-full'}`}
          role="progressbar"
          aria-label={`${name} — ${t(`install.phase.${phase}`)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <i style={{ '--progress': ratio } as CSSProperties} />
        </div>
      ) : null}
      {phase === 'downloading' && showsBytes ? <p className="operation-meta tabular">{meta}</p> : null}
      {phase === 'downloading' && operation.resumed ? <p className="operation-meta"><Icon name="refresh" size={13} />{t('install.resumed')}</p> : null}
      {showsBytes && (phase === 'ready' || phase === 'installing' || phase === 'verifying-install' || phase === 'backing-up') ? <p className="operation-meta"><Icon name="shield" size={13} />{t('install.verified')}</p> : null}

      {backup?.state === 'running' ? <p className="operation-meta"><Icon name="folderSync" size={13} /><span>{t('backup.running', { name })}<code className="operation-path">{backup.path}</code></span></p> : null}
      {backup?.state === 'ok' ? <p className="operation-meta success"><Icon name="check" size={13} /><span>{t('backup.ok', { count: String(backup.accounts ?? 0) })}<code className="operation-path">{backup.path}</code></span></p> : null}
      {backup?.state === 'skipped' ? <p className="operation-meta"><Icon name="alert" size={13} />{t('backup.skipped')}</p> : null}
      {backup?.state === 'declined' ? <p className="operation-meta"><Icon name="alert" size={13} />{t('backup.declined')}</p> : null}
      {backup?.state === 'ok' && backup.copyState === 'ok' ? <p className="operation-meta success"><Icon name="check" size={13} /><span>{t('backup.copyOk')}<code className="operation-path">{backup.copyPath}</code></span></p> : null}
      {backup?.state === 'ok' && backup.copyState === 'failed' ? <p className="operation-meta"><Icon name="alert" size={13} /><span>{t('backup.copyFailed')}<code className="operation-path">{backup.copyPath}</code></span></p> : null}
      {phase === 'backup-failed' && backup ? (
        <p className="operation-note error" role="alert"><Icon name="alert" size={15} />{t('backup.failed', { problem: t(`backup.problem.${backup.problem ?? 'missing'}`) })}</p>
      ) : null}

      {phase === 'waiting-for-app-exit' ? (
        <p className="operation-note warning" role="status">
          <Icon name="pause" size={15} />
          {operation.closeRequested ? t('install.closeRequested', { name }) : t('install.waitForExit', { name })}
        </p>
      ) : null}
      {failure ? <p className="operation-note error" role="alert"><Icon name="alert" size={15} />{failure}</p> : null}
      {done ? <p className="operation-note success" role="status"><Icon name="check" size={15} />{t(doneKey, { name, version })}</p> : null}

      <div className="operation-actions">
        {phase === 'installed' && onLaunch ? (
          <button type="button" className="small" data-sound="none" onClick={() => onLaunch(operation.appId)}>
            <Icon name="play" size={15} />{t('app.action.open')}
          </button>
        ) : null}
        {phase === 'waiting-for-app-exit' && !operation.closeRequested && onRequestClose ? (
          <button type="button" className="small" onClick={() => onRequestClose(operation.id)}>
            <Icon name="close" size={15} />{t('install.action.closeApp', { name })}
          </button>
        ) : null}
        {phase === 'backup-failed' && onContinueWithoutBackup ? (
          <button type="button" className="ghost small danger" onClick={() => onContinueWithoutBackup(operation)}>
            {t('install.action.continueWithoutBackup')}
          </button>
        ) : null}
        {(phase === 'failed' || phase === 'cancelled') && onRetry ? (
          <button type="button" className="small" onClick={() => onRetry(operation.appId, operation.kind)}>
            <Icon name="refresh" size={15} />{t('install.action.retry')}
          </button>
        ) : null}
        {isCancellable(phase) && onCancel ? (
          <button type="button" className="ghost small" aria-label={t(operation.kind === 'install' ? 'install.action.cancelNamed' : 'install.action.cancelOperationNamed', { name })} onClick={() => onCancel(operation.id)}>
            <Icon name="close" size={15} />{t('install.action.cancel')}
          </button>
        ) : null}
        {!active && onDismiss ? (
          <button type="button" className="ghost small" aria-label={t('install.action.dismissNamed', { name })} onClick={() => onDismiss(operation.id)}>
            {t('install.action.dismiss')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
