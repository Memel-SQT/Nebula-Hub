import { useState } from 'react';
import { Icon } from '@nebula/design/react';
import { isHubEntry, unreadCount, type ActivityItem } from '@shared/activity';
import { formatDateTime, useLanguage, useT } from '../i18n';
import { HubMark } from '../brand/HubMark';
import { AppIcon } from './Cards';

/**
 * The activity center (brief I5, §9.1 "panneau latéral"): newest first, unread entries marked
 * until the user says they are read. A private entry's text is hidden until asked for, like a
 * private widget value.
 */
export function ActivityPanel({ items, seenAt, appName, appIcon, onMarkRead, onOpen }: {
  items: ActivityItem[];
  seenAt: string | null;
  appName: (appId: string) => string;
  appIcon: (appId: string) => string | null;
  onMarkRead: () => void;
  onOpen: (item: ActivityItem) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const unread = unreadCount(items, seenAt);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());

  return (
    <section className="panel activity-panel nebula-surface" aria-labelledby="home-activity">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('activity.eyebrow')}</p>
          <h2 id="home-activity">{t('activity.title')}</h2>
        </div>
        <span className={`pill ${unread ? '' : 'pill-muted'}`} aria-live="polite">{unread ? t('activity.unread', { count: String(unread) }) : t('activity.allRead')}</span>
      </div>
      {items.length === 0 ? (
        <p className="panel-empty"><Icon name="bell" size={18} />{t('activity.empty')}</p>
      ) : (
        <>
          <ol className="activity-list" aria-label={t('activity.listLabel')}>
            {items.slice(0, 50).map((item) => {
              const isNew = !seenAt || item.receivedAt > seenAt;
              const hidden = item.sensitivity === 'private' && !revealed.has(item.id);
              const name = isHubEntry(item) ? t('app.name') : appName(item.appId);
              return (
                <li key={item.id} className={`activity-item ${isNew ? 'is-new' : ''}`}>
                  <span className="activity-icon" aria-hidden="true">{isHubEntry(item) ? <HubMark size={28} /> : <AppIcon src={appIcon(item.appId)} size={28} />}</span>
                  <div className="activity-text">
                    <p className="activity-meta">
                      <strong>{name}</strong>
                      <time dateTime={item.receivedAt}>{formatDateTime(language, item.receivedAt)}</time>
                      {isNew ? <span className="activity-new">{t('activity.new')}</span> : null}
                    </p>
                    {hidden ? (
                      <p className="activity-private"><Icon name="shield" size={13} />{t('activity.private')}</p>
                    ) : (
                      <>
                        <p className="activity-title">{item.title}</p>
                        <p className="activity-body">{item.body}</p>
                      </>
                    )}
                  </div>
                  <span className="activity-actions">
                    {hidden ? (
                      <button type="button" className="ghost small" data-sound="toggle" onClick={() => setRevealed(new Set(revealed).add(item.id))}>
                        <Icon name="eye" size={14} />{t('activity.reveal')}
                      </button>
                    ) : null}
                    {item.deepLink ? (
                      <button type="button" className="ghost small" onClick={() => onOpen(item)}>
                        {t('activity.open')}<Icon name="chevronRight" size={14} />
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="activity-foot">
            <small>{t('activity.retention')}</small>
            {unread ? <button type="button" className="ghost small" onClick={onMarkRead}><Icon name="check" size={14} />{t('activity.markRead')}</button> : null}
          </div>
        </>
      )}
    </section>
  );
}
