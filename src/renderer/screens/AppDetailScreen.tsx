import { Icon } from '@nebula/design/react';
import { AppIcon, Panel, SnapshotRow, StatusChip } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { findFamilyApp } from '../family';
import { useLanguage, useT } from '../i18n';
import type { DataScreenProps } from './types';

/** App page. Screenshots, release notes, versions and actions arrive with the catalog (M2) and installer (M4). */
export function AppDetailScreen({ appId, status, syncedAt, onNavigate, onRetry }: DataScreenProps & { appId: string }) {
  const t = useT();
  const language = useLanguage();
  const app = findFamilyApp(appId);
  const effective = status === 'empty' && app ? 'ready' : app ? status : status === 'ready' ? 'empty' : status;

  return (
    <ScreenFrame
      eyebrow={t('appDetail.eyebrow')}
      title={app?.name ?? appId}
      labelledBy="app-detail-title"
      actions={
        <button type="button" className="ghost small" data-sound="nav" onClick={() => onNavigate({ screen: 'discover' })}>
          <Icon name="chevronLeft" size={15} />
          {t('appDetail.back')}
        </button>
      }
    >
      <StateView
        status={effective}
        offlineSyncedAt={syncedAt ?? null}
        onRetry={onRetry}
        errorMessage={t('appDetail.error')}
        empty={<EmptyState icon="package" title={t('appDetail.empty.title')} body={t('appDetail.empty.body')} />}
      >
        {app ? (
          <>
            <div className="app-hero nebula-surface">
              <AppIcon app={app} size={88} />
              <div>
                <p className="app-hero-tagline">{app.tagline[language]}</p>
                <div className="app-hero-chips">
                  <StatusChip status={app.status} />
                  <span className="category-chip">{t(`category.${app.category}`)}</span>
                </div>
              </div>
            </div>
            <div className="insight-grid">
              <Panel eyebrow={app.name} title={t('appDetail.about')} labelledBy="app-detail-about">
                <p className="panel-copy">{app.description[language]}</p>
              </Panel>
              <Panel eyebrow={t('appDetail.eyebrow')} title={app.id} labelledBy="app-detail-facts" className="snapshot-panel">
                <SnapshotRow label={t('appDetail.category')} value={t(`category.${app.category}`)} />
                <SnapshotRow label={t('appDetail.status')} value={t(`status.${app.status}`)} />
                <SnapshotRow label={t('appDetail.standalone')} value={t('appDetail.standaloneValue')} strong />
              </Panel>
            </div>
          </>
        ) : null}
      </StateView>
    </ScreenFrame>
  );
}
