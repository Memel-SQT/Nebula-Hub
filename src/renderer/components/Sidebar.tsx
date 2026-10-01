import { Icon } from '@nebula/design/react';
import type { CatalogEntry } from '@shared/catalog-view';
import type { InstalledView } from '@shared/installed-view';
import { isActive, type DownloadsView } from '@shared/install-state';
import { installedOf } from '../catalog';
import { HubMark } from '../brand/HubMark';
import { useT } from '../i18n';
import { SECTIONS, type Route, type Section } from '../navigation';
import { AppIcon } from './Cards';

/**
 * Sidebar in Finterest's layout: brand lockup, a status chip (Finterest's profile chip; here
 * the Nebula Link state), the section navigation, then the launcher rail ("waffle") with the
 * family apps, and the local-only footer.
 */
export function Sidebar({ active, version, launcher, installed, downloads, onNavigate, onLaunch }: {
  active: Section;
  version: string;
  launcher: CatalogEntry[];
  installed?: InstalledView;
  downloads?: DownloadsView;
  onNavigate: (route: Route) => void;
  onLaunch?: (appId: string) => void;
}) {
  const t = useT();
  const running = downloads?.operations.filter((operation) => isActive(operation.phase)).length ?? 0;
  return (
    <aside className="sidebar nebula-surface nebula-sidebar">
      <div className="brand-lockup">
        <HubMark size={38} />
        <div>
          <strong>{t('app.name')}</strong>
          <span>{t('app.tagline')}</span>
        </div>
      </div>

      <button type="button" className="status-chip-button plain" data-sound="nav" onClick={() => onNavigate({ screen: 'integrations' })}>
        <span className="status-dot warn" aria-hidden="true" />
        <span>{t('link.offline')}</span>
        <b><Icon name="chevronRight" size={14} /></b>
      </button>

      <nav className="primary-nav" aria-label={t('nav.sections')}>
        {SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              className={`nav-button plain ${isActive ? 'active' : ''}`}
              data-sound="nav"
              aria-current={isActive ? 'page' : undefined}
              title={t(section.labelKey)}
              onClick={() => onNavigate({ screen: section.id } as Route)}
            >
              <span className="nav-icon"><Icon name={section.icon} size={19} /></span>
              <span className="nav-label">{t(section.labelKey)}</span>
              {section.id === 'downloads' && running > 0 ? (
                <span className="nav-badge tabular" aria-label={t('nav.downloadsActive', { count: String(running) })}>{running}</span>
              ) : null}
              {isActive ? <b><Icon name="chevronRight" size={14} /></b> : null}
            </button>
          );
        })}
      </nav>

      <div className="launcher-rail" role="group" aria-labelledby="launcher-title">
        <p className="launcher-title" id="launcher-title"><Icon name="grid" size={13} />{t('nav.launcher')}</p>
        {launcher.length === 0 ? <p className="launcher-empty">{t('nav.launcherEmpty')}</p> : null}
        <div className="launcher-apps">
          {launcher.map((entry) => {
            const app = installedOf(installed, entry.app.id);
            // Installed apps start in one click; the others open their page.
            const launchable = Boolean(app?.exeFound && onLaunch);
            return (
              <button
                key={entry.app.id}
                type="button"
                className={`launcher-app plain ${app ? 'installed' : 'available'}`}
                data-sound={launchable ? 'none' : 'nav'}
                title={launchable ? t('app.action.openNamed', { name: entry.app.name }) : entry.app.name}
                aria-label={launchable ? t('app.action.openNamed', { name: entry.app.name }) : t('app.action.detailsNamed', { name: entry.app.name })}
                onClick={() => (launchable ? onLaunch!(entry.app.id) : onNavigate({ screen: 'app', appId: entry.app.id }))}
              >
                <AppIcon src={entry.icon} size={30} />
                <span>{entry.app.name.replace(/^Nebula /, '')}</span>
                {app?.running ? <i className="status-dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-foot">
        <span><Icon name="shield" size={14} />{t('sidebar.local')}</span>
        <small>{t('sidebar.localNote')}</small>
        <small className="tabular">{t('sidebar.version', { version })}</small>
      </div>
    </aside>
  );
}
