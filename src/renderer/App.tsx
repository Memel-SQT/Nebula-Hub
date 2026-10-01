import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setSoundsSuppressed, type NebulaAppearance } from '@nebula/design';
import { BackgroundFx, Splash, useAppliedAppearance, useInterfaceEffects, useResolvedTheme } from '@nebula/design/react';
import { EMPTY_CATALOG_VIEW, type CatalogView } from '@shared/catalog-view';
import { EMPTY_INSTALLED_VIEW, type InstalledView } from '@shared/installed-view';
import { playSound } from '@nebula/design';
import type { HubSettings, SettingsPatch } from '@shared/settings';
import { familyEntries } from './catalog';
import { HubMark } from './brand/HubMark';
import { ErrorState } from './components/ScreenState';
import { Sidebar } from './components/Sidebar';
import { LanguageContext, translate } from './i18n';
import { sectionOf, type Route } from './navigation';
import { AppDetailScreen } from './screens/AppDetailScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { DownloadsScreen } from './screens/DownloadsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { IntegrationsScreen } from './screens/IntegrationsScreen';
import { MyAppsScreen } from './screens/MyAppsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/** Every panel opts into the liquid glass treatment with this class (see effects.ts). */
const GLASS_SURFACES = '.nebula-surface';

export function App() {
  const bridge = window.nebulaHub;
  const initial = useMemo(() => bridge.getInitialState(), [bridge]);
  const [settings, setSettings] = useState<HubSettings>(initial.settings);
  const [route, setRoute] = useState<Route>({ screen: 'home' });
  // Started hidden in the tray (launch at login): the splash is not played (brief §10.2 g).
  const [splashDone, setSplashDone] = useState(initial.startedHidden);
  const [visible, setVisible] = useState(!initial.startedHidden);
  const [saveError, setSaveError] = useState(false);
  const [catalog, setCatalog] = useState<CatalogView>(EMPTY_CATALOG_VIEW);
  const [installed, setInstalled] = useState<InstalledView>(EMPTY_INSTALLED_VIEW);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const appearance = settings.appearance;
  const language = appearance.language;

  const resolvedTheme = useResolvedTheme(appearance.theme);
  useAppliedAppearance(appearance, resolvedTheme);
  useInterfaceEffects(appearance.motion, resolvedTheme, GLASS_SURFACES);

  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => bridge.onSettingsChanged(setSettings), [bridge]);

  // The catalog as known now, then every change pushed by the main process (refresh, channel).
  useEffect(() => {
    let active = true;
    void bridge.getCatalog().then((view) => active && setCatalog(view));
    const unsubscribe = bridge.onCatalogChanged(setCatalog);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const refreshCatalog = useCallback(() => {
    void bridge.refreshCatalog().then(setCatalog, () => undefined);
  }, [bridge]);
  const loadAsset = useCallback((appId: string, assetPath: string) => bridge.getCatalogAsset(appId, assetPath), [bridge]);
  const openLink = useCallback((url: string) => {
    void bridge.openExternal(url);
  }, [bridge]);

  // Installed apps as last detected, then every new detection (startup, focus, after a launch).
  useEffect(() => {
    let active = true;
    void bridge.getInstalled().then((view) => active && setInstalled(view));
    const unsubscribe = bridge.onInstalledChanged(setInstalled);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const refreshInstalled = useCallback(() => {
    void bridge.refreshInstalled().then(setInstalled, () => undefined);
  }, [bridge]);

  const launchApp = useCallback((appId: string) => {
    const name = catalog.entries.find((entry) => entry.app.id === appId)?.app.name ?? appId;
    void bridge.launchApp(appId).then(
      (result) => {
        if (result === 'launched') {
          setLaunchError(null);
          playSound('open');
        } else if (result !== 'is-hub') {
          setLaunchError(translate(language, result === 'failed' ? 'launch.failed' : `launch.${result}`, { name }));
          playSound('error');
        }
      },
      () => setLaunchError(translate(language, 'launch.failed', { name })),
    );
  }, [bridge, catalog.entries, language]);

  const showFolder = useCallback((appId: string) => {
    void bridge.showAppFolder(appId);
  }, [bridge]);

  useEffect(() => {
    setSoundsSuppressed(initial.startedHidden);
    return bridge.onWindowVisibility((isVisible) => {
      setVisible(isVisible);
      setSoundsSuppressed(!isVisible);
    });
  }, [bridge, initial.startedHidden]);

  const handleSaved = useCallback((fresh: HubSettings) => {
    setSettings(fresh);
    setSaveError(false);
  }, []);

  // Applied immediately (optimistic), then re-synced from the main process' answer.
  const updateAppearance = useCallback((patch: Partial<NebulaAppearance>) => {
    setSettings((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
    bridge.updateAppearance(patch).then(handleSaved, () => setSaveError(true));
  }, [bridge, handleSaved]);

  const updateSettings = useCallback((patch: SettingsPatch) => {
    setSettings((current) => ({ ...current, ...patch }));
    bridge.updateSettings(patch).then(handleSaved, () => setSaveError(true));
  }, [bridge, handleSaved]);

  // Keyboard and screen-reader users land on the new page title after each navigation.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>('.workspace h1')?.focus();
  }, [route]);

  const finishSplash = useCallback(() => setSplashDone(true), []);
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate(language, key, params);
  const background = <BackgroundFx effect={appearance.background} motion={appearance.motion} paused={!visible} />;

  if (!splashDone) {
    return (
      <LanguageContext.Provider value={language}>
        {background}
        <div className="titlebar-drag" aria-hidden="true" />
        <Splash title={t('app.name')} tagline={t('app.tagline')} mark={<HubMark animated title={t('app.name')} />} motion={appearance.motion} onFinish={finishSplash} />
      </LanguageContext.Provider>
    );
  }

  const screenProps = { status: 'empty' as const, onNavigate: setRoute };
  const catalogProps = { catalog, installed, onNavigate: setRoute, onRefresh: refreshCatalog, onLaunch: launchApp, onShowFolder: showFolder };

  return (
    <LanguageContext.Provider value={language}>
      {background}
      <div className="titlebar-drag" aria-hidden="true" />
      <main className="app-shell">
        <Sidebar active={sectionOf(route)} version={initial.appVersion} launcher={familyEntries(catalog)} installed={installed} onNavigate={setRoute} onLaunch={launchApp} />
        <div className="workspace-column">
          {saveError ? <ErrorState message={t('error.saveSettings')} /> : null}
          {launchError ? <ErrorState message={launchError} onRetry={() => setLaunchError(null)} /> : null}
          {route.screen === 'home' ? <HomeScreen {...catalogProps} version={initial.appVersion} /> : null}
          {route.screen === 'discover' ? <DiscoverScreen {...catalogProps} /> : null}
          {route.screen === 'app' ? <AppDetailScreen key={route.appId} {...catalogProps} appId={route.appId} loadAsset={loadAsset} onOpenLink={openLink} /> : null}
          {route.screen === 'my-apps' ? <MyAppsScreen {...catalogProps} onRefreshInstalled={refreshInstalled} /> : null}
          {route.screen === 'downloads' ? <DownloadsScreen {...screenProps} /> : null}
          {route.screen === 'integrations' ? <IntegrationsScreen {...screenProps} /> : null}
          {route.screen === 'settings' ? (
            <SettingsScreen settings={settings} resolvedTheme={resolvedTheme} version={initial.appVersion} catalog={catalog} onAppearanceChange={updateAppearance} onSettingsChange={updateSettings} onRefreshCatalog={refreshCatalog} />
          ) : null}
        </div>
      </main>
    </LanguageContext.Provider>
  );
}
