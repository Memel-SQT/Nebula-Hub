import { Icon } from '@nebula/design/react';
import { HubMark } from '../brand/HubMark';
import { FAMILY_APPS } from '../family';
import { useT } from '../i18n';
import { SECTIONS, type Route, type Section } from '../navigation';
import { AppIcon } from './Cards';

/**
 * Sidebar in Finterest's layout: brand lockup, a status chip (Finterest's profile chip; here
 * the Nebula Link state), the section navigation, then the launcher rail ("waffle") with the
 * family apps, and the local-only footer.
 */
export function Sidebar({ active, version, onNavigate }: { active: Section; version: string; onNavigate: (route: Route) => void }) {
  const t = useT();
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
              {isActive ? <b><Icon name="chevronRight" size={14} /></b> : null}
            </button>
          );
        })}
      </nav>

      <div className="launcher-rail" role="group" aria-labelledby="launcher-title">
        <p className="launcher-title" id="launcher-title"><Icon name="grid" size={13} />{t('nav.launcher')}</p>
        <div className="launcher-apps">
          {FAMILY_APPS.map((app) => (
            <button key={app.id} type="button" className="launcher-app plain" data-sound="nav" title={app.name} onClick={() => onNavigate({ screen: 'app', appId: app.id })}>
              <AppIcon app={app} size={30} />
              <span>{app.name.replace(/^Nebula /, '')}</span>
            </button>
          ))}
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
