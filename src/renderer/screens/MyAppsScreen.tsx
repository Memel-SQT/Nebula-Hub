import { Icon } from '@nebula/design/react';
import { localize } from '@shared/catalog';
import { updateAvailable, type InstalledView } from '@shared/installed-view';
import { familyEntries, installedOf } from '../catalog';
import { AppIcon, AppStateChip, AppTile, Panel } from '../components/Cards';
import { EmptyState, StateView, type LoadState } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

function loadState(installed: InstalledView | undefined, count: number): LoadState {
  if (!installed || installed.state === 'loading') return 'loading';
  if (installed.state === 'error') return 'error';
  return count === 0 ? 'empty' : 'ready';
}

/**
 * My apps (brief §9.4): every Nebula app found on this computer — installed with or without the
 * Hub — with its version, location and scope, and what can be done with it now (open, show its
 * folder, see its page). Update, repair, uninstall and migration arrive in M4–M5 and M7.
 */
export function MyAppsScreen({ catalog, installed, onNavigate, onLaunch, onShowFolder, onRefreshInstalled }: CatalogScreenProps & { onRefreshInstalled?: () => void }) {
  const t = useT();
  const language = useLanguage();
  const rows = catalog.entries
    .map((entry) => ({ entry, app: installedOf(installed, entry.app.id) }))
    .filter((row): row is { entry: typeof row.entry; app: NonNullable<typeof row.app> } => Boolean(row.app));
  const available = familyEntries(catalog).filter((entry) => !installedOf(installed, entry.app.id));
  const status = loadState(installed, rows.length);

  return (
    <ScreenFrame
      eyebrow={t('myApps.eyebrow')}
      title={t('myApps.title')}
      labelledBy="my-apps-title"
      actions={
        onRefreshInstalled ? (
          <button type="button" className="ghost" onClick={onRefreshInstalled}>
            <Icon name="refresh" size={16} />
            {t('myApps.redetect')}
          </button>
        ) : undefined
      }
    >
      <Panel
        eyebrow={t('myApps.panel.eyebrow')}
        title={t('myApps.panel.title')}
        badge={status === 'ready' ? t('myApps.count', { count: String(rows.filter((row) => row.entry.app.role !== 'hub').length) }) : undefined}
        labelledBy="my-apps-panel"
      >
        <StateView
          status={status}
          onRetry={onRefreshInstalled}
          errorMessage={t('myApps.error')}
          empty={<EmptyState compact icon="grid" title={t('myApps.empty.title')} body={t('myApps.empty.body')} action={{ label: t('myApps.empty.action'), icon: 'store', onClick: () => onNavigate({ screen: 'discover' }) }} />}
        >
          <ul className="installed-list motion-stagger">
            {rows.map(({ entry, app }) => {
              const isHub = entry.app.role === 'hub';
              return (
                <li key={entry.app.id} className={`installed-row ${app.exeFound ? '' : 'broken'}`}>
                  <AppIcon src={entry.icon} size={46} />
                  <div className="installed-main">
                    <div className="installed-title">
                      <strong>{entry.app.name}</strong>
                      <AppStateChip entry={entry} installed={app} />
                    </div>
                    <span className="installed-tagline">{isHub ? t('myApps.thisApp') : localize(entry.app.tagline, language)}</span>
                  </div>
                  <div className="installed-details">
                    <dl className="installed-meta">
                      <div><dt>{t('myApps.version')}</dt><dd className="tabular">{app.version ? `v${app.version}` : t('myApps.unknownVersion')}{updateAvailable(entry, app) ? ` → v${entry.release!.version}` : ''}</dd></div>
                      <div><dt>{t('myApps.scope')}</dt><dd>{t(`myApps.scope.${app.scope}`)}</dd></div>
                      <div className="wide"><dt>{t('myApps.location')}</dt><dd className="path">{app.location}</dd></div>
                    </dl>
                    {!app.exeFound ? <p className="installed-warning"><Icon name="alert" size={15} />{t('myApps.broken')}</p> : null}
                  </div>
                  <div className="installed-actions">
                    {!isHub && app.exeFound && onLaunch ? (
                      <button type="button" className="small" data-sound="none" aria-label={t('app.action.openNamed', { name: entry.app.name })} onClick={() => onLaunch(entry.app.id)}>
                        <Icon name="play" size={15} />{t('app.action.open')}
                      </button>
                    ) : null}
                    {app.exeFound && onShowFolder ? (
                      <button type="button" className="ghost small" onClick={() => onShowFolder(entry.app.id)}>
                        <Icon name="external" size={15} />{t('app.action.folder')}
                      </button>
                    ) : null}
                    <button type="button" className="ghost small" data-sound="nav" aria-label={t('app.action.detailsNamed', { name: entry.app.name })} onClick={() => onNavigate({ screen: 'app', appId: entry.app.id })}>
                      {t('app.action.details')}<Icon name="chevronRight" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {installed?.detectedAt ? <small className="path-note tabular">{t('myApps.detectedAt', { time: formatDateTime(language, installed.detectedAt) })}</small> : null}
        </StateView>
      </Panel>

      {available.length > 0 && status !== 'loading' ? (
        <Panel eyebrow={t('discover.eyebrow')} title={t('myApps.notInstalled.title')} labelledBy="my-apps-available" className="available-panel">
          <div className="app-tile-grid">
            {available.map((entry) => <AppTile key={entry.app.id} entry={entry} onOpen={() => onNavigate({ screen: 'app', appId: entry.app.id })} />)}
          </div>
        </Panel>
      ) : null}
    </ScreenFrame>
  );
}
