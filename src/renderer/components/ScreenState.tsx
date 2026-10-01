import type { ReactNode } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import { formatDateTime, useLanguage, useT } from '../i18n';

/** Every data screen is in exactly one of these states (brief §9). */
export type LoadState = 'loading' | 'empty' | 'offline' | 'error' | 'ready';

/** Animated skeleton cards, never a bare spinner. */
export function Skeleton({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className="skeleton-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-card nebula-surface" aria-hidden="true">
          <i className="skeleton skeleton-icon" />
          <i className="skeleton skeleton-line" />
          <i className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

/** `compact` drops the surface when the empty state already sits inside a panel. */
export function EmptyState({ icon, title, body, action, compact = false }: { icon: IconName; title: string; body: string; action?: { label: string; icon?: IconName; onClick: () => void }; compact?: boolean }) {
  const Heading = compact ? 'h3' : 'h2';
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state nebula-surface'}>
      <span className="empty-state-icon"><Icon name={icon} size={26} /></span>
      <Heading>{title}</Heading>
      <p>{body}</p>
      {action ? (
        <button type="button" onClick={action.onClick}>
          {action.icon ? <Icon name={action.icon} size={16} /> : null}
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function OfflineBanner({ syncedAt }: { syncedAt: string | null }) {
  const t = useT();
  const language = useLanguage();
  return (
    <div className="state-banner offline-banner" role="status">
      <Icon name="wifi" size={18} />
      <div>
        <strong>{t('state.offline.title')}</strong>
        <span>{syncedAt ? t('state.offline.body', { date: formatDateTime(language, syncedAt) }) : t('state.offline.never')}</span>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="state-banner error-banner" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>{t('state.error.title')}</strong>
        <span>{message}</span>
      </div>
      {onRetry ? (
        <button type="button" className="ghost small" onClick={onRetry}>
          <Icon name="refresh" size={15} />
          {t('state.retry')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Renders the right state: skeletons while loading, the error with a retry, the offline
 * banner above cached content (or above the empty state when there is no cache), the empty
 * state with a useful action, or the content.
 */
export function StateView({ status, empty, errorMessage, offlineSyncedAt = null, onRetry, children }: {
  status: LoadState;
  empty: ReactNode;
  errorMessage: string;
  offlineSyncedAt?: string | null;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  switch (status) {
    case 'loading':
      return <Skeleton label={t('state.loading')} />;
    case 'error':
      return <ErrorState message={errorMessage} onRetry={onRetry} />;
    case 'offline':
      return (
        <>
          <OfflineBanner syncedAt={offlineSyncedAt} />
          {children ?? empty}
        </>
      );
    case 'empty':
      return <>{empty}</>;
    default:
      return <>{children}</>;
  }
}
