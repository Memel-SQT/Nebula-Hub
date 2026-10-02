import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setSoundsSuppressed, type NebulaAppearance } from '@nebula/design';
import { BackgroundFx, Splash, useAppliedAppearance, useInterfaceEffects, useResolvedTheme } from '@nebula/design/react';
import { EMPTY_CATALOG_VIEW, type CatalogView } from '@shared/catalog-view';
import { EMPTY_INSTALLED_VIEW, type InstalledView } from '@shared/installed-view';
import { needsConfirmation, type DownloadsView, type OperationKind, type OperationPlan, type OperationView } from '@shared/install-state';
import { updateAvailable } from '@shared/installed-view';
import { HUB_ID, type ConsentState } from '@shared/consent';
import type { ActivityItem } from '@shared/activity';
import type { WidgetView } from '@shared/widgets';
import type { LinkView } from '@shared/link-view';
import { playSound } from '@nebula/design';
import type { HubSettings, SettingsPatch } from '@shared/settings';
import { localize } from '@shared/catalog';
import { familyEntries } from './catalog';
import { HubMark } from './brand/HubMark';
import { Onboarding } from './components/Onboarding';
import { ConfirmDialog, OperationConfirmation } from './components/ConfirmDialog';
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
  const [downloads, setDownloads] = useState<DownloadsView | undefined>(undefined);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [link, setLink] = useState<LinkView | undefined>(undefined);
  const [widgets, setWidgets] = useState<WidgetView[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // Shown once after the splash, until finished or skipped (brief §9.9); "Show again" in Settings.
  const [onboarding, setOnboarding] = useState(!initial.settings.onboardingCompleted && !initial.startedHidden);
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

  // Install queue and history (M4), then every change pushed by the main process.
  useEffect(() => {
    let active = true;
    void bridge.getDownloads().then((view) => active && setDownloads(view));
    const unsubscribe = bridge.onDownloadsChanged(setDownloads);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const installApp = useCallback((appId: string) => {
    const name = catalog.entries.find((entry) => entry.app.id === appId)?.app.name ?? appId;
    void bridge.installApp(appId).then(
      (result) => {
        if (result === 'queued') {
          setLaunchError(null);
        } else {
          setLaunchError(translate(language, `install.enqueue.${result}`, { name }));
          playSound('error');
        }
      },
      () => setLaunchError(translate(language, 'install.failure.internal')),
    );
  }, [bridge, catalog.entries, language]);

  // Nebula Link: connected apps, capabilities, consents (M6), then every change from the main process.
  useEffect(() => {
    let active = true;
    void bridge.getLink().then((view) => active && setLink(view), () => undefined);
    const unsubscribe = bridge.onLinkChanged(setLink);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const setLinkConsent = useCallback((consumer: string, capability: string, state: ConsentState | null) => {
    void bridge.setLinkConsent(consumer, capability, state).then(setLink, () => undefined);
  }, [bridge]);

  const denyLinkApp = useCallback((appId: string) => {
    void bridge.denyLinkApp(appId).then(setLink, () => undefined);
  }, [bridge]);

  // Home widgets (I3) and the activity center (I5), then every change from the main process.
  useEffect(() => {
    let active = true;
    void bridge.getWidgets().then((view) => active && setWidgets(view), () => undefined);
    void bridge.getActivity().then((items) => active && setActivity(items), () => undefined);
    const offWidgets = bridge.onWidgetsChanged(setWidgets);
    const offActivity = bridge.onActivityChanged(setActivity);
    return () => {
      active = false;
      offWidgets();
      offActivity();
    };
  }, [bridge]);

  const openDeepLink = useCallback((url: string) => {
    void bridge.openDeepLink(url);
  }, [bridge]);

  const refreshWidget = useCallback((capability: string) => {
    void bridge.refreshWidget(capability);
  }, [bridge]);

  const clearActivity = useCallback((appId: string | null) => {
    void bridge.clearActivity(appId).then(setActivity, () => undefined);
  }, [bridge]);

  const appName = useCallback((appId: string) => catalog.entries.find((entry) => entry.app.id === appId)?.app.name ?? appId, [catalog.entries]);

  const startOperation = useCallback((appId: string, kind: OperationKind, confirmed: boolean) => {
    void bridge.startOperation(appId, kind, confirmed).then(
      (result) => {
        if (result === 'queued') {
          setLaunchError(null);
        } else {
          setLaunchError(translate(language, `install.enqueue.${result}`, { name: appName(appId) }));
          playSound('error');
        }
      },
      () => setLaunchError(translate(language, 'install.failure.internal')),
    );
  }, [bridge, language, appName]);

  /** R04: update (of an app that backs up its data), repair and uninstall are confirmed first. */
  const requestOperation = useCallback((appId: string, kind: OperationKind) => {
    if (kind === 'install') {
      installApp(appId);
      return;
    }
    void bridge.planOperation(appId, kind).then(
      (plan) => {
        if (plan.blocked) {
          setLaunchError(translate(language, `install.enqueue.${plan.blocked}`, { name: appName(appId) }));
          playSound('error');
        } else if (plan.needsConfirmation) {
          setDialog({ type: 'operation', plan });
        } else {
          startOperation(appId, kind, false);
        }
      },
      () => setLaunchError(translate(language, 'install.failure.internal')),
    );
  }, [bridge, installApp, startOperation, language, appName]);

  const updateAll = useCallback(() => {
    const appIds = installed.apps
      .filter((app) => {
        const entry = catalog.entries.find((candidate) => candidate.app.id === app.appId);
        return entry?.app.role !== 'hub' && updateAvailable(entry, app);
      })
      .map((app) => app.appId);
    if (appIds.length === 0) return;
    void Promise.all(appIds.map((appId) => bridge.planOperation(appId, 'update'))).then((plans) => {
      const ready = plans.filter((plan) => !plan.blocked);
      if (ready.some((plan) => plan.needsConfirmation)) setDialog({ type: 'update-all', plans: ready });
      else ready.forEach((plan) => startOperation(plan.appId, 'update', false));
    });
  }, [bridge, installed.apps, catalog.entries, startOperation]);

  const requestClose = useCallback((operationId: string) => {
    void bridge.requestAppClose(operationId);
  }, [bridge]);

  const askContinueWithoutBackup = useCallback((operation: OperationView) => {
    setDialog({ type: 'no-backup', operation });
  }, []);

  const cancelOperation = useCallback((operationId: string) => {
    void bridge.cancelOperation(operationId);
  }, [bridge]);

  const dismissOperation = useCallback((operationId: string) => {
    void bridge.dismissOperation(operationId);
  }, [bridge]);

  const exportHistory = useCallback(() => bridge.exportHistory(), [bridge]);

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

  const pickInstallDirectory = useCallback(() => {
    void bridge.pickInstallDirectory().then((fresh) => fresh && handleSaved(fresh), () => setSaveError(true));
  }, [bridge, handleSaved]);

  // Applied immediately (optimistic), then re-synced from the main process' answer.
  const updateAppearance = useCallback((patch: Partial<NebulaAppearance>) => {
    setSettings((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
    bridge.updateAppearance(patch).then(handleSaved, () => setSaveError(true));
  }, [bridge, handleSaved]);

  const updateSettings = useCallback((patch: SettingsPatch) => {
    setSettings((current) => ({ ...current, ...patch }));
    bridge.updateSettings(patch).then(handleSaved, () => setSaveError(true));
  }, [bridge, handleSaved]);

  /** Brief 7.5: off by default; turning it on for an app that backs up its data is confirmed (R04). */
  const toggleAutoUpdate = useCallback((appId: string, enabled: boolean) => {
    const entry = catalog.entries.find((candidate) => candidate.app.id === appId);
    const apply = () => updateSettings({ autoUpdate: { ...settings.autoUpdate, [appId]: enabled } });
    if (enabled && entry && needsConfirmation('update', entry)) setDialog({ type: 'auto-update', appId, apply });
    else apply();
  }, [catalog.entries, settings.autoUpdate, updateSettings]);

  const reorderWidgets = useCallback((order: string[]) => updateSettings({ widgetOrder: order }), [updateSettings]);
  const widgetConsent = useCallback((capability: string, state: ConsentState) => setLinkConsent(HUB_ID, capability, state), [setLinkConsent]);
  const markActivityRead = useCallback(() => updateSettings({ activitySeenAt: new Date().toISOString() }), [updateSettings]);
  const openActivity = useCallback((item: ActivityItem) => {
    if (item.deepLink) openDeepLink(item.deepLink);
  }, [openDeepLink]);
  const finishOnboarding = useCallback(() => {
    setOnboarding(false);
    updateSettings({ onboardingCompleted: true });
  }, [updateSettings]);
  const replayOnboarding = useCallback(() => setOnboarding(true), []);

  // The tray can ask for a screen (e.g. "Updates available").
  useEffect(() => bridge.onNavigateRequest(setRoute), [bridge]);

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

  const catalogProps = {
    catalog,
    installed,
    downloads,
    onNavigate: setRoute,
    onRefresh: refreshCatalog,
    onLaunch: launchApp,
    onShowFolder: showFolder,
    onInstall: installApp,
    onCancelOperation: cancelOperation,
    onDismissOperation: dismissOperation,
    onOperation: requestOperation,
    onRequestClose: requestClose,
    onContinueWithoutBackup: askContinueWithoutBackup,
    onUpdateAll: updateAll,
    autoUpdate: settings.autoUpdate,
    onToggleAutoUpdate: toggleAutoUpdate,
  };
  const closeDialog = () => setDialog(null);
  const dialogEntry = (appId: string) => catalog.entries.find((entry) => entry.app.id === appId);

  return (
    <LanguageContext.Provider value={language}>
      {background}
      <div className="titlebar-drag" aria-hidden="true" />
      <main className="app-shell">
        <Sidebar active={sectionOf(route)} version={initial.appVersion} launcher={familyEntries(catalog)} installed={installed} downloads={downloads} link={link} onNavigate={setRoute} onLaunch={launchApp} />
        <div className="workspace-column">
          {saveError ? <ErrorState message={t('error.saveSettings')} /> : null}
          {launchError ? <ErrorState message={launchError} onRetry={() => setLaunchError(null)} /> : null}
          {route.screen === 'home' ? (
            <HomeScreen
              {...catalogProps}
              link={link}
              version={initial.appVersion}
              widgets={widgets}
              widgetOrder={settings.widgetOrder}
              activity={activity}
              activitySeenAt={settings.activitySeenAt}
              onReorderWidgets={reorderWidgets}
              onWidgetConsent={widgetConsent}
              onRefreshWidget={refreshWidget}
              onOpenLink={openDeepLink}
              onMarkActivityRead={markActivityRead}
              onOpenActivity={openActivity}
            />
          ) : null}
          {route.screen === 'discover' ? <DiscoverScreen {...catalogProps} /> : null}
          {route.screen === 'app' ? <AppDetailScreen key={route.appId} {...catalogProps} appId={route.appId} loadAsset={loadAsset} onOpenLink={openLink} /> : null}
          {route.screen === 'my-apps' ? <MyAppsScreen {...catalogProps} onRefreshInstalled={refreshInstalled} /> : null}
          {route.screen === 'downloads' ? <DownloadsScreen {...catalogProps} onExportHistory={exportHistory} /> : null}
          {route.screen === 'integrations' ? <IntegrationsScreen link={link} catalog={catalog} onNavigate={setRoute} onSetConsent={setLinkConsent} onDenyApp={denyLinkApp} /> : null}
          {route.screen === 'settings' ? (
            <SettingsScreen
              settings={settings}
              resolvedTheme={resolvedTheme}
              version={initial.appVersion}
              catalog={catalog}
              activity={activity}
              onAppearanceChange={updateAppearance}
              onSettingsChange={updateSettings}
              onRefreshCatalog={refreshCatalog}
              onPickInstallDirectory={pickInstallDirectory}
              onClearActivity={clearActivity}
              onReplayOnboarding={replayOnboarding}
            />
          ) : null}
        </div>
      </main>
      {onboarding ? <Onboarding catalog={catalog} installed={installed} settings={settings} onSettingsChange={updateSettings} onFinish={finishOnboarding} /> : null}
      {dialog?.type === 'operation' && dialogEntry(dialog.plan.appId) ? (
        <OperationConfirmation
          plan={dialog.plan}
          entry={dialogEntry(dialog.plan.appId)!}
          onCancel={closeDialog}
          onConfirm={() => {
            closeDialog();
            startOperation(dialog.plan.appId, dialog.plan.kind, true);
          }}
        />
      ) : null}
      {dialog?.type === 'update-all' ? (
        <ConfirmDialog
          title={t('confirm.updateAll.title')}
          icon="update"
          confirmLabel={t('confirm.updateAll.confirm')}
          onCancel={closeDialog}
          onConfirm={() => {
            closeDialog();
            dialog.plans.forEach((plan) => startOperation(plan.appId, 'update', true));
          }}
        >
          <p>{t('confirm.updateAll.body', { count: String(dialog.plans.length) })}</p>
          <ul className="dialog-list">
            {dialog.plans.map((plan) => (
              <li key={plan.appId}>
                <strong>{appName(plan.appId)}</strong> <span className="tabular">v{plan.fromVersion} → v{plan.version}</span>
                {plan.backupPath ? <><span>{t('confirm.backup', { name: appName(plan.appId) })}</span><code className="dialog-path">{plan.backupPath}</code></> : null}
              </li>
            ))}
          </ul>
          <p className="dialog-note">{t('confirm.backupCheck')}</p>
        </ConfirmDialog>
      ) : null}
      {dialog?.type === 'auto-update' ? (
        <ConfirmDialog
          title={t('confirm.autoUpdate.title', { name: appName(dialog.appId) })}
          icon="update"
          confirmLabel={t('confirm.autoUpdate.confirm')}
          onCancel={closeDialog}
          onConfirm={() => {
            closeDialog();
            dialog.apply();
          }}
        >
          <p>{t('confirm.autoUpdate.body', { name: appName(dialog.appId) })}</p>
          <p>{t('confirm.autoUpdate.backup', { name: appName(dialog.appId), folder: dialogEntry(dialog.appId)?.app.windows.preOperationBackup?.documentsFolder ?? '' })}</p>
        </ConfirmDialog>
      ) : null}
      {dialog?.type === 'no-backup' ? (
        <ConfirmDialog
          title={t('confirm.noBackup.title')}
          tone="danger"
          confirmLabel={t('confirm.noBackup.confirm')}
          onCancel={closeDialog}
          onConfirm={() => {
            closeDialog();
            void bridge.continueWithoutBackup(dialog.operation.id);
          }}
        >
          <p>{t('confirm.noBackup.body', { name: appName(dialog.operation.appId) })}</p>
          {dialogEntry(dialog.operation.appId)?.app.dataNotice ? <p className="dialog-note warning">{localize(dialogEntry(dialog.operation.appId)!.app.dataNotice!, language)}</p> : null}
        </ConfirmDialog>
      ) : null}
    </LanguageContext.Provider>
  );
}

type Dialog =
  | { type: 'operation'; plan: OperationPlan }
  | { type: 'update-all'; plans: OperationPlan[] }
  | { type: 'auto-update'; appId: string; apply: () => void }
  | { type: 'no-backup'; operation: OperationView };
