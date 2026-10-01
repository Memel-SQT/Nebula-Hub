import { Icon } from '@nebula/design/react';
import { catalogLoadState, familyEntries, installedOf, installedSummary } from '../catalog';
import { AppTile, Panel, SnapshotRow, SummaryCard, TopbarControl } from '../components/Cards';
import { CatalogNotices } from '../components/CatalogNotices';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

/**
 * Home ("Accueil"), laid out like the Finterest dashboard: KPI row, then the launcher next to
 * a summary panel, then the activity center. The Hub is first a launcher (ADR-013): installed
 * state and launch arrive with detection (M3), widgets and notifications with Link (M6–M7).
 */
export function HomeScreen({ catalog, installed, version = '', onNavigate, onRefresh, onLaunch }: CatalogScreenProps & { version?: string }) {
  const t = useT();
  const language = useLanguage();
  const apps = familyEntries(catalog);
  const summary = installedSummary(catalog, installed);
  const detected = installed?.state === 'ready';

  return (
    <ScreenFrame
      eyebrow={t('home.eyebrow')}
      title={t('home.title')}
      labelledBy="home-title"
      actions={
        <TopbarControl label={t('home.sync')}>
          <span className="tabular">{catalog.syncedAt ? formatDateTime(language, catalog.syncedAt) : t('home.syncNever')}</span>
          <button type="button" className="icon-button ghost plain topbar-control-action" aria-label={t('discover.refresh')} title={t('discover.refresh')} disabled={catalog.refreshing} onClick={onRefresh}>
            <Icon name="refresh" size={17} className={catalog.refreshing ? 'spin' : undefined} />
          </button>
        </TopbarControl>
      }
    >
      <CatalogNotices view={catalog} />
      <StateView
        status={catalogLoadState(catalog)}
        offlineSyncedAt={catalog.syncedAt}
        onRetry={onRefresh}
        errorMessage={t('discover.error')}
        empty={<EmptyState icon="store" title={t('discover.empty.title')} body={t('discover.empty.body')} action={{ label: t('discover.empty.action'), icon: 'refresh', onClick: onRefresh }} />}
      >
        <div className="summary-grid">
          <SummaryCard label={t('home.card.family')} value={String(apps.length)} icon="sparkles" tone="accent" />
          <SummaryCard label={t('home.card.installed')} value={detected ? String(summary.installed) : t('home.card.unknown')} icon="grid" tone="positive" />
          <SummaryCard label={t('home.card.updates')} value={detected ? String(summary.updates) : t('home.card.unknown')} icon="update" tone="gold" />
          <SummaryCard label={t('home.card.link')} value={t('home.card.linkOffline')} icon="link" tone="warning" />
        </div>

        <div className="insight-grid">
          <Panel eyebrow={t('home.launcher.eyebrow')} title={t('home.launcher.title')} badge={t('home.launcher.count', { count: String(apps.length) })} labelledBy="home-launcher">
            <div className="app-tile-grid">
              {apps.map((entry) => (
                <AppTile
                  key={entry.app.id}
                  entry={entry}
                  installed={installedOf(installed, entry.app.id)}
                  mode="launch"
                  onOpen={() => onNavigate({ screen: 'app', appId: entry.app.id })}
                  onLaunch={onLaunch ? () => onLaunch(entry.app.id) : undefined}
                />
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
      </StateView>
    </ScreenFrame>
  );
}
