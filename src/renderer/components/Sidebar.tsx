import { Icon } from '@nebula/design/react';
import type { CatalogEntry } from '@shared/catalog-view';
import type { InstalledView } from '@shared/installed-view';
import { isActive, type DownloadsView } from '@shared/install-state';
import type { HubUpdateView } from '@shared/hub-update';
import type { LinkView } from '@shared/link-view';
import { installedOf } from '../catalog';
import { HubMark } from '../brand/HubMark';
import { useT, type TranslationKey } from '../i18n';
import { SECTIONS, type Route, type Section, type SectionGroup } from '../navigation';
import { AppIcon } from './Cards';
import { HubUpdateCard } from './HubUpdate';

const GROUP_TITLES: Record<Exclude<SectionGroup, 'system'>, TranslationKey> = {
  space: 'nav.group.space',
  manage: 'nav.group.manage',
};

/**
 * Sidebar: a floating panel with the brand lockup, the sections in titled groups, the launcher
 * ("waffle") with the family apps, then Settings, the Hub update card (when one is available,
 * ADR-029), the Nebula Link status card and the
 * local-only footer pinned at the bottom. Below 1100 px it becomes an icon rail (labels stay
 * as tooltips and for screen readers), below 720 px a bar at the top (app.css).
 */
export function Sidebar({ active, version, launcher, installed, downloads, link, hubUpdate, onNavigate, onLaunch, onHubUpdate, onCancelHubUpdate }: {
  active: Section;
  version: string;
  launcher: CatalogEntry[];
  installed?: InstalledView;
  downloads?: DownloadsView;
  link?: LinkView;
  hubUpdate?: HubUpdateView;
  onNavigate: (route: Route) => void;
  onLaunch?: (appId: string) => void;
  onHubUpdate?: () => void;
  onCancelHubUpdate?: () => void;
}) {
  const t = useT();
  const running = downloads?.operations.filter((operation) => isActive(operation.phase)).length ?? 0;
  const connected = link?.connected.length ?? 0;
  const linkState = !link || link.state === 'starting' ? 'starting' : link.state === 'error' ? 'error' : connected > 0 ? 'online' : 'ready';
  const linkLabel = linkState === 'starting' ? t('sidebar.link.starting')
    : linkState === 'error' ? t('sidebar.link.unavailable')
      : linkState === 'online' ? t('sidebar.link.online', { count: String(connected) })
        : t('sidebar.link.ready');

  const navItem = (section: (typeof SECTIONS)[number]) => {
    const current = section.id === active;
    return (
      <button
        key={section.id}
        type="button"
        className={`nav-item plain ${current ? 'active' : ''}`}
        data-sound="nav"
        aria-current={current ? 'page' : undefined}
        title={t(section.labelKey)}
        onClick={() => onNavigate({ screen: section.id } as Route)}
      >
        <span className="nav-icon"><Icon name={section.icon} size={18} /></span>
        <span className="nav-label">{t(section.labelKey)}</span>
        {section.id === 'downloads' && running > 0 ? (
          <span className="nav-badge tabular" aria-label={t('nav.downloadsActive', { count: String(running) })}>{running}</span>
        ) : null}
      </button>
    );
  };

  return (
    <aside className="sidebar nebula-surface nebula-sidebar">
      <div className="brand-lockup">
        <HubMark size={40} />
        <div>
          <strong>{t('app.name')}</strong>
          <span>{t('app.tagline')}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label={t('nav.sections')}>
        {(Object.keys(GROUP_TITLES) as Array<keyof typeof GROUP_TITLES>).map((group) => (
          <div key={group} className="nav-group" role="group" aria-labelledby={`nav-group-${group}`}>
            <p className="nav-group-title" id={`nav-group-${group}`}>{t(GROUP_TITLES[group])}</p>
            {SECTIONS.filter((section) => section.group === group).map(navItem)}
          </div>
        ))}

        <div className="nav-group launcher-rail" role="group" aria-labelledby="launcher-title">
          <p className="nav-group-title" id="launcher-title">{t('nav.launcher')}</p>
          {launcher.length === 0 ? <p className="launcher-empty">{t('nav.launcherEmpty')}</p> : null}
          {launcher.map((entry) => {
            const app = installedOf(installed, entry.app.id);
            // Installed apps start in one click; the others open their page.
            const launchable = Boolean(app?.exeFound && onLaunch);
            return (
              <button
                key={entry.app.id}
                type="button"
                className={`nav-item launcher-app plain ${app ? 'installed' : 'available'}`}
                data-sound={launchable ? 'none' : 'nav'}
                title={launchable ? t('app.action.openNamed', { name: entry.app.name }) : entry.app.name}
                aria-label={launchable ? t('app.action.openNamed', { name: entry.app.name }) : t('app.action.detailsNamed', { name: entry.app.name })}
                onClick={() => (launchable ? onLaunch!(entry.app.id) : onNavigate({ screen: 'app', appId: entry.app.id }))}
              >
                <span className="nav-icon"><AppIcon src={entry.icon} size={26} /></span>
                <span className="nav-label">{entry.app.name.replace(/^Nebula /, '')}</span>
                {app?.running ? <i className="status-dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div className="nav-group nav-group-system">
          {SECTIONS.filter((section) => section.group === 'system').map(navItem)}
        </div>
      </nav>

      {hubUpdate && onHubUpdate && onCancelHubUpdate ? <HubUpdateCard view={hubUpdate} onUpdate={onHubUpdate} onCancel={onCancelHubUpdate} /> : null}

      <button
        type="button"
        className={`link-card plain is-${linkState}`}
        data-sound="nav"
        title={`${t('sidebar.linkTitle')} · ${linkLabel}`}
        onClick={() => onNavigate({ screen: 'integrations' })}
      >
        <span className="link-card-icon">
          <Icon name="orbit" size={18} />
          <i className={`status-dot ${linkState === 'ready' || linkState === 'online' ? '' : 'warn'}`} aria-hidden="true" />
        </span>
        <span className="link-card-text">
          <strong>{t('sidebar.linkTitle')}</strong>
          <small>{linkLabel}</small>
        </span>
        <Icon name="chevronRight" size={14} className="link-card-chevron" />
      </button>

      <p className="sidebar-foot" title={t('sidebar.localNote')}>
        <Icon name="shield" size={13} />
        <span>{t('sidebar.local')}</span>
        <small className="tabular">{t('sidebar.version', { version })}</small>
      </p>
    </aside>
  );
}
