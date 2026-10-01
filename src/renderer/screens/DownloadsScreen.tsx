import { useState } from 'react';
import { Icon } from '@nebula/design/react';
import type { ExportResult } from '@shared/bridge';
import { isActive, type HistoryEntry } from '@shared/install-state';
import { findEntry } from '../catalog';
import { AppIcon, Panel, SummaryCard } from '../components/Cards';
import { OperationStatus } from '../components/Operation';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

const OUTCOME_CLASS: Record<HistoryEntry['outcome'], string> = {
  success: '',
  failed: 'status-deprecated',
  cancelled: 'status-coming-soon',
};

/**
 * Downloads (brief §9.5): the queue with live progress (one operation at a time), then the
 * history from `install_history`, exportable as a JSON journal.
 */
export function DownloadsScreen({ catalog, downloads, onNavigate, onInstall, onLaunch, onCancelOperation, onDismissOperation, onExportHistory }: CatalogScreenProps & {
  onExportHistory?: () => Promise<ExportResult>;
}) {
  const t = useT();
  const language = useLanguage();
  const [exported, setExported] = useState<ExportResult | null>(null);
  const operations = downloads?.operations ?? [];
  const history = downloads?.history ?? [];
  const running = operations.filter((operation) => isActive(operation.phase) && operation.phase !== 'queued').length;
  const queued = operations.filter((operation) => operation.phase === 'queued').length;
  const done = history.filter((entry) => entry.outcome === 'success').length;
  const name = (appId: string) => findEntry(catalog, appId)?.app.name ?? appId;
  const icon = (appId: string) => findEntry(catalog, appId)?.icon ?? null;

  const exportHistory = () => {
    if (!onExportHistory) return;
    setExported(null);
    void onExportHistory().then(setExported, () => setExported('failed'));
  };

  return (
    <ScreenFrame eyebrow={t('downloads.eyebrow')} title={t('downloads.title')} labelledBy="downloads-title">
      <div className="summary-grid summary-grid-3">
        <SummaryCard label={t('downloads.card.active')} value={String(running)} icon="download" tone="accent" />
        <SummaryCard label={t('downloads.card.queued')} value={String(queued)} icon="history" tone="gold" />
        <SummaryCard label={t('downloads.card.done')} value={String(done)} icon="check" tone="positive" />
      </div>

      <Panel eyebrow={t('downloads.queue.eyebrow')} title={t('downloads.queue.title')} badge={operations.length ? t('downloads.queue.note') : undefined} labelledBy="downloads-queue">
        <StateView
          status={!downloads ? 'loading' : operations.length === 0 ? 'empty' : 'ready'}
          errorMessage={t('downloads.error')}
          empty={<EmptyState compact icon="download" title={t('downloads.empty.title')} body={t('downloads.empty.body')} action={{ label: t('downloads.empty.action'), icon: 'store', onClick: () => onNavigate({ screen: 'discover' }) }} />}
        >
          <ul className="operation-list">
            {operations.map((operation) => (
              <li key={operation.id} className="operation-row">
                <AppIcon src={icon(operation.appId)} size={42} />
                <div className="operation-body">
                  <strong>{name(operation.appId)}</strong>
                  <OperationStatus
                    operation={operation}
                    name={name(operation.appId)}
                    onCancel={onCancelOperation}
                    onRetry={onInstall}
                    onDismiss={onDismissOperation}
                    onLaunch={onLaunch}
                  />
                </div>
              </li>
            ))}
          </ul>
        </StateView>
      </Panel>

      <Panel eyebrow={t('downloads.history.eyebrow')} title={t('downloads.history.title')} badge={history.length ? String(history.length) : undefined} labelledBy="downloads-history" className="history-panel">
        {history.length === 0 ? (
          <p className="panel-copy">{t('downloads.history.empty')}</p>
        ) : (
          <ul className="history-list">
            {history.map((entry) => (
              <li key={entry.id} className="history-row">
                <AppIcon src={icon(entry.appId)} size={30} />
                <div className="history-main">
                  <strong>{name(entry.appId)}</strong>
                  <span className="tabular">
                    {t(`downloads.kind.${entry.kind}`)} · {entry.fromVersion ? `v${entry.fromVersion} → ` : ''}v{entry.version}
                  </span>
                  {entry.failure ? <small>{t(`install.failure.${entry.failure}`, { detail: entry.detail ?? '?', name: name(entry.appId) })}</small> : null}
                </div>
                <span className={`status-chip ${OUTCOME_CLASS[entry.outcome]}`}>{t(`downloads.outcome.${entry.outcome}`)}</span>
                <time className="history-date tabular" dateTime={entry.finishedAt}>{formatDateTime(language, entry.finishedAt)}</time>
              </li>
            ))}
          </ul>
        )}
        {onExportHistory ? (
          <div className="settings-actions settings-reset">
            <button type="button" className="ghost small" disabled={history.length === 0} onClick={exportHistory}>
              <Icon name="upload" size={15} />{t('downloads.history.export')}
            </button>
            {exported === 'saved' ? <small className="path-note" role="status">{t('downloads.history.exported')}</small> : null}
            {exported === 'failed' ? <small className="path-note error-text" role="alert">{t('downloads.history.exportFailed')}</small> : null}
          </div>
        ) : null}
      </Panel>
    </ScreenFrame>
  );
}
