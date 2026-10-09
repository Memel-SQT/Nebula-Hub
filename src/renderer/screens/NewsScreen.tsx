import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@nebula/design/react';
import { LOADING_NEWS_TAB, NEWS_TAB_REFRESH_MS, type NewsTabView } from '@shared/news-tab';
import { ScreenFrame } from '../components/ScreenFrame';
import { EmptyState, Skeleton } from '../components/ScreenState';
import { formatDateTime, useLanguage, useT } from '../i18n';

/**
 * "Nebula News" (ADR-036): today's tech articles, chosen by Nebula News for the Hub. Asked when
 * the tab opens, then every minute while it is on screen, so the list appears on its own once
 * News answers. An article opens in Nebula News (inside the Hub).
 */
export function NewsScreen({ load, onOpenLink }: { load: () => Promise<NewsTabView>; onOpenLink: (deepLink: string) => void }) {
  const t = useT();
  const language = useLanguage();
  const [view, setView] = useState<NewsTabView>(LOADING_NEWS_TAB);

  const refresh = useCallback(() => {
    void load().then(setView, () => setView({ state: 'unavailable', articles: null }));
  }, [load]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, NEWS_TAB_REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const actions = (
    <button type="button" className="ghost" data-sound="nav" onClick={refresh}>
      <Icon name="refresh" size={16} />{t('news.refresh')}
    </button>
  );

  return (
    <ScreenFrame eyebrow={t('news.eyebrow')} title={t('news.title')} intro={t('news.intro')} actions={actions} labelledBy="news-title">
      {view.state === 'loading' ? <Skeleton count={4} label={t('news.loading')} /> : null}
      {view.state === 'unavailable' ? <EmptyState icon="newspaper" title={t('news.unavailable.title')} body={t('news.unavailable.body')} /> : null}
      {view.state === 'empty' ? <EmptyState icon="newspaper" title={t('news.empty.title')} body={t('news.empty.body')} /> : null}
      {view.state === 'ready' && view.articles ? (
        <ul className="news-list" aria-label={view.articles.title}>
          {view.articles.items.map((item) => (
            <li key={item.deepLink}>
              <button type="button" className="news-item plain nebula-surface" data-sound="nav" onClick={() => onOpenLink(item.deepLink)}>
                <span className="news-meta">
                  <strong>{item.source}</strong>
                  <time dateTime={item.publishedAt}>{formatDateTime(language, item.publishedAt)}</time>
                </span>
                <span className="news-title">{item.title}</span>
                {item.summary ? <span className="news-summary">{item.summary}</span> : null}
                <span className="news-open"><Icon name="external" size={14} />{t('news.open')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </ScreenFrame>
  );
}
