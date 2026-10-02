import { Icon } from '@nebula/design/react';
import { isActive } from '@shared/install-state';
import { updateAvailable } from '@shared/installed-view';
import { localize } from '@shared/catalog';
import { catalogLoadState, findEntry, hasInstalledOnce, installable, installedOf, operationOf } from '../catalog';
import { AppIcon, AppStateChip, Panel, SnapshotRow, StatusChip } from '../components/Cards';
import { DataActionsPanel, InstallerSaveButton } from '../components/AppData';
import { CatalogNotices } from '../components/CatalogNotices';
import { Markdown } from '../components/Markdown';
import { OperationStatus } from '../components/Operation';
import { Screenshots } from '../components/Screenshots';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatBytes, locale, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

/**
 * App page: screenshots, description, the version on the user's channel with its date and
 * size, the release notes (rendered from tokens, R12), the data notice and the facts. Install,
 * Install (M4) runs from here with its live progress; update, repair and uninstall arrive in M5;
 * integrations (manifest) in M6.
 */
export function AppDetailScreen({ appId, catalog, installed, downloads, onNavigate, onRefresh, onLaunch, onShowFolder, onInstall, onCancelOperation, onDismissOperation, onOperation, onRequestClose, onContinueWithoutBackup, loadAsset, onOpenLink, dataActions, installerSaves, dock, openInHub = [], onToggleOpenInHub, onOpenDocked, hubUpdate, onHubUpdate }: CatalogScreenProps & {
  appId: string;
  loadAsset: (appId: string, path: string) => Promise<string | null>;
  onOpenLink: (url: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const entry = findEntry(catalog, appId);
  const local = installedOf(installed, appId);
  const operation = operationOf(downloads, appId);
  const busy = Boolean(operation && isActive(operation.phase));
  const isHub = entry?.app.role === 'hub';
  const base = catalogLoadState(catalog);
  const status = base === 'loading' || base === 'error' ? base : !entry ? 'empty' : base === 'offline' ? 'offline' : 'ready';
  const date = (iso: string) => new Intl.DateTimeFormat(locale(language), { dateStyle: 'long' }).format(new Date(iso));

  return (
    <ScreenFrame
      eyebrow={t('appDetail.eyebrow')}
      title={entry?.app.name ?? appId}
      labelledBy="app-detail-title"
      actions={
        <button type="button" className="ghost small" data-sound="nav" onClick={() => onNavigate({ screen: 'discover' })}>
          <Icon name="chevronLeft" size={15} />
          {t('appDetail.back')}
        </button>
      }
    >
      <CatalogNotices view={catalog} />
      <StateView
        status={status}
        offlineSyncedAt={catalog.syncedAt}
        onRetry={onRefresh}
        errorMessage={base === 'error' ? t('discover.error') : t('appDetail.error')}
        empty={<EmptyState icon="package" title={t('appDetail.empty.title')} body={t('appDetail.empty.body')} />}
      >
        {entry ? (
          <>
            <div className="app-hero nebula-surface">
              <AppIcon src={entry.icon} size={88} />
              <div className="app-hero-body">
                <p className="app-hero-tagline">{localize(entry.app.tagline, language)}</p>
                <div className="app-hero-chips">
                  {local || operation ? <AppStateChip entry={entry} installed={local} operation={operation} /> : null}
                  <StatusChip status={entry.app.status} />
                  <span className="category-chip">{t(`category.${entry.app.category}`)}</span>
                  {entry.release?.prerelease ? <span className="status-chip status-beta">{t('appDetail.prerelease')}</span> : null}
                </div>
                {operation ? (
                  <OperationStatus operation={operation} name={entry.app.name} onCancel={onCancelOperation} onRetry={onOperation ?? onInstall} onDismiss={onDismissOperation} onRequestClose={onRequestClose} onContinueWithoutBackup={onContinueWithoutBackup} />
                ) : null}
                {!local && !operation && onInstall && installable(entry) ? (
                  <>
                    <div className="app-hero-actions">
                      <button type="button" data-sound="none" onClick={() => onInstall(entry.app.id)}>
                        <Icon name="download" size={16} />{t('install.action.installNamed', { name: entry.app.name })}
                      </button>
                    </div>
                    {!hasInstalledOnce(downloads) ? <small className="path-note settings-hint"><Icon name="info" size={14} />{t('install.smartScreen')}</small> : null}
                  </>
                ) : null}
                {local ? (
                  <div className="app-hero-actions">
                    {!isHub && local.exeFound && onLaunch ? (
                      <button type="button" data-sound="none" onClick={() => onLaunch(entry.app.id)}>
                        <Icon name="play" size={16} />{t('app.action.openNamed', { name: entry.app.name })}
                      </button>
                    ) : null}
                    {local.exeFound && onShowFolder ? (
                      <button type="button" className="ghost" onClick={() => onShowFolder(entry.app.id)}>
                        <Icon name="external" size={16} />{t('app.action.folder')}
                      </button>
                    ) : null}
                    {isHub && onHubUpdate && hubUpdate?.available && hubUpdate.blocked === null ? (
                      <button type="button" data-sound="none" aria-label={t('hubUpdate.updateNamed', { version: hubUpdate.available })} onClick={onHubUpdate}>
                        <Icon name="update" size={16} />{t('hubUpdate.update')}
                      </button>
                    ) : null}
                    {!isHub && onOperation && !busy ? (
                      <>
                        {updateAvailable(entry, local) && entry.release?.installer ? (
                          <button type="button" className="ghost" onClick={() => onOperation(entry.app.id, 'update')}>
                            <Icon name="update" size={16} />{t('app.action.update')}
                          </button>
                        ) : null}
                        {entry.release?.installer && entry.release.version === local.version ? (
                          <button type="button" className="ghost" onClick={() => onOperation(entry.app.id, 'repair')}>
                            <Icon name="repair" size={16} />{t('app.action.repair')}
                          </button>
                        ) : null}
                        <button type="button" className="ghost danger" onClick={() => onOperation(entry.app.id, 'uninstall')}>
                          <Icon name="uninstall" size={16} />{t('app.action.uninstall')}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {!isHub && local?.exeFound && onToggleOpenInHub ? (
                  <div className="dock-choice">
                    {dock?.dockable.includes(entry.app.id) ? (
                      <>
                        <button type="button" role="switch" aria-checked={openInHub.includes(entry.app.id)} aria-describedby="dock-mode-hint" className={`switch ${openInHub.includes(entry.app.id) ? 'on' : ''}`} data-sound="toggle" onClick={() => onToggleOpenInHub(entry.app.id, !openInHub.includes(entry.app.id))}>
                          <i aria-hidden="true" />
                          <span>{t('dock.mode', { name: entry.app.name })}</span>
                        </button>
                        <small className="path-note" id="dock-mode-hint">{t('dock.modeHint', { name: entry.app.name })}</small>
                        {onOpenDocked ? (
                          <button type="button" className="ghost small" data-sound="none" onClick={() => onOpenDocked(entry.app.id)}>
                            <Icon name="grid" size={15} />{t('dock.openInHubNamed', { name: entry.app.name })}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <small className="path-note settings-hint"><Icon name="info" size={14} />{t('dock.unsupported', { name: entry.app.name })}</small>
                    )}
                  </div>
                ) : null}
                {!isHub && installerSaves && dataActions ? <InstallerSaveButton entry={entry} saves={installerSaves} onReveal={dataActions.reveal} /> : null}
              </div>
              <div className="app-hero-version">
                {local ? (
                  <span className="installed-version tabular">{t('app.installedVersion')} : {local.version ? `v${local.version}` : t('myApps.unknownVersion')}</span>
                ) : null}
                {entry.release ? (
                  <>
                    <span>{t('appDetail.available')}</span>
                    <strong className="tabular">v{entry.release.version}</strong>
                    <small className="tabular">
                      {date(entry.release.publishedAt)}
                      {entry.release.installer ? ` · ${formatBytes(language, entry.release.installer.size)}` : ''}
                    </small>
                  </>
                ) : null}
              </div>
            </div>

            {entry.releaseIssue ? (
              <div className={`state-banner ${entry.releaseIssue === 'feed-invalid' ? 'error-banner' : ''}`} role="status">
                <Icon name={entry.releaseIssue === 'feed-invalid' ? 'alert' : 'info'} size={18} />
                <div><span>{t(`release.issue.${entry.releaseIssue}`)}</span></div>
              </div>
            ) : null}
            {entry.requiresNewerHub ? (
              <div className="state-banner warning-banner" role="status">
                <Icon name="update" size={18} />
                <div><span>{t('appDetail.requiresNewerHub')}</span></div>
              </div>
            ) : null}

            <Screenshots appId={entry.app.id} paths={entry.app.screenshots} load={loadAsset} />

            <div className="insight-grid">
              <Panel eyebrow={entry.app.name} title={t('appDetail.about')} labelledBy="app-detail-about">
                <p className="panel-copy">{localize(entry.app.description, language)}</p>
                {entry.app.windows.selfUpdates ? <p className="panel-note"><Icon name="refresh" size={15} />{t('appDetail.selfUpdates')}</p> : null}
              </Panel>
              <Panel eyebrow={t('appDetail.eyebrow')} title={t('appDetail.facts')} labelledBy="app-detail-facts" className="snapshot-panel">
                <SnapshotRow label={t('appDetail.category')} value={t(`category.${entry.app.category}`)} />
                <SnapshotRow label={t('appDetail.status')} value={t(`status.${entry.app.status}`)} />
                {entry.release ? <SnapshotRow label={t('appDetail.published')} value={date(entry.release.publishedAt)} /> : null}
                {entry.release?.installer ? <SnapshotRow label={t('appDetail.size')} value={formatBytes(language, entry.release.installer.size)} /> : null}
                <SnapshotRow label={t('appDetail.standalone')} value={t('appDetail.standaloneValue')} strong />
                <button type="button" className="ghost small repository-link" onClick={() => onOpenLink(`https://github.com/${entry.app.source.owner}/${entry.app.source.repo}`)}>
                  <Icon name="external" size={15} />
                  {t('appDetail.repository')}
                </button>
              </Panel>
            </div>

            {entry.app.dataNotice || entry.app.windows.preOperationBackup ? (
              <Panel eyebrow={t('data.eyebrow')} title={entry.app.windows.preOperationBackup ? t('data.title') : entry.app.name} labelledBy="app-detail-data" className="data-panel">
                {entry.app.dataNotice ? <p className="panel-note"><Icon name="shield" size={16} />{localize(entry.app.dataNotice, language)}</p> : null}
                {dataActions ? <DataActionsPanel entry={entry} installed={Boolean(local?.exeFound)} actions={dataActions} /> : null}
              </Panel>
            ) : null}

            {entry.release ? (
              <Panel eyebrow={t('appDetail.notes')} title={entry.release.name} badge={`v${entry.release.version}`} labelledBy="app-detail-notes" className="notes-panel">
                {entry.release.notes.trim() ? <Markdown source={entry.release.notes} title={entry.release.name} onOpenLink={onOpenLink} /> : <p className="panel-copy">{t('appDetail.noNotes')}</p>}
              </Panel>
            ) : null}
          </>
        ) : null}
      </StateView>
    </ScreenFrame>
  );
}
