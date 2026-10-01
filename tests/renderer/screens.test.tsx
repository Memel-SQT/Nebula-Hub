import { render, screen, within } from '@testing-library/react';
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
import type { DataScreenProps } from '../../src/renderer/screens/types';

const AppDetail = (props: DataScreenProps) => <AppDetailScreen {...props} appId="nebula.finterest" />;

const SCREENS: Array<[string, ComponentType<DataScreenProps>, RegExp]> = [
  ['Home', HomeScreen, /Mes apps Nebula/],
  ['Discover', DiscoverScreen, /Découvrir les apps Nebula/],
  ['AppDetail', AppDetail, /Nebula Finterest/],
  ['MyApps', MyAppsScreen, /Mes apps/],
  ['Downloads', DownloadsScreen, /Téléchargements/],
  ['Integrations', IntegrationsScreen, /Intégrations/],
];

function renderScreen(Screen: ComponentType<DataScreenProps>, status: LoadState, extra: Partial<DataScreenProps> = {}) {
  const onNavigate = jest.fn();
  const onRetry = jest.fn();
  render(
    <LanguageContext.Provider value="fr">
      <Screen status={status} onNavigate={onNavigate} onRetry={onRetry} {...extra} />
    </LanguageContext.Provider>,
  );
  return { onNavigate, onRetry };
}

describe.each(SCREENS)('%s screen', (_name, Screen, title) => {
  it('has a level-1 title', () => {
    renderScreen(Screen, 'empty');
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('shows skeletons while loading, never a bare spinner', () => {
    renderScreen(Screen, 'loading');
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText('Chargement…')).toBeInTheDocument();
    expect(status.querySelectorAll('.skeleton-card')).toHaveLength(3);
  });

  it('never renders a blank page when there is no data', () => {
    renderScreen(Screen, 'empty');
    expect(document.querySelectorAll('.nebula-surface').length).toBeGreaterThan(0);
  });

  it('shows the offline banner with the last sync date', () => {
    renderScreen(Screen, 'offline', { syncedAt: '2026-10-01T10:00:00Z' });
    expect(screen.getByText('Vous êtes hors ligne')).toBeInTheDocument();
    expect(screen.getByText(/synchronisées le/)).toBeInTheDocument();
  });

  it('shows a clear error with a working retry button', async () => {
    const { onRetry } = renderScreen(Screen, 'error');
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Une erreur est survenue')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: /Réessayer/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('empty-state actions', () => {
  it('Home shows the launcher with every family app', async () => {
    const { onNavigate } = renderScreen(HomeScreen, 'empty');
    expect(screen.getByRole('heading', { level: 2, name: 'Vos apps, en un clic' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nebula Finterest/ }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.finterest' });
  });

  it('Integrations leads to My apps', async () => {
    const { onNavigate } = renderScreen(IntegrationsScreen, 'empty');
    await userEvent.click(screen.getByRole('button', { name: /Voir mes apps/ }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'my-apps' });
  });

  it('Offline without cache says nothing could be synced yet', () => {
    renderScreen(DiscoverScreen, 'offline');
    expect(screen.getByText('Aucune donnée n’a encore pu être synchronisée.')).toBeInTheDocument();
  });
});

describe('Discover', () => {
  it('lists the family apps and opens an app page', async () => {
    const { onNavigate } = renderScreen(DiscoverScreen, 'ready');
    expect(screen.getAllByRole('button', { name: /Nebula (Finterest|Clock|News)/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /Nebula Clock/ }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.clock' });
  });

  it('filters by category and searches without accents', async () => {
    renderScreen(DiscoverScreen, 'ready');
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
  it('says so when the app is unknown', () => {
    render(<LanguageContext.Provider value="fr"><AppDetailScreen appId="nebula.unknown" status="ready" onNavigate={jest.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText('App introuvable')).toBeInTheDocument();
  });
});
