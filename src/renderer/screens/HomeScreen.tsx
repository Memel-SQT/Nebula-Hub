import { Icon } from '@nebula/design/react';
import type { ActivityItem } from '@shared/activity';
import type { ConsentState } from '@shared/consent';
import type { LinkView } from '@shared/link-view';
import { orderWidgets, type WidgetView } from '@shared/widgets';
import { catalogLoadState, familyEntries, installedOf, installedSummary, operationOf } from '../catalog';
import { ActivityPanel } from '../components/ActivityPanel';
import { AppTile, Panel, SummaryCard, TopbarControl } from '../components/Cards';
import { CatalogNotices } from '../components/CatalogNotices';
import { EmptyState, StateView } from '../components/ScreenState';
import { UpdatesPanel } from '../components/UpdatesPanel';
import { ScreenFrame } from '../components/ScreenFrame';
import { WidgetGrid } from '../components/WidgetGrid';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

export interface HomeExtras {
  version?: string;
  link?: LinkView;
  widgets?: WidgetView[];
  widgetOrder?: string[];
  activity?: ActivityItem[];
  activitySeenAt?: string | null;
  onReorderWidgets?: (order: string[]) => void;
  onWidgetConsent?: (capability: string, state: ConsentState) => void;
  onRefreshWidget?: (capability: string) => void;
  onOpenLink?: (url: string) => void;
  onMarkActivityRead?: () => void;
  onOpenActivity?: (item: ActivityItem) => void;
}

/**
 * Home ("Accueil", brief §9.1), laid out like the Finterest dashboard: KPI row and pending
 * updates, then the launcher and the widgets in the main column, with the activity center as a
 * side panel (below them on narrow windows).
 */
export function HomeScreen(props: CatalogScreenProps & HomeExtras) {
  const { catalog, installed, downloads, link, widgets = [], widgetOrder = [], activity = [], activitySeenAt = null, onNavigate, onRefresh, onLaunch, onOperation, onUpdateAll } = props;
  const t = useT();
  const language = useLanguage();
  const apps = familyEntries(catalog);
  const summary = installedSummary(catalog, installed);
  const detected = installed?.state === 'ready';
  const ordered = orderWidgets(widgets, widgetOrder);
  const appName = (appId: string) => catalog.entries.find((entry) => entry.app.id === appId)?.app.name ?? appId;
  const appIcon = (appId: string) => catalog.entries.find((entry) => entry.app.id === appId)?.icon ?? null;
  const noop = () => undefined;

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
          <SummaryCard label={t('home.card.link')} value={t(`integrations.state.${link?.state ?? 'starting'}`)} icon="link" tone={link?.state === 'listening' ? 'accent' : 'warning'} hint={link?.state === 'listening' ? t('home.card.linkApps', { count: String(link.connected.length) }) : undefined} />
        </div>

        <UpdatesPanel catalog={catalog} installed={installed} downloads={downloads} onOperation={onOperation} onUpdateAll={onUpdateAll} />

        <div className="home-grid">
          <div className="home-main">
            <Panel eyebrow={t('home.launcher.eyebrow')} title={t('home.launcher.title')} badge={t('home.launcher.count', { count: String(apps.length) })} labelledBy="home-launcher">
              <div className="app-tile-grid">
                {apps.map((entry) => (
                  <AppTile
                    key={entry.app.id}
                    entry={entry}
                    installed={installedOf(installed, entry.app.id)}
                    operation={operationOf(downloads, entry.app.id)}
                    mode="launch"
                    onOpen={() => onNavigate({ screen: 'app', appId: entry.app.id })}
                    onLaunch={onLaunch ? () => onLaunch(entry.app.id) : undefined}
                    onInstall={props.onInstall ? () => props.onInstall!(entry.app.id) : undefined}
                  />
                ))}
              </div>
            </Panel>

            <Panel eyebrow={t('widgets.eyebrow')} title={t('widgets.title')} badge={ordered.length ? String(ordered.length) : undefined} labelledBy="home-widgets" className="widgets-panel">
              {ordered.length === 0 ? (
                <p className="panel-empty"><Icon name="layers" size={18} /><span><strong>{t('widgets.empty.title')}</strong><br />{t('widgets.empty.body')}</span></p>
              ) : (
                <>
                  <p className="panel-hint">{t('widgets.hint')}</p>
                  <WidgetGrid
                    widgets={ordered}
                    appName={appName}
                    appIcon={appIcon}
                    onReorder={props.onReorderWidgets ?? noop}
                    onConsent={props.onWidgetConsent ?? noop}
                    onRefresh={props.onRefreshWidget ?? noop}
                    onOpenLink={props.onOpenLink ?? noop}
                    onLaunch={onLaunch ?? noop}
                  />
                </>
              )}
            </Panel>
          </div>

          <aside className="home-side" aria-label={t('activity.eyebrow')}>
            <ActivityPanel items={activity} seenAt={activitySeenAt} appName={appName} appIcon={appIcon} onMarkRead={props.onMarkActivityRead ?? noop} onOpen={props.onOpenActivity ?? noop} />
          </aside>
        </div>
      </StateView>
    </ScreenFrame>
  );
}
