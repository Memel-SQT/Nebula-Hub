import { encodeIntentArg, shortName, type Capability, type Manifest } from '@nebula/link';
import { newsTabOf, NEWS_TAB_CAPABILITY, type NewsTabView } from '../../shared/news-tab';
import type { ActivityItem } from '../../shared/activity';
import type { CatalogApp } from '../../shared/catalog';
import { decide, HUB_ID, hubConsumes, notifyCapability, pairKey, type ConsentState } from '../../shared/consent';
import type { InstalledView } from '../../shared/installed-view';
import type { LinkCapabilityView, LinkPairView, LinkView } from '../../shared/link-view';
import type { Route } from '../../shared/route';
import type { WidgetView } from '../../shared/widgets';
import type { HubDatabase } from '../db';
import { HUB_MANIFEST, LinkServer, type AdmittedApp } from './link-server';
import { LinkStore } from './link-store';
import { readInstalledManifest, removeSession, writeSession } from './session';
import { WidgetBoard } from './widgets';
import { DockController } from './dock';
import { DOCK_EVENT, supportsDock, type DockView, type Rect } from '../../shared/dock';

/**
 * Nebula Link inside the Hub (docs/NEBULA_LINK.md): session file, pipe server, consents and
 * journal, the manifests of the installed apps, and the view of the Integrations screen. The main
 * process only wires it to the catalog, the detection and the window.
 */
export interface LinkHubDeps {
  db: HubDatabase;
  hubVersion: string;
  sessionDir: string;
  pipe: string;
  catalogApps(): CatalogApp[];
  installedView(): InstalledView;
  record(appId: string): { location: string; exeFound: boolean } | undefined;
  launch(appId: string, args: string[]): Promise<boolean>;
  appearance(): unknown;
  /** Whether a widget is on the Home (ADR-031); every widget when absent. */
  showOnHome?(capabilityId: string): boolean;
  navigate(route: Route): void;
  onChange(view: LinkView): void;
  /** The Home widgets changed (values in memory only). */
  onWidgets?(widgets: WidgetView[]): void;
  /** A new entry reached the activity center (the main process may relay it to Windows). */
  onActivity?(item: ActivityItem): void;
  /** A private pair now waits for the user (shown in Windows if the Hub is hidden). */
  onConsentRequest?(consumer: string, capability: string): void;
  /** Hub mode (ADR-027): the Hub window's content bounds (null when hidden or minimized). */
  dockContent?(): Rect | null;
  onDock?(view: DockView): void;
  now?(): Date;
}

/** Shown in the matrix for the activity center's private notifications of an app (§ 10, I5). */
function notifyCapabilityView(appId: string): LinkCapabilityView {
  return {
    id: notifyCapability(appId),
    provider: appId,
    kind: 'event',
    sensitivity: 'private',
    title: { fr: 'Notifications privées', en: 'Private notifications' },
    description: { fr: 'Notifications privées envoyées au centre d’activité du Hub.', en: 'Private notifications sent to the Hub’s activity center.' },
  };
}

export class LinkHub {
  readonly store: LinkStore;
  server: LinkServer | null = null;
  readonly widgets: WidgetBoard;
  readonly dock: DockController;
  private token = '';
  private readonly manifests = new Map<string, Manifest>();
  private readonly pending = new Map<string, { consumer: string; capability: string; at: string }>();
  private installedIds: Set<string> | null = null;

  constructor(private readonly deps: LinkHubDeps) {
    this.store = new LinkStore(deps.db);
    this.widgets = new WidgetBoard({
      manifests: () => [...this.manifests.values()],
      connected: () => this.server?.connectedApps().map((entry) => entry.appId) ?? [],
      query: (capability) => (this.server ? this.server.queryAs(HUB_ID, capability) : Promise.resolve({ error: 'provider-offline' })),
      shown: (capability) => this.deps.showOnHome?.(capability) ?? true,
      connectedSince: (appId) => {
        const entry = this.server?.connectedApps().find((candidate) => candidate.appId === appId);
        return entry ? Date.parse(entry.since) : undefined;
      },
      onChange: (widgets) => this.deps.onWidgets?.(widgets),
      now: deps.now ? () => deps.now!().getTime() : undefined,
    });
    this.dock = new DockController({
      dockable: () => [...this.manifests.values()].filter(supportsDock).map((manifest) => manifest.appId),
      subscribed: () => this.server?.subscribersOf(DOCK_EVENT) ?? [],
      send: (appId, payload) => this.server?.sendTo(appId, DOCK_EVENT, payload) ?? false,
      content: () => this.deps.dockContent?.() ?? null,
      launch: (appId) => this.deps.launch(appId, []),
      onChange: (view) => this.deps.onDock?.(view),
    });
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async start(): Promise<void> {
    this.store.load();
    void this.store.purge(this.now()).catch(() => undefined);
    const session = await writeSession(this.deps.sessionDir, this.deps.pipe, this.deps.hubVersion);
    this.token = session.token;
    this.server = new LinkServer({
      pipe: this.deps.pipe,
      token: session.token,
      hubVersion: this.deps.hubVersion,
      admit: (appId) => this.admit(appId),
      appIdForHost: (host) => (host === 'hub' ? HUB_ID : this.deps.catalogApps().find((app) => app.id === `nebula.${host}` && app.role !== 'hub')?.id ?? null),
      isInstalled: (appId) => this.deps.installedView().apps.some((app) => app.appId === appId),
      consent: (consumer, capability) => this.store.consent(consumer, capability),
      requestConsent: (consumer, capability) => {
        const key = pairKey(consumer, capability);
        if (this.pending.has(key)) return;
        this.pending.set(key, { consumer, capability, at: this.now().toISOString() });
        this.deps.onConsentRequest?.(consumer, capability);
        this.changed();
      },
      audit: (entry) => this.store.audit(entry),
      appearance: () => this.deps.appearance(),
      managesUpdates: () => true,
      notification: (appId, notification) => {
        void this.addActivity(appId, {
          notificationId: typeof notification.id === 'string' ? notification.id : null,
          title: String(notification.title),
          body: String(notification.body),
          sensitivity: notification.sensitivity === 'private' ? 'private' : 'public',
          deepLink: typeof notification.deepLink === 'string' ? notification.deepLink : null,
          category: typeof notification.category === 'string' ? notification.category : null,
        });
      },
      launchWithIntent: (appId, intent) => this.deps.launch(appId, [encodeIntentArg(intent)]),
      openAppPage: (appId) => this.deps.navigate({ screen: 'app', appId }),
      openHub: (path, params) => {
        const route = routeOf(path, params, this.deps.catalogApps());
        if (route?.screen === 'docked') void this.dock.show(route.appId);
        if (route) this.deps.navigate(route);
        return Boolean(route);
      },
      onChange: () => {
        this.widgets.connectionsChanged();
        this.dock.connectionsChanged();
        this.changed();
      },
      now: this.deps.now,
    });
    try {
      await this.server.start();
    } catch {
      // Pipe taken (another Hub of this user, or squatted): Link is shown as unavailable.
    }
    this.widgets.start();
    this.changed();
  }

  async stop(): Promise<void> {
    this.dock.releaseAll();
    this.widgets.stop();
    await this.server?.stop();
    await removeSession(this.deps.sessionDir, this.token);
    await this.store.flush().catch(() => undefined);
  }

  /** In the catalog, Link-capable, installed, and with a valid manifest in its install folder. */
  private async admit(appId: string): Promise<AdmittedApp | null> {
    const app = this.deps.catalogApps().find((candidate) => candidate.id === appId);
    const record = this.deps.record(appId);
    if (!app?.link || app.role === 'hub' || app.link.minProtocol > 1 || !record?.exeFound) return null;
    const admitted = await readInstalledManifest(appId, record.location, app.link.manifest);
    if (admitted) this.manifests.set(appId, admitted.manifest);
    return admitted;
  }

  /** After each detection: manifests re-read; uninstalled apps' consents archived, reinstalled restored. */
  async onInstalledChanged(view: InstalledView): Promise<void> {
    if (view.state !== 'ready') return;
    const ids = new Set(view.apps.map((app) => app.appId));
    if (this.installedIds) {
      const at = this.now().toISOString();
      for (const appId of this.installedIds) if (!ids.has(appId)) await this.store.archiveApp(appId, shortName(appId), at);
      for (const appId of ids) if (!this.installedIds.has(appId)) await this.store.restoreApp(appId, shortName(appId));
    }
    this.installedIds = ids;
    for (const appId of [...this.manifests.keys()]) if (!ids.has(appId)) this.manifests.delete(appId);
    for (const appId of ids) await this.admit(appId);
    this.widgets.sync();
    this.dock.connectionsChanged();
    this.changed();
  }

  broadcastAppearance(appearance: unknown): void {
    this.server?.broadcast('nebula.appearance.changed', appearance);
  }

  /** The "Nebula News" tab (ADR-036): today's tech articles, read as `nebula.hub`. */
  async newsArticles(): Promise<NewsTabView> {
    if (!this.server) return { state: 'unavailable', articles: null };
    return newsTabOf(await this.server.queryAs(HUB_ID, NEWS_TAB_CAPABILITY).catch(() => ({ error: 'internal' })));
  }

  routeDeepLink(url: string): Promise<string> {
    return this.server ? this.server.routeDeepLink(url) : Promise.resolve('invalid');
  }

  async setConsent(consumer: string, capability: string, state: ConsentState | null): Promise<LinkView> {
    await this.store.setConsent(consumer, capability, state, this.now().toISOString());
    this.pending.delete(pairKey(consumer, capability));
    this.server?.consentChanged(consumer, capability, state);
    if (consumer === HUB_ID) this.widgets.consentChanged(capability);
    this.changed();
    return this.view();
  }

  /** "Refuse everything for this app": every pair where it consumes or provides. */
  async denyApp(appId: string): Promise<LinkView> {
    for (const pair of this.view().pairs) {
      if ((pair.consumer === appId || pair.provider === appId) && pair.state !== 'denied') {
        await this.store.setConsent(pair.consumer, pair.capability, 'denied', this.now().toISOString());
        this.pending.delete(pairKey(pair.consumer, pair.capability));
        this.server?.consentChanged(pair.consumer, pair.capability, 'denied');
        if (pair.consumer === HUB_ID) this.widgets.consentChanged(pair.capability);
      }
    }
    this.changed();
    return this.view();
  }

  // ---- Activity center (I5).

  /** Stores an entry (an app's notification, or the Hub's own) and tells the main process. */
  async addActivity(appId: string, entry: { notificationId: string | null; title: string; body: string; sensitivity: 'public' | 'private'; deepLink: string | null; category: string | null }): Promise<ActivityItem | null> {
    try {
      const stored = await this.store.addNotification(appId, entry, this.now().toISOString());
      const item: ActivityItem = { ...stored };
      this.deps.onActivity?.(item);
      return item;
    } catch {
      return null;
    }
  }

  activity(): ActivityItem[] {
    return this.store.listNotifications().map((stored) => ({ ...stored }));
  }

  /** Settings → Advanced (ADR-023): the whole history, or one app's. */
  async clearActivity(appId?: string): Promise<ActivityItem[]> {
    await this.store.deleteNotifications(appId);
    return this.activity();
  }

  view(): LinkView {
    const manifests = [HUB_MANIFEST, ...this.manifests.values()];
    const capabilities: LinkCapabilityView[] = [];
    const pairs: LinkPairView[] = [];
    const last = this.store.lastExchanges();
    const pair = (consumer: string, capability: LinkCapabilityView): LinkPairView => {
      const state = this.store.consent(consumer, capability.id);
      return { consumer, capability: capability.id, provider: capability.provider, sensitivity: capability.sensitivity, state, decision: decide(capability.sensitivity, state), lastExchange: last.get(pairKey(consumer, capability.id)) ?? null };
    };
    for (const manifest of manifests) {
      for (const capability of manifest.provides) {
        const view = toView(manifest.appId, capability);
        const consumers = [...this.manifests.values()].filter((other) => other.appId !== manifest.appId && other.consumes.some((entry) => entry.id === capability.id)).map((other) => other.appId);
        if (manifest.appId !== HUB_ID && hubConsumes(capability)) consumers.unshift(HUB_ID);
        if (consumers.length === 0 && manifest.appId === HUB_ID) continue;
        capabilities.push(view);
        for (const consumer of consumers) pairs.push(pair(consumer, view));
      }
      if (manifest.appId !== HUB_ID) {
        const notify = notifyCapabilityView(manifest.appId);
        capabilities.push(notify);
        pairs.push(pair(HUB_ID, notify));
      }
    }
    return {
      state: this.server?.state ?? 'starting',
      connected: this.server?.connectedApps() ?? [],
      capabilities,
      pairs,
      pending: [...this.pending.values()],
    };
  }

  private changed(): void {
    this.deps.onChange(this.view());
  }
}

function toView(provider: string, capability: Capability): LinkCapabilityView {
  return { id: capability.id, provider, kind: capability.kind, sensitivity: capability.sensitivity, title: capability.title, description: capability.description };
}

/** `hub.open` and `nebula://hub/…` → a screen of the Hub (§ 5.2). */
export function routeOf(path: string, params: Record<string, string>, apps: CatalogApp[]): Route | null {
  switch (path) {
    case '/':
      return { screen: 'home' };
    case '/my-apps':
      return { screen: 'my-apps' };
    case '/downloads':
      return { screen: 'downloads' };
    case '/integrations':
      return { screen: 'integrations' };
    case '/settings':
      return { screen: 'settings' };
    case '/app':
      return apps.some((app) => app.id === params.id) ? { screen: 'app', appId: params.id } : null;
    case '/docked':
      return apps.some((app) => app.id === params.id && app.role !== 'hub') ? { screen: 'docked', appId: params.id } : null;
    default:
      return null;
  }
}
