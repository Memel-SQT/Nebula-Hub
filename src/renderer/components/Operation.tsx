import type { CSSProperties } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import { isActive, isCancellable, type InstallPhase, type OperationView } from '@shared/install-state';
import { progressRatio } from '@shared/progress';
import { formatBytes, formatDuration, formatPercent, useLanguage, useT } from '../i18n';

const PHASE_ICONS: Partial<Record<InstallPhase, IconName>> = {
  queued: 'history',
  downloading: 'download',
  verifying: 'shield',
  ready: 'check',
  'waiting-for-app-exit': 'pause',
  installing: 'package',
  'verifying-install': 'shield',
  installed: 'check',
  failed: 'alert',
  cancelled: 'close',
};

export interface OperationActions {
  onCancel?: (operationId: string) => void;
  onRetry?: (appId: string) => void;
  onDismiss?: (operationId: string) => void;
  onLaunch?: (appId: string) => void;
}

/**
 * One install operation (brief §7.2): its exact phase, a progress bar in bytes, the speed and
 * the time left while downloading, and what the user can do now. The bar moves with
 * `transform: scaleX` only (no layout animation), and nothing loops.
 */
export function OperationStatus({ operation, name, onCancel, onRetry, onDismiss, onLaunch }: OperationActions & { operation: OperationView; name: string }) {
  const t = useT();
  const language = useLanguage();
  const { phase } = operation;
  const active = isActive(phase);
  const downloading = phase === 'downloading' || phase === 'queued';
  const ratio = downloading ? progressRatio(operation.received, operation.total) : 1;
  const failure = operation.failure ? t(`install.failure.${operation.failure}`, { detail: operation.failureDetail ?? '?', name }) : null;
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
        <span className="operation-version tabular">v{operation.version}</span>
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
      {phase === 'downloading' ? <p className="operation-meta tabular">{meta}</p> : null}
      {phase === 'downloading' && operation.resumed ? <p className="operation-meta"><Icon name="refresh" size={13} />{t('install.resumed')}</p> : null}
      {phase === 'ready' || phase === 'installing' || phase === 'verifying-install' ? <p className="operation-meta"><Icon name="shield" size={13} />{t('install.verified')}</p> : null}
      {phase === 'waiting-for-app-exit' ? <p className="operation-note warning" role="status"><Icon name="pause" size={15} />{t('install.waitForExit', { name })}</p> : null}
      {failure ? <p className="operation-note error" role="alert"><Icon name="alert" size={15} />{failure}</p> : null}
      {phase === 'installed' ? <p className="operation-note success" role="status"><Icon name="check" size={15} />{t('install.done', { name, version: `v${operation.version}` })}</p> : null}
      <div className="operation-actions">
        {phase === 'installed' && onLaunch ? (
          <button type="button" className="small" data-sound="none" onClick={() => onLaunch(operation.appId)}>
            <Icon name="play" size={15} />{t('app.action.open')}
          </button>
        ) : null}
        {(phase === 'failed' || phase === 'cancelled') && onRetry ? (
          <button type="button" className="small" onClick={() => onRetry(operation.appId)}>
            <Icon name="refresh" size={15} />{t('install.action.retry')}
          </button>
        ) : null}
        {isCancellable(phase) && onCancel ? (
          <button type="button" className="ghost small" aria-label={t('install.action.cancelNamed', { name })} onClick={() => onCancel(operation.id)}>
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
