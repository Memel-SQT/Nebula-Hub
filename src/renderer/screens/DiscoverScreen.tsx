import { useMemo, useState } from 'react';
import { Icon } from '@nebula/design/react';
import { AppTile } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { FAMILY_APPS, type AppCategory } from '../family';
import { useLanguage, useT } from '../i18n';
import type { DataScreenProps } from './types';

const CATEGORIES: AppCategory[] = ['finance', 'productivity', 'info'];

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Catalog cards with a category filter and a local search. The signed catalog feeds it from M2. */
export function DiscoverScreen({ status, syncedAt, onNavigate, onRetry }: DataScreenProps) {
  const t = useT();
  const language = useLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AppCategory | 'all'>('all');

  const apps = useMemo(() => {
    const needle = normalize(query.trim());
    return FAMILY_APPS.filter((app) => (category === 'all' || app.category === category)
      && (!needle || normalize(`${app.name} ${app.tagline[language]} ${app.description[language]}`).includes(needle)));
  }, [query, category, language]);

  return (
    <ScreenFrame
      eyebrow={t('discover.eyebrow')}
      title={t('discover.title')}
      labelledBy="discover-title"
      actions={
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="visually-hidden">{t('discover.search')}</span>
          <input type="search" value={query} placeholder={t('discover.search')} onChange={(event) => setQuery(event.target.value)} />
        </label>
      }
    >
      <StateView
        status={status === 'empty' && FAMILY_APPS.length > 0 ? 'ready' : status}
        offlineSyncedAt={syncedAt ?? null}
        onRetry={onRetry}
        errorMessage={t('discover.error')}
        empty={<EmptyState icon="store" title={t('discover.empty.title')} body={t('discover.empty.body')} action={onRetry ? { label: t('discover.empty.action'), icon: 'refresh', onClick: onRetry } : undefined} />}
      >
        <div className="segmented category-filter" role="radiogroup" aria-label={t('discover.categories')}>
          {(['all', ...CATEGORIES] as const).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={category === id} className={category === id ? 'active' : ''} data-sound="toggle" onClick={() => setCategory(id)}>
              {id === 'all' ? t('discover.allCategories') : t(`category.${id}`)}
            </button>
          ))}
        </div>
        {apps.length > 0 ? (
          <div className="catalog-grid">
            {apps.map((app) => <AppTile key={app.id} app={app} onOpen={() => onNavigate({ screen: 'app', appId: app.id })} />)}
          </div>
        ) : (
          <p className="panel-empty" role="status"><Icon name="search" size={18} />{t('discover.noMatch', { query })}</p>
        )}
      </StateView>
    </ScreenFrame>
  );
}
