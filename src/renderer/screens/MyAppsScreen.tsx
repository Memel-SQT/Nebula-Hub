import { Panel } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { useT } from '../i18n';
import type { DataScreenProps } from './types';

/** Installed apps (version, location, actions) arrive in M3; migration (ADR-015) in M7. */
export function MyAppsScreen({ status, syncedAt, onNavigate, onRetry }: DataScreenProps) {
  const t = useT();
  return (
    <ScreenFrame eyebrow={t('myApps.eyebrow')} title={t('myApps.title')} labelledBy="my-apps-title">
      <Panel eyebrow={t('myApps.panel.eyebrow')} title={t('myApps.panel.title')} labelledBy="my-apps-panel">
        <StateView
          status={status}
          offlineSyncedAt={syncedAt ?? null}
          onRetry={onRetry}
          errorMessage={t('myApps.error')}
          empty={<EmptyState compact icon="grid" title={t('myApps.empty.title')} body={t('myApps.empty.body')} action={{ label: t('myApps.empty.action'), icon: 'store', onClick: () => onNavigate({ screen: 'discover' }) }} />}
        />
      </Panel>
    </ScreenFrame>
  );
}
