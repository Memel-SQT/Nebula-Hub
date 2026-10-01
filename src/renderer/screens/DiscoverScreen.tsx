import { useMemo, useState } from 'react';
import { Icon } from '@nebula/design/react';
import { localize, type AppCategory } from '@shared/catalog';
import { catalogLoadState, familyEntries } from '../catalog';
import { AppTile } from '../components/Cards';
import { CatalogNotices } from '../components/CatalogNotices';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { useLanguage, useT } from '../i18n';
import type { CatalogScreenProps } from './types';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The signed catalog as cards, with a category filter and a local, accent-insensitive search. */
export function DiscoverScreen({ catalog, onNavigate, onRefresh }: CatalogScreenProps) {
  const t = useT();
  const language = useLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const entries = familyEntries(catalog);
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.app.category))], [entries]);

  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    return entries.filter(({ app }) => (category === 'all' || app.category === category)
      && (!needle || normalize(`${app.name} ${localize(app.tagline, language)} ${localize(app.description, language)}`).includes(needle)));
  }, [entries, query, category, language]);

  return (
    <ScreenFrame
      eyebrow={t('discover.eyebrow')}
      title={t('discover.title')}
      labelledBy="discover-title"
      actions={
        <>
          <label className="search-field">
            <Icon name="search" size={17} />
            <span className="visually-hidden">{t('discover.search')}</span>
            <input type="search" value={query} placeholder={t('discover.search')} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="ghost" disabled={catalog.refreshing} onClick={onRefresh}>
            <Icon name="refresh" size={16} className={catalog.refreshing ? 'spin' : undefined} />
            {t(catalog.refreshing ? 'discover.refreshing' : 'discover.refresh')}
          </button>
        </>
      }
    >
      <CatalogNotices view={catalog} />
      <StateView
        status={catalogLoadState(catalog)}
        offlineSyncedAt={catalog.syncedAt}
        onRetry={onRefresh}
        errorMessage={t('discover.error')}
        empty={<EmptyState icon="store" title={t('discover.empty.title')} body={t('discover.empty.body')} action={{ label: t('discover.empty.action'), icon: 'refresh', onClick: onRefresh }} />}
      >
        <div className="segmented category-filter" role="radiogroup" aria-label={t('discover.categories')}>
          {(['all', ...categories] as const).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={category === id} className={category === id ? 'active' : ''} data-sound="toggle" onClick={() => setCategory(id)}>
              {id === 'all' ? t('discover.allCategories') : t(`category.${id}`)}
            </button>
          ))}
        </div>
        {shown.length > 0 ? (
          <div className="catalog-grid">
            {shown.map((entry) => <AppTile key={entry.app.id} entry={entry} onOpen={() => onNavigate({ screen: 'app', appId: entry.app.id })} />)}
          </div>
        ) : (
          <p className="panel-empty" role="status"><Icon name="search" size={18} />{t('discover.noMatch', { query })}</p>
        )}
      </StateView>
    </ScreenFrame>
  );
}
