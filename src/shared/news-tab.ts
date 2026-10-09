import type { ReplyLike } from './widgets';

/**
 * The Hub's "Nebula News" tab (ADR-036): today's tech articles, read from Nebula News as
 * `nebula.hub` like the Home widgets. The result is already checked against `ArticlesV1` by the
 * Link server; only links into Nebula News itself are kept.
 */
export const NEWS_APP_ID = 'nebula.news';
export const NEWS_TAB_CAPABILITY = 'news.tech.articles';
/** The tab asks again this often while it is on screen (News refreshes its themes every 15 min). */
export const NEWS_TAB_REFRESH_MS = 60 * 1000;

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  summary?: string;
  deepLink: string;
}

export interface NewsArticles {
  title: string;
  updatedAt: string;
  items: NewsArticle[];
}

/** `unavailable`: News is not running or not answering yet (the tab says so and keeps asking). */
export type NewsTabState = 'loading' | 'ready' | 'empty' | 'unavailable';

export interface NewsTabView {
  state: NewsTabState;
  articles: NewsArticles | null;
}

export const LOADING_NEWS_TAB: NewsTabView = { state: 'loading', articles: null };

function isNewsLink(link: unknown): link is string {
  return typeof link === 'string' && (link === 'nebula://news' || link.startsWith('nebula://news/') || link.startsWith('nebula://news?'));
}

/** Maps a Link reply to the tab; any article linking outside Nebula News is dropped. */
export function newsTabOf(reply: ReplyLike): NewsTabView {
  if (!('result' in reply)) return { state: 'unavailable', articles: null };
  const value = reply.result as NewsArticles | null;
  const items = value ? value.items.filter((item) => isNewsLink(item.deepLink)) : [];
  if (!value || items.length === 0) return { state: 'empty', articles: null };
  return { state: 'ready', articles: { ...value, items } };
}
