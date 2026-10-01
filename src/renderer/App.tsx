import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setSoundsSuppressed, type NebulaAppearance } from '@nebula/design';
import { BackgroundFx, Splash, useAppliedAppearance, useInterfaceEffects, useResolvedTheme } from '@nebula/design/react';
import { EMPTY_CATALOG_VIEW, type CatalogView } from '@shared/catalog-view';
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
  const catalogProps = { catalog, onNavigate: setRoute, onRefresh: refreshCatalog };

  return (
    <LanguageContext.Provider value={language}>
      {background}
      <div className="titlebar-drag" aria-hidden="true" />
      <main className="app-shell">
        <Sidebar active={sectionOf(route)} version={initial.appVersion} launcher={familyEntries(catalog)} onNavigate={setRoute} />
        <div className="workspace-column">
          {saveError ? <ErrorState message={t('error.saveSettings')} /> : null}
          {route.screen === 'home' ? <HomeScreen {...catalogProps} version={initial.appVersion} /> : null}
          {route.screen === 'discover' ? <DiscoverScreen {...catalogProps} /> : null}
          {route.screen === 'app' ? <AppDetailScreen key={route.appId} {...catalogProps} appId={route.appId} loadAsset={loadAsset} onOpenLink={openLink} /> : null}
          {route.screen === 'my-apps' ? <MyAppsScreen {...screenProps} /> : null}
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
