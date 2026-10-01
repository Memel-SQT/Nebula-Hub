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
import { SettingsScreen } from '../../src/renderer/screens/SettingsScreen';
import { OperationStatus } from '../../src/renderer/components/Operation';
import type { OperationView } from '../../src/shared/install-state';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { CatalogScreenProps, DataScreenProps } from '../../src/renderer/screens/types';
import type { CatalogView } from '../../src/shared/catalog-view';
import { EMPTY_INSTALLED_VIEW } from '../../src/shared/installed-view';
import { catalogView, downloadsView, historyEntry, installedView, operation } from './fixtures';

function wrap(node: JSX.Element) {
  return render(<LanguageContext.Provider value="fr">{node}</LanguageContext.Provider>);
}

// ---- Screens whose data arrives in later milestones: the four states. ----

const DATA_SCREENS: Array<[string, ComponentType<DataScreenProps>, RegExp]> = [
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

// ---- Installed apps (M3). ----

describe('My apps', () => {
  function renderMyApps(installed = installedView()) {
    const props = { onNavigate: jest.fn(), onRefresh: jest.fn(), onLaunch: jest.fn(), onShowFolder: jest.fn(), onRefreshInstalled: jest.fn() };
    wrap(<MyAppsScreen catalog={catalogView()} installed={installed} {...props} />);
    return props;
  }

  it('shows skeletons while detecting', () => {
    renderMyApps(EMPTY_INSTALLED_VIEW);
    expect(screen.getAllByRole('status')[0]).toHaveAttribute('aria-busy', 'true');
  });

  it('lists each detected app with its version, scope, location and state', () => {
    renderMyApps();
    expect(screen.getByText('3 installée(s)')).toBeInTheDocument();
    // Once in the installed list, once in the "Updates available" panel.
    expect(screen.getAllByText('v0.1.35 → v0.1.36')).toHaveLength(2);
    expect(screen.getByText('Mise à jour v0.1.36')).toBeInTheDocument();
    expect(screen.getByText('C:\\Users\\<user>\\AppData\\Local\\Programs\\finterest')).toBeInTheDocument();
    expect(screen.getAllByText('Pour cet utilisateur')).toHaveLength(3);
    expect(screen.getByText('Ouverte')).toBeInTheDocument();
    expect(screen.getByText(/Installation incomplète/)).toBeInTheDocument();
  });

  it('opens, shows the folder and the page of an app', async () => {
    const props = renderMyApps();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir Nebula Finterest' }));
    expect(props.onLaunch).toHaveBeenCalledWith('nebula.finterest');
    await userEvent.click(screen.getAllByRole('button', { name: /Afficher le dossier/ })[0]);
    expect(props.onShowFolder).toHaveBeenCalledWith('nebula.finterest');
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Clock' }));
    expect(props.onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.clock' });
  });

  it('never offers to open a broken install', () => {
    renderMyApps();
    expect(screen.queryByRole('button', { name: 'Ouvrir Nebula News' })).not.toBeInTheDocument();
  });

  it('shows the Hub itself without a launch button', () => {
    renderMyApps(installedView({ apps: [{ appId: 'nebula.hub', version: '0.1.0', scope: 'user', location: 'C:\\Hub', exeFound: true, running: true }] }));
    expect(screen.getByText('C’est l’app que vous utilisez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir Nebula Hub' })).not.toBeInTheDocument();
  });

  it('has a useful empty state, the available apps and a detection retry', async () => {
    const props = renderMyApps(installedView({ apps: [] }));
    expect(screen.getByText('Aucune app installée détectée')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Disponibles' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Détecter à nouveau/ }));
    expect(props.onRefreshInstalled).toHaveBeenCalled();
  });

  it('explains a detection error with a retry', async () => {
    const props = renderMyApps(installedView({ state: 'error', apps: [] }));
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Réessayer/ }));
    expect(props.onRefreshInstalled).toHaveBeenCalled();
  });
});

describe('Launcher (Home)', () => {
  it('launches an installed app in one click and keeps its page one button away', async () => {
    const onLaunch = jest.fn();
    const onNavigate = jest.fn();
    wrap(<HomeScreen catalog={catalogView()} installed={installedView()} onNavigate={onNavigate} onRefresh={jest.fn()} onLaunch={onLaunch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir Nebula Finterest' }));
    expect(onLaunch).toHaveBeenCalledWith('nebula.finterest');
    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Nebula Finterest' }));
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'app', appId: 'nebula.finterest' });
  });

  it('counts installed apps and updates', () => {
    wrap(<HomeScreen catalog={catalogView()} installed={installedView()} onNavigate={jest.fn()} onRefresh={jest.fn()} />);
    const installedCard = screen.getByText('Installées').closest('article')!;
    expect(within(installedCard).getByText('3')).toBeInTheDocument();
    const updatesCard = screen.getByText('Mises à jour').closest('article')!;
    expect(within(updatesCard).getByText('1')).toBeInTheDocument();
  });
});

describe('App page with an installed app', () => {
  it('shows the installed version and the open and folder actions', async () => {
    const onLaunch = jest.fn();
    const onShowFolder = jest.fn();
    wrap(<AppDetailScreen catalog={catalogView()} installed={installedView()} onNavigate={jest.fn()} onRefresh={jest.fn()} onLaunch={onLaunch} onShowFolder={onShowFolder} appId="nebula.finterest" loadAsset={loadAsset} onOpenLink={jest.fn()} />);
    expect(screen.getByText('Version installée : v0.1.35')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir Nebula Finterest/ }));
    expect(onLaunch).toHaveBeenCalledWith('nebula.finterest');
    await userEvent.click(screen.getByRole('button', { name: /Afficher le dossier/ }));
    expect(onShowFolder).toHaveBeenCalledWith('nebula.finterest');
  });
});

// ---- Download and install (M4). ----

describe('Install from the app page', () => {
  const notInstalled = installedView({ apps: [] });

  function renderPage(extra: Partial<CatalogScreenProps> = {}, appId = 'nebula.finterest') {
    const props = { onInstall: jest.fn(), onCancelOperation: jest.fn(), onDismissOperation: jest.fn() };
    wrap(<AppDetailScreen catalog={catalogView()} installed={notInstalled} onNavigate={jest.fn()} onRefresh={jest.fn()} appId={appId} loadAsset={loadAsset} onOpenLink={jest.fn()} {...props} {...extra} />);
    return props;
  }

  it('offers to install an app that is not installed, with the SmartScreen line the first time', async () => {
    const props = renderPage({ downloads: downloadsView({ operations: [], history: [] }) });
    expect(screen.getByText(/ne sont pas signées numériquement/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Installer Nebula Finterest' }));
    expect(props.onInstall).toHaveBeenCalledWith('nebula.finterest');
  });

  it('drops the SmartScreen line once an install succeeded', () => {
    renderPage({ downloads: downloadsView({ operations: [] }) });
    expect(screen.queryByText(/ne sont pas signées numériquement/)).not.toBeInTheDocument();
  });

  it('does not offer to install without a published installer', () => {
    renderPage({}, 'nebula.clock');
    expect(screen.queryByRole('button', { name: /Installer/ })).not.toBeInTheDocument();
  });

  it('shows the download progress in bytes, speed and time left, and can cancel', async () => {
    const props = renderPage({ downloads: downloadsView() });
    const bar = screen.getByRole('progressbar', { name: /Nebula Finterest — Téléchargement/ });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/42,3 Mo sur 84,5 Mo · 3 Mo\/s · environ 14 s restantes/)).toBeInTheDocument();
    expect(screen.getByText('Téléchargement 50 %')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Installer Nebula Finterest' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler l’installation de Nebula Finterest' }));
    expect(props.onCancelOperation).toHaveBeenCalledWith('op-1');
  });

  it('asks the user to close the app, never closes it', () => {
    renderPage({ downloads: downloadsView({ operations: [operation({ phase: 'waiting-for-app-exit' })] }) });
    expect(screen.getByText('Fermez Nebula Finterest pour continuer : le Hub ne ferme jamais une app à votre place.')).toBeInTheDocument();
  });

  it('cannot cancel a running installer', () => {
    renderPage({ downloads: downloadsView({ operations: [operation({ phase: 'installing' })] }) });
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
    expect(screen.getByText('Taille et empreinte SHA-512 vérifiées.')).toBeInTheDocument();
  });

  it('explains a failure in plain words and offers to retry', async () => {
    const props = renderPage({ downloads: downloadsView({ operations: [operation({ phase: 'failed', failure: 'hash-mismatch' })] }) });
    expect(screen.getByRole('alert')).toHaveTextContent('ne correspond pas à l’empreinte publiée (SHA-512) : il a été supprimé et rien n’a été installé.');
    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(props.onInstall).toHaveBeenCalledWith('nebula.finterest', 'install');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Nebula Finterest de la liste' }));
    expect(props.onDismissOperation).toHaveBeenCalledWith('op-1');
  });
});

describe('Downloads', () => {
  function renderDownloads(extra: Partial<CatalogScreenProps> = {}, onExportHistory = jest.fn(async () => 'saved' as const)) {
    const props = { onNavigate: jest.fn(), onInstall: jest.fn(), onLaunch: jest.fn(), onCancelOperation: jest.fn(), onDismissOperation: jest.fn() };
    wrap(<DownloadsScreen catalog={catalogView()} onRefresh={jest.fn()} onExportHistory={onExportHistory} {...props} {...extra} />);
    return { ...props, onExportHistory };
  }

  it('has a level-1 title and skeletons while loading', () => {
    renderDownloads();
    expect(screen.getByRole('heading', { level: 1, name: 'Téléchargements' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('has a useful empty state', async () => {
    const props = renderDownloads({ downloads: { operations: [], history: [] } });
    expect(screen.getByRole('heading', { level: 3, name: 'Aucun téléchargement' })).toBeInTheDocument();
    expect(screen.getByText('Aucune opération terminée pour l’instant.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter le journal/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Découvrir les apps/ }));
    expect(props.onNavigate).toHaveBeenCalledWith({ screen: 'discover' });
  });

  it('shows the queue with its progress and counts', () => {
    renderDownloads({ downloads: downloadsView({ operations: [operation(), operation({ id: 'op-2', appId: 'nebula.news', phase: 'queued', received: 0 })] }) });
    const card = (label: string) => within(screen.getAllByText(label).map((element) => element.closest('article.summary-card')).find(Boolean) as HTMLElement);
    expect(card('En cours').getByText('1')).toBeInTheDocument();
    expect(card('En attente').getByText('1')).toBeInTheDocument();
    expect(card('Terminés').getByText('1')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.getByText('Une opération à la fois.')).toBeInTheDocument();
  });

  it('opens an app right after its install', async () => {
    const props = renderDownloads({ downloads: downloadsView({ operations: [operation({ phase: 'installed', received: 88_626_634 })] }) });
    expect(screen.getByText('Nebula Finterest v0.1.36 est installée.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir/ }));
    expect(props.onLaunch).toHaveBeenCalledWith('nebula.finterest');
  });

  it('lists the history and exports the journal', async () => {
    const { onExportHistory } = renderDownloads({
      downloads: downloadsView({
        operations: [],
        history: [historyEntry({ id: 2, appId: 'nebula.finterest', version: '0.1.36', outcome: 'failed', failure: 'http', detail: '404' }), historyEntry()],
      }),
    });
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Échec')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Le serveur a refusé le téléchargement (code 404).')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Réussie')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Installation · v1.1.3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Exporter le journal/ }));
    expect(onExportHistory).toHaveBeenCalled();
    expect(await screen.findByText('Journal enregistré.')).toBeInTheDocument();
  });
});

describe('Settings: install folder', () => {
  function renderSettings(installDirectory: string | null) {
    const props = { onAppearanceChange: jest.fn(), onSettingsChange: jest.fn(), onRefreshCatalog: jest.fn(), onPickInstallDirectory: jest.fn() };
    wrap(<SettingsScreen settings={{ ...DEFAULT_SETTINGS, installDirectory }} resolvedTheme="nebula-dark" version="0.1.0" catalog={catalogView()} {...props} />);
    return props;
  }

  it('uses each app’s folder by default and lets the user choose one', async () => {
    const props = renderSettings(null);
    expect(screen.getByText('Dossier proposé par chaque app (recommandé)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revenir au dossier proposé/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Choisir un dossier/ }));
    expect(props.onPickInstallDirectory).toHaveBeenCalled();
  });

  it('shows the chosen folder and goes back to the default', async () => {
    const props = renderSettings('D:\\Apps');
    expect(screen.getByText('D:\\Apps')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Revenir au dossier proposé/ }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ installDirectory: null });
  });
});

// ---- Updates, repair, uninstall (M5). ----

describe('My apps: operations', () => {
  function renderMyApps(extra: Partial<CatalogScreenProps> = {}) {
    const props = { onNavigate: jest.fn(), onOperation: jest.fn(), onToggleAutoUpdate: jest.fn(), onUpdateAll: jest.fn(), onRequestClose: jest.fn(), onContinueWithoutBackup: jest.fn() };
    wrap(<MyAppsScreen catalog={catalogView()} installed={installedView()} onRefresh={jest.fn()} {...props} {...extra} />);
    return props;
  }

  it('offers update, repair and uninstall where they make sense', async () => {
    const props = renderMyApps();
    // In the "Updates available" panel and on the app's row.
    const updates = screen.getAllByRole('button', { name: 'Mettre à jour Nebula Finterest' });
    expect(updates).toHaveLength(2);
    await userEvent.click(updates[1]);
    expect(props.onOperation).toHaveBeenLastCalledWith('nebula.finterest', 'update');
    // Finterest 0.1.35 vs release 0.1.36: no repair; Clock and News have no published installer.
    expect(screen.queryByRole('button', { name: /^Réparer/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Désinstaller Nebula Clock' }));
    expect(props.onOperation).toHaveBeenLastCalledWith('nebula.clock', 'uninstall');
  });

  it('offers a repair when the installed version is the published one', async () => {
    const props = renderMyApps({ installed: installedView({ apps: [{ appId: 'nebula.finterest', version: '0.1.36', scope: 'user', location: 'C:\\x', exeFound: false, running: false }] }) });
    await userEvent.click(screen.getByRole('button', { name: 'Réparer Nebula Finterest' }));
    expect(props.onOperation).toHaveBeenCalledWith('nebula.finterest', 'repair');
  });

  it('shows the running operation instead of the actions', () => {
    renderMyApps({ downloads: downloadsView({ operations: [operation({ kind: 'update', fromVersion: '0.1.35' })] }) });
    expect(screen.queryByRole('button', { name: 'Désinstaller Nebula Finterest' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Nebula Finterest/ })).toBeInTheDocument();
  });

  it('turns automatic updates on and off per app', async () => {
    const props = renderMyApps({ autoUpdate: { 'nebula.clock': true } });
    const finterest = screen.getByRole('switch', { name: 'Mise à jour automatique de Nebula Finterest' });
    const clock = screen.getByRole('switch', { name: 'Mise à jour automatique de Nebula Clock' });
    expect(finterest).toHaveAttribute('aria-checked', 'false');
    expect(clock).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(finterest);
    expect(props.onToggleAutoUpdate).toHaveBeenCalledWith('nebula.finterest', true);
    await userEvent.click(clock);
    expect(props.onToggleAutoUpdate).toHaveBeenCalledWith('nebula.clock', false);
  });

  it('never offers operations on the Hub itself', () => {
    renderMyApps({ installed: installedView({ apps: [{ appId: 'nebula.hub', version: '0.1.0', scope: 'user', location: 'C:\\Hub', exeFound: true, running: true }] }) });
    expect(screen.queryByRole('button', { name: /Désinstaller/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('Updates panel', () => {
  it('lists the updates on Home with a button per app', async () => {
    const onOperation = jest.fn();
    wrap(<HomeScreen catalog={catalogView()} installed={installedView()} onNavigate={jest.fn()} onRefresh={jest.fn()} onOperation={onOperation} onUpdateAll={jest.fn()} />);
    const panel = within(screen.getByRole('region', { name: 'Mises à jour disponibles' }));
    expect(panel.getByText('v0.1.35 → v0.1.36')).toBeInTheDocument();
    // A single update: no "update all".
    expect(panel.queryByRole('button', { name: /Tout mettre à jour/ })).not.toBeInTheDocument();
    await userEvent.click(panel.getByRole('button', { name: 'Mettre à jour Nebula Finterest' }));
    expect(onOperation).toHaveBeenCalledWith('nebula.finterest', 'update');
  });

  it('offers to update everything when several apps are behind', async () => {
    const view = catalogView();
    const clock = view.entries.find((entry) => entry.app.id === 'nebula.clock')!;
    clock.release = { ...view.entries.find((entry) => entry.app.id === 'nebula.finterest')!.release!, version: '1.1.4' };
    const onUpdateAll = jest.fn();
    wrap(<HomeScreen catalog={view} installed={installedView()} onNavigate={jest.fn()} onRefresh={jest.fn()} onOperation={jest.fn()} onUpdateAll={onUpdateAll} />);
    await userEvent.click(screen.getByRole('button', { name: /Tout mettre à jour/ }));
    expect(onUpdateAll).toHaveBeenCalled();
  });

  it('is hidden when everything is up to date', () => {
    wrap(<HomeScreen catalog={catalogView()} installed={installedView({ apps: [] })} onNavigate={jest.fn()} onRefresh={jest.fn()} onOperation={jest.fn()} />);
    expect(screen.queryByRole('region', { name: 'Mises à jour disponibles' })).not.toBeInTheDocument();
  });
});

describe('Operation status (M5)', () => {
  function renderStatus(patch: Partial<OperationView>) {
    const props = { onRequestClose: jest.fn(), onContinueWithoutBackup: jest.fn(), onCancel: jest.fn() };
    const view = operation({ kind: 'update', fromVersion: '0.1.35', ...patch });
    wrap(<OperationStatus operation={view} name="Nebula Finterest" {...props} />);
    return { props, view };
  }
  const BACKUP = 'C:\\Users\\<user>\\Documents\\Nebula Finterest\\finterest-store-backup-2026-10-01_21-05-03.json';

  it('asks the app to close only when the user clicks (R08)', async () => {
    const { props, view } = renderStatus({ phase: 'waiting-for-app-exit' });
    expect(screen.getByText(/le Hub ne ferme jamais une app à votre place/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer Nebula Finterest' }));
    expect(props.onRequestClose).toHaveBeenCalledWith(view.id);
  });

  it('says what happens after a close request', () => {
    renderStatus({ phase: 'waiting-for-app-exit', closeRequested: true });
    expect(screen.getByText(/Demande de fermeture envoyée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer Nebula Finterest' })).not.toBeInTheDocument();
  });

  it('shows where the backup goes, then that it was checked', () => {
    renderStatus({ phase: 'backing-up', backup: { path: BACKUP, state: 'running', accounts: null, problem: null } });
    expect(screen.getByText(BACKUP)).toBeInTheDocument();
  });

  it('blocks on a failed backup with two choices: cancel, or continue after a second confirmation', async () => {
    const { props, view } = renderStatus({ phase: 'backup-failed', backup: { path: BACKUP, state: 'failed', accounts: null, problem: 'missing' } });
    expect(screen.getByRole('alert')).toHaveTextContent('La sauvegarde n’a pas pu être faite : l’app n’a écrit aucun fichier. Rien n’a été modifié.');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer sans sauvegarde' }));
    expect(props.onContinueWithoutBackup).toHaveBeenCalledWith(view);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler l’opération en cours sur Nebula Finterest' }));
    expect(props.onCancel).toHaveBeenCalledWith(view.id);
  });

  it('confirms the end of each kind of operation', () => {
    renderStatus({ phase: 'installed', backup: { path: BACKUP, state: 'ok', accounts: 2, problem: null } });
    expect(screen.getByText('Nebula Finterest est à jour (v0.1.36).')).toBeInTheDocument();
    expect(screen.getByText('Sauvegarde vérifiée (2 compte(s)) :')).toBeInTheDocument();
  });

  it('confirms an uninstall', () => {
    renderStatus({ kind: 'uninstall', phase: 'absent', version: '0.1.36' });
    expect(screen.getByText('Nebula Finterest est désinstallée.')).toBeInTheDocument();
  });
});
