import { Panel, SummaryCard } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { useT } from '../i18n';
import type { DataScreenProps } from './types';

/** Queue, progress and history arrive in M4. */
export function DownloadsScreen({ status, syncedAt, onNavigate, onRetry }: DataScreenProps) {
  const t = useT();
  return (
    <ScreenFrame eyebrow={t('downloads.eyebrow')} title={t('downloads.title')} labelledBy="downloads-title">
      <div className="summary-grid summary-grid-3">
        <SummaryCard label={t('downloads.card.active')} value="0" icon="download" tone="accent" />
        <SummaryCard label={t('downloads.card.queued')} value="0" icon="history" tone="gold" />
        <SummaryCard label={t('downloads.card.done')} value="0" icon="check" tone="positive" />
      </div>
      <Panel eyebrow={t('downloads.panel.eyebrow')} title={t('downloads.panel.title')} labelledBy="downloads-panel">
        <StateView
          status={status}
          offlineSyncedAt={syncedAt ?? null}
          onRetry={onRetry}
          errorMessage={t('downloads.error')}
          empty={<EmptyState compact icon="download" title={t('downloads.empty.title')} body={t('downloads.empty.body')} action={{ label: t('downloads.empty.action'), icon: 'store', onClick: () => onNavigate({ screen: 'discover' }) }} />}
        />
      </Panel>
    </ScreenFrame>
  );
}
