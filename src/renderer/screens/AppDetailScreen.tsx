import { Icon } from '@nebula/design/react';
import { localize } from '@shared/catalog';
import { catalogLoadState, findEntry } from '../catalog';
import { AppIcon, Panel, SnapshotRow, StatusChip } from '../components/Cards';
import { CatalogNotices } from '../components/CatalogNotices';
import { Markdown } from '../components/Markdown';
import { Screenshots } from '../components/Screenshots';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatBytes, locale, useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

/**
 * App page: screenshots, description, the version on the user's channel with its date and
 * size, the release notes (rendered from tokens, R12), the data notice and the facts. Install,
 * update, repair and uninstall actions arrive in M4–M5; integrations (manifest) in M6.
 */
export function AppDetailScreen({ appId, catalog, onNavigate, onRefresh, loadAsset, onOpenLink }: CatalogScreenProps & {
  appId: string;
  loadAsset: (appId: string, path: string) => Promise<string | null>;
  onOpenLink: (url: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const entry = findEntry(catalog, appId);
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
                  <StatusChip status={entry.app.status} />
                  <span className="category-chip">{t(`category.${entry.app.category}`)}</span>
                  {entry.release?.prerelease ? <span className="status-chip status-beta">{t('appDetail.prerelease')}</span> : null}
                </div>
              </div>
              <div className="app-hero-version">
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

            {entry.app.dataNotice ? (
              <Panel eyebrow={t('appDetail.data')} title={entry.app.name} labelledBy="app-detail-data" className="data-panel">
                <p className="panel-note"><Icon name="shield" size={16} />{localize(entry.app.dataNotice, language)}</p>
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
