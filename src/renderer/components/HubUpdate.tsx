import type { CSSProperties } from 'react';
import { Icon } from '@nebula/design/react';
import { isHubUpdating, type HubUpdateView } from '@shared/hub-update';
import { formatPercent, useLanguage, useT, type Translate } from '../i18n';
import { SnapshotRow } from './Cards';

/** What the Hub update is doing now, in one sentence. */
function statusOf(t: Translate, view: HubUpdateView): string {
  const version = view.available ?? '';
  if (view.phase === 'downloading') return t('hubUpdate.phase.downloading', { version });
  if (view.phase === 'verifying' || view.phase === 'waiting' || view.phase === 'restarting') return t(`hubUpdate.phase.${view.phase}`);
  if (view.phase === 'failed' && view.failure) return t(`hubUpdate.failure.${view.failure}`);
  if (view.available) return t('hubUpdate.available', { version });
  return t('hubUpdate.upToDate');
}

function HubUpdateProgress({ view }: { view: HubUpdateView }) {
  const t = useT();
  const ratio = view.phase === 'downloading' && view.total > 0 ? Math.min(1, view.received / view.total) : 1;
  return (
    <div
      className={`progress-track ${view.phase === 'downloading' ? '' : 'progress-full'}`}
      role="progressbar"
      aria-label={t('hubUpdate.progress')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <i style={{ '--progress': ratio } as CSSProperties} />
    </div>
  );
}

/**
 * Sidebar card (ADR-029): shown only when a newer Hub exists, while it downloads, or after a
 * failure. One click opens the confirmation; below 1100 px only the icon remains (rail).
 */
export function HubUpdateCard({ view, onUpdate, onCancel }: { view: HubUpdateView; onUpdate: () => void; onCancel: () => void }) {
  const t = useT();
  const language = useLanguage();
  const updating = isHubUpdating(view.phase);
  if (!view.available || (view.blocked === 'not-packaged' && !updating)) return null;
  if (updating) {
    return (
      <div className="hub-update-card is-running" role="status">
        <span className="hub-update-icon"><Icon name="update" size={18} /></span>
        <span className="hub-update-text">
          <strong>{statusOf(t, view)}</strong>
          {view.phase === 'downloading' && view.total > 0 ? <small className="tabular">{formatPercent(language, view.received / view.total)}</small> : null}
          <HubUpdateProgress view={view} />
        </span>
        {view.phase === 'downloading' || view.phase === 'waiting' ? (
          <button type="button" className="hub-update-cancel plain" title={t('hubUpdate.cancel')} aria-label={t('hubUpdate.cancel')} onClick={onCancel}>
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`hub-update-card plain ${view.phase === 'failed' ? 'is-failed' : ''}`}
      data-sound="nav"
      title={view.phase === 'failed' ? statusOf(t, view) : t('hubUpdate.updateNamed', { version: view.available })}
      aria-label={t('hubUpdate.updateNamed', { version: view.available })}
      onClick={onUpdate}
    >
      <span className="hub-update-icon"><Icon name={view.phase === 'failed' ? 'alert' : 'update'} size={18} /><i className="hub-update-dot" aria-hidden="true" /></span>
      <span className="hub-update-text">
        <strong className="tabular">{t('hubUpdate.cardTitle', { version: view.available })}</strong>
        <small>{view.phase === 'failed' ? t('hubUpdate.retry') : t('hubUpdate.cardAction')}</small>
      </span>
      <Icon name="chevronRight" size={14} className="hub-update-chevron" />
    </button>
  );
}

/** Settings section (ADR-029): always there, so the Hub can be checked and updated by hand. */
export function HubUpdatePanel({ view, refreshing, onCheck, onUpdate, onCancel }: { view: HubUpdateView; refreshing: boolean; onCheck: () => void; onUpdate: () => void; onCancel: () => void }) {
  const t = useT();
  const updating = isHubUpdating(view.phase);
  return (
    <div className="settings-section hub-update-panel" id="settings-hub-update">
      <h2><Icon name="update" size={15} />{t('hubUpdate.section')}</h2>
      <div className="settings-facts">
        <SnapshotRow label={t('hubUpdate.installed')} value={<span className="tabular">{view.current}</span>} />
        <SnapshotRow label={t('hubUpdate.latest')} value={<span className="tabular">{view.available ?? view.current}</span>} />
      </div>
      <p className={`settings-copy ${view.phase === 'failed' ? 'error-text' : ''}`} role="status">{statusOf(t, view)}</p>
      {updating ? <HubUpdateProgress view={view} /> : null}
      {view.available && view.blocked === 'not-packaged' ? <small className="path-note">{t('hubUpdate.notPackaged')}</small> : null}
      <div className="settings-actions settings-reset">
        {!updating && view.available && view.blocked === null ? (
          <button type="button" data-sound="none" aria-label={t('hubUpdate.updateNamed', { version: view.available })} onClick={onUpdate}>
            <Icon name="update" size={16} />{view.phase === 'failed' ? t('hubUpdate.retry') : t('hubUpdate.update')}
          </button>
        ) : null}
        {view.phase === 'downloading' || view.phase === 'waiting' ? (
          <button type="button" className="ghost small" onClick={onCancel}>
            <Icon name="close" size={15} />{t('hubUpdate.cancel')}
          </button>
        ) : null}
        {!updating ? (
          <button type="button" className="ghost small" disabled={refreshing} onClick={onCheck}>
            <Icon name="refresh" size={15} className={refreshing ? 'spin' : undefined} />{refreshing ? t('hubUpdate.checking') : t('hubUpdate.check')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
