import { Icon } from '@nebula/design/react';
import { AppTile, Panel, SnapshotRow, SummaryCard, TopbarControl } from '../components/Cards';
import { StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { FAMILY_APPS } from '../family';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { DataScreenProps } from './types';

/**
 * Home ("Accueil"), laid out like the Finterest dashboard: KPI row, then the launcher next to
 * a summary panel, then the activity center. The Hub is first a launcher (ADR-013): installed
 * state, launch, widgets and notifications are wired in M3 (detection) and M7 (Link widgets).
 */
export function HomeScreen({ status, syncedAt, version = '', onNavigate, onRetry }: DataScreenProps & { version?: string }) {
  const t = useT();
  const language = useLanguage();

  const dashboard = (
    <>
      <div className="summary-grid">
        <SummaryCard label={t('home.card.family')} value={String(FAMILY_APPS.length)} icon="sparkles" tone="accent" />
        <SummaryCard label={t('home.card.installed')} value={t('home.card.unknown')} icon="grid" tone="positive" />
        <SummaryCard label={t('home.card.updates')} value={t('home.card.unknown')} icon="update" tone="gold" />
        <SummaryCard label={t('home.card.link')} value={t('home.card.linkOffline')} icon="link" tone="warning" />
      </div>

      <div className="insight-grid">
        <Panel eyebrow={t('home.launcher.eyebrow')} title={t('home.launcher.title')} badge={t('home.launcher.count', { count: String(FAMILY_APPS.length) })} labelledBy="home-launcher">
          <div className="app-tile-grid">
            {FAMILY_APPS.map((app) => (
              <AppTile key={app.id} app={app} onOpen={() => onNavigate({ screen: 'app', appId: app.id })} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow={t('home.summary.eyebrow')} title={t('home.summary.title')} labelledBy="home-summary" className="snapshot-panel">
          <SnapshotRow label={t('home.summary.data')} value={t('home.summary.dataValue')} />
          <SnapshotRow label={t('home.summary.account')} value={t('home.summary.accountValue')} />
          <SnapshotRow label={t('home.summary.telemetry')} value={t('home.summary.telemetryValue')} />
          <SnapshotRow label={t('home.summary.standalone')} value={t('home.summary.standaloneValue')} />
          <SnapshotRow label={t('home.summary.version')} value={version} strong />
        </Panel>
      </div>

      <Panel eyebrow={t('home.activity.eyebrow')} title={t('home.activity.title')} labelledBy="home-activity" className="activity-panel">
        <p className="panel-empty"><Icon name="bell" size={18} />{t('home.activity.empty')}</p>
      </Panel>
    </>
  );

  return (
    <ScreenFrame
      eyebrow={t('home.eyebrow')}
      title={t('home.title')}
      labelledBy="home-title"
      actions={
        <TopbarControl label={t('home.sync')}>
          <span className="tabular">{syncedAt ? formatDateTime(language, syncedAt) : t('home.syncNever')}</span>
          <Icon name="refresh" size={17} />
        </TopbarControl>
      }
    >
      <StateView status={status === 'empty' ? 'ready' : status} offlineSyncedAt={syncedAt ?? null} onRetry={onRetry} errorMessage={t('home.error')} empty={dashboard}>
        {dashboard}
      </StateView>
    </ScreenFrame>
  );
}
