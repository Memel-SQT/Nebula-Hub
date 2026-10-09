import { newsTabOf } from './news-tab';

const ITEM = { title: 'Un titre', source: 'Numerama', publishedAt: '2026-10-09T07:00:00Z', deepLink: 'nebula://news/article?id=a1' };

describe('"Nebula News" tab (ADR-036)', () => {
  it('shows the articles News answered', () => {
    const view = newsTabOf({ result: { title: 'Tech du jour', updatedAt: '2026-10-09T08:00:00Z', items: [ITEM] } });
    expect(view.state).toBe('ready');
    expect(view.articles?.items).toEqual([ITEM]);
  });

  it('keeps only links into Nebula News', () => {
    const view = newsTabOf({ result: { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [ITEM, { ...ITEM, deepLink: 'nebula://hub/settings' }] } });
    expect(view.articles?.items).toHaveLength(1);
    expect(newsTabOf({ result: { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [{ ...ITEM, deepLink: 'nebula://hub/' }] } }).state).toBe('empty');
  });

  it('is empty when News has nothing, unavailable when News does not answer', () => {
    expect(newsTabOf({ result: null }).state).toBe('empty');
    expect(newsTabOf({ result: { title: 'x', updatedAt: '2026-10-09T08:00:00Z', items: [] } }).state).toBe('empty');
    expect(newsTabOf({ error: 'provider-offline' }).state).toBe('unavailable');
    expect(newsTabOf({ error: 'timeout' }).state).toBe('unavailable');
  });
});
