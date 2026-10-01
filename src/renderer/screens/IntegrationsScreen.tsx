import { Panel, SummaryCard } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { useT } from '../i18n';
import type { DataScreenProps } from './types';

/** Consent matrix, audit and "pause everything" arrive in M6. */
export function IntegrationsScreen({ status, syncedAt, onNavigate, onRetry }: DataScreenProps) {
  const t = useT();
  return (
    <ScreenFrame eyebrow={t('integrations.eyebrow')} title={t('integrations.title')} intro={t('integrations.intro')} labelledBy="integrations-title">
      <div className="summary-grid summary-grid-3">
        <SummaryCard label={t('integrations.card.connected')} value="0" icon="link" tone="accent" />
        <SummaryCard label={t('integrations.card.consents')} value="0" icon="shield" tone="positive" />
        <SummaryCard label={t('integrations.card.status')} value={t('link.offline')} icon="power" tone="warning" />
      </div>
      <Panel eyebrow={t('integrations.panel.eyebrow')} title={t('integrations.panel.title')} labelledBy="integrations-panel">
        <StateView
          status={status}
          offlineSyncedAt={syncedAt ?? null}
          onRetry={onRetry}
          errorMessage={t('integrations.error')}
          empty={<EmptyState compact icon="puzzle" title={t('integrations.empty.title')} body={t('integrations.empty.body')} action={{ label: t('integrations.empty.action'), icon: 'grid', onClick: () => onNavigate({ screen: 'my-apps' }) }} />}
        />
      </Panel>
    </ScreenFrame>
  );
}
