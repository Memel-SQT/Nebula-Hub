import { Icon } from '@nebula/design/react';
import { localize } from '@shared/catalog';
import { isActive } from '@shared/install-state';
import { updateAvailable, type InstalledView } from '@shared/installed-view';
import { familyEntries, installedOf, operationOf } from '../catalog';
import { AppIcon, AppStateChip, AppTile, Panel } from '../components/Cards';
import { OperationStatus } from '../components/Operation';
import { EmptyState, StateView, type LoadState } from '../components/ScreenState';
import { UpdatesPanel } from '../components/UpdatesPanel';
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
 * folder, see its page), update, repair or uninstall it (M5, confirmed when it touches the data),
 * and whether it updates itself automatically. Migration arrives in M7.
 */
export function MyAppsScreen({ catalog, installed, downloads, onNavigate, onLaunch, onShowFolder, onRefreshInstalled, onOperation, onCancelOperation, onDismissOperation, onRequestClose, onContinueWithoutBackup, onUpdateAll, autoUpdate, onToggleAutoUpdate }: CatalogScreenProps & { onRefreshInstalled?: () => void }) {
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
      <UpdatesPanel catalog={catalog} installed={installed} downloads={downloads} onOperation={onOperation} onUpdateAll={onUpdateAll} />

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
              const operation = operationOf(downloads, entry.app.id);
              const busy = Boolean(operation && isActive(operation.phase));
              const autoOn = Boolean(autoUpdate?.[entry.app.id]);
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
                    {!isHub && onToggleAutoUpdate ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoOn}
                        aria-label={t('myApps.autoUpdateNamed', { name: entry.app.name })}
                        className={`switch small-switch ${autoOn ? 'on' : ''}`}
                        data-sound="toggle"
                        onClick={() => onToggleAutoUpdate(entry.app.id, !autoOn)}
                      >
                        <i aria-hidden="true" />
                        <span>{t('myApps.autoUpdate')}</span>
                      </button>
                    ) : null}
                    {operation ? (
                      <OperationStatus operation={operation} name={entry.app.name} onCancel={onCancelOperation} onRetry={onOperation} onDismiss={onDismissOperation} onRequestClose={onRequestClose} onContinueWithoutBackup={onContinueWithoutBackup} />
                    ) : null}
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
                    {!isHub && onOperation && !busy && updateAvailable(entry, app) && entry.release?.installer ? (
                      <button type="button" className="ghost small" aria-label={t('app.action.updateNamed', { name: entry.app.name })} onClick={() => onOperation(entry.app.id, 'update')}>
                        <Icon name="update" size={15} />{t('app.action.update')}
                      </button>
                    ) : null}
                    {!isHub && onOperation && !busy && entry.release?.installer && entry.release.version === app.version ? (
                      <button type="button" className="ghost small" aria-label={t('app.action.repairNamed', { name: entry.app.name })} onClick={() => onOperation(entry.app.id, 'repair')}>
                        <Icon name="repair" size={15} />{t('app.action.repair')}
                      </button>
                    ) : null}
                    {!isHub && onOperation && !busy ? (
                      <button type="button" className="ghost small danger" aria-label={t('app.action.uninstallNamed', { name: entry.app.name })} onClick={() => onOperation(entry.app.id, 'uninstall')}>
                        <Icon name="uninstall" size={15} />{t('app.action.uninstall')}
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
