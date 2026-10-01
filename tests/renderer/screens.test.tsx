import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { LanguageContext } from '../../src/renderer/i18n';
import type { LoadState } from '../../src/renderer/components/ScreenState';
import { AppDetailScreen } from '../../src/renderer/screens/AppDetailScreen';
import { DiscoverScreen } from '../../src/renderer/screens/DiscoverScreen';
import { DownloadsScreen } from '../../src/renderer/screens/DownloadsScreen';
import { HomeScreen } from '../../src/renderer/screens/HomeScreen';
import { IntegrationsScreen } from '../../src/renderer/screens/IntegrationsScreen';
import { MyAppsScreen } from '../../src/renderer/screens/MyAppsScreen';
import type { CatalogScreenProps, DataScreenProps } from '../../src/renderer/screens/types';
import type { CatalogView } from '../../src/shared/catalog-view';
import { catalogView } from './fixtures';

function wrap(node: JSX.Element) {
  return render(<LanguageContext.Provider value="fr">{node}</LanguageContext.Provider>);
}

// ---- Screens whose data arrives in later milestones: the four states. ----

const DATA_SCREENS: Array<[string, ComponentType<DataScreenProps>, RegExp]> = [
  ['MyApps', MyAppsScreen, /Mes apps/],
  ['Downloads', DownloadsScreen, /Téléchargements/],
  ['Integrations', IntegrationsScreen, /Intégrations/],
];

function renderData(Screen: ComponentType<DataScreenProps>, status: LoadState, extra: Partial<DataScreenProps> = {}) {
  const onNavigate = jest.fn();
  const onRetry = jest.fn();
  wrap(<Screen status={status} onNavigate={onNavigate} onRetry={onRetry} {...extra} />);
  return { onNavigate, onRetry };
}

describe.each(DATA_SCREENS)('%s screen', (_name, Screen, title) => {
  it('has a level-1 title', () => {
    renderData(Screen, 'empty');
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('shows skeletons while loading, never a bare spinner', () => {
    renderData(Screen, 'loading');
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText('Chargement…')).toBeInTheDocument();
    expect(status.querySelectorAll('.skeleton-card')).toHaveLength(3);
  });

  it('shows an empty state with a useful action', () => {
    renderData(Screen, 'empty');
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('shows the offline banner with the last sync date', () => {
    renderData(Screen, 'offline', { syncedAt: '2026-10-01T10:00:00Z' });
    expect(screen.getByText('Vous êtes hors ligne')).toBeInTheDocument();
    expect(screen.getByText(/synchronisées le/)).toBeInTheDocument();
  });

  it('shows a clear error with a working retry button', async () => {
    const { onRetry } = renderData(Screen, 'error');
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Une erreur est survenue')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: /Réessayer/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

it('Integrations empty state leads to My apps', async () => {
  const { onNavigate } = renderData(IntegrationsScreen, 'empty');
  await userEvent.click(screen.getByRole('button', { name: /Voir mes apps/ }));
  expect(onNavigate).toHaveBeenCalledWith({ screen: 'my-apps' });
});

// ---- Catalog screens (M2). ----

type CatalogScreen = ComponentType<CatalogScreenProps>;
// Never answers by default (no state update after a test ends); tests that check screenshots make it answer.
const loadAsset = jest.fn((_appId: string, _path: string) => new Promise<string | null>(() => undefined));
const answerScreenshots = () => loadAsset.mockImplementation(async () => 'data:image/png;base64,AAAA');
const AppDetail: CatalogScreen = (props) => <AppDetailScreen {...props} appId="nebula.finterest" loadAsset={loadAsset} onOpenLink={jest.fn()} />;

const CATALOG_SCREENS: Array<[string, CatalogScreen, RegExp]> = [
  ['Home', HomeScreen, /Mes apps Nebula/],
  ['Discover', DiscoverScreen, /Découvrir les apps Nebula/],
  ['AppDetail', AppDetail, /Nebula Finterest/],
];

function renderCatalog(Screen: CatalogScreen, view: CatalogView) {
  const onNavigate = jest.fn();
  const onRefresh = jest.fn();
  wrap(<Screen catalog={view} onNavigate={onNavigate} onRefresh={onRefresh} />);
  return { onNavigate, onRefresh };
}

// Lets the lazy screenshot loads settle inside act() once a test is done with the screen.
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  loadAsset.mockImplementation(() => new Promise<string | null>(() => undefined));
});

describe.each(CATALOG_SCREENS)('%s (catalog)', (_name, Screen, title) => {
  it('has a level-1 title', () => {
    renderCatalog(Screen, catalogView());
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('shows skeletons until the catalog is known', () => {
    renderCatalog(Screen, catalogView({ state: 'loading', entries: [] }));
    expect(screen.getAllByRole('status')[0]).toHaveAttribute('aria-busy', 'true');
  });

  it('shows offline content with the last sync date', () => {
    renderCatalog(Screen, catalogView({ state: 'offline' }));
    expect(screen.getByText('Vous êtes hors ligne')).toBeInTheDocument();
    expect(screen.getByText(/synchronisées le/)).toBeInTheDocument();
  });

  it('explains a missing catalog with a retry that refreshes', async () => {
    const { onRefresh } = renderCatalog(Screen, catalogView({ state: 'error', entries: [] }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/aucune copie vérifiée/)).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: /Réessayer/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('warns when a remote catalog was rejected (R03)', () => {
    renderCatalog(Screen, catalogView({ warning: 'signature-invalid' }));
    expect(screen.getByText(/signature invalide/)).toBeInTheDocument();
  });
});

describe('Home', () => {
  it('launches into the app pages from the launcher, without the Hub itself', async () => {
    const { onNavigate } = renderCatalog(HomeScreen, catalogView());
    expect(screen.getByRole('heading', { level: 2, name: 'Vos apps, en un clic' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Nebula Hub/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nebula Finterest/ }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.finterest' });
  });

  it('refreshes from the sync control', async () => {
    const { onRefresh } = renderCatalog(HomeScreen, catalogView());
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe('Discover', () => {
  it('lists the family apps with their version', async () => {
    const { onNavigate } = renderCatalog(DiscoverScreen, catalogView());
    expect(screen.getAllByRole('button', { name: /Nebula (Finterest|Clock|News)/ })).toHaveLength(3);
    expect(screen.getByText('v0.1.36')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nebula Clock/ }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.clock' });
  });

  it('filters by category and searches without accents', async () => {
    renderCatalog(DiscoverScreen, catalogView());
    await userEvent.click(screen.getByRole('radio', { name: 'Finance' }));
    expect(screen.getAllByRole('button', { name: /Nebula / })).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: 'Toutes' }));
    await userEvent.type(screen.getByRole('searchbox'), 'actualite');
    expect(screen.getByRole('button', { name: /Nebula News/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nebula Clock/ })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Aucune app ne correspond à « zzz ».')).toBeInTheDocument();
  });
});

describe('AppDetail', () => {
  it('shows the version, size, data notice, release notes and screenshots', async () => {
    answerScreenshots();
    renderCatalog(AppDetail, catalogView());
    expect(screen.getByText('v0.1.36', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getAllByText(/84,5 Mo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sauvegardés automatiquement/)).toBeInTheDocument();
    expect(screen.getByText('Cette app se met aussi à jour d’elle-même.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nouveautés' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('img', { name: /Capture/ })).toHaveLength(2));
    expect(loadAsset).toHaveBeenCalledWith('nebula.finterest', 'screenshots/finterest-dashboard.png');
  });

  it('explains release issues in plain words', () => {
    const view = catalogView();
    wrap(<AppDetailScreen catalog={view} onNavigate={jest.fn()} onRefresh={jest.fn()} appId="nebula.news" loadAsset={loadAsset} onOpenLink={jest.fn()} />);
    expect(screen.getByText('Aucune version publiée pour l’instant.')).toBeInTheDocument();
  });

  it('opens release-note links and the repository through the callback', async () => {
    const onOpenLink = jest.fn();
    wrap(<AppDetailScreen catalog={catalogView()} onNavigate={jest.fn()} onRefresh={jest.fn()} appId="nebula.finterest" loadAsset={loadAsset} onOpenLink={onOpenLink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Toutes les versions' }));
    await userEvent.click(screen.getByRole('button', { name: /Voir le code source/ }));
    expect(onOpenLink).toHaveBeenNthCalledWith(1, 'https://github.com/Memel-SQT/Nebula-Finterest/releases');
    expect(onOpenLink).toHaveBeenNthCalledWith(2, 'https://github.com/Memel-SQT/Nebula-Finterest');
  });

  it('says so when the app is unknown', () => {
    wrap(<AppDetailScreen catalog={catalogView()} onNavigate={jest.fn()} onRefresh={jest.fn()} appId="nebula.unknown" loadAsset={loadAsset} onOpenLink={jest.fn()} />);
    expect(screen.getByText('App introuvable')).toBeInTheDocument();
  });
});
