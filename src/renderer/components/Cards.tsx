import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Icon, spawnRipple, type IconName } from '@nebula/design/react';
import { localize, type AppStatus } from '@shared/catalog';
import type { CatalogEntry } from '@shared/catalog-view';
import { updateAvailable, type InstalledApp } from '@shared/installed-view';
import { useLanguage, useT } from '../i18n';

export type Tone = 'accent' | 'positive' | 'gold' | 'warning' | 'danger';

/**
 * Summary card, the Finterest dashboard KPI: colored top border, label, tinted icon chip, big
 * tabular value. Staggered `rise-in` entrance (40 ms, capped at five cards).
 */
export function SummaryCard({ label, value, icon, tone, hint }: { label: string; value: string; icon: IconName; tone: Tone; hint?: string }) {
  return (
    <article className={`summary-card nebula-surface motion-lift tone-${tone}`}>
      <div className="card-top">
        <span>{label}</span>
        <i><Icon name={icon} size={18} /></i>
      </div>
      <strong className="tabular">{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

/** Panel with an eyebrow, a title and an optional pill on the right (Finterest balance/snapshot panels). */
export function Panel({ eyebrow, title, badge, className, children, labelledBy }: { eyebrow: string; title: string; badge?: ReactNode; className?: string; children: ReactNode; labelledBy: string }) {
  return (
    <section className={`panel nebula-surface ${className ?? ''}`} aria-labelledby={labelledBy}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={labelledBy}>{title}</h2>
        </div>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function SnapshotRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'snapshot-total' : 'snapshot-row'}>
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
    </div>
  );
}

/** App icon from the catalog (data: URL); a neutral glyph when it could not be loaded. */
export function AppIcon({ src, size = 52 }: { src: string | null; size?: number }) {
  if (!src) {
    return <span className="app-icon app-icon-fallback" style={{ '--icon-size': `${size}px` } as CSSProperties}><Icon name="package" size={Math.round(size * 0.5)} /></span>;
  }
  return <img className="app-icon" src={src} alt="" width={size} height={size} style={{ '--icon-size': `${size}px` } as CSSProperties} />;
}

export function StatusChip({ status }: { status: AppStatus }) {
  const t = useT();
  return <span className={`status-chip status-${status}`}>{t(`status.${status}`)}</span>;
}

/**
 * What the user should know about an app at a glance: incomplete install, update available
 * (one soft pulse when it appears, then static), open, installed — or its catalog status.
 */
export function AppStateChip({ entry, installed }: { entry: CatalogEntry; installed?: InstalledApp }) {
  const t = useT();
  if (installed && !installed.exeFound) {
    return <span className="status-chip status-deprecated"><Icon name="alert" size={12} />{t('app.state.broken')}</span>;
  }
  if (installed && updateAvailable(entry, installed)) {
    return <span className="status-chip status-update pulse-once"><Icon name="update" size={12} />{t('app.state.update', { version: `v${entry.release!.version}` })}</span>;
  }
  if (installed?.running) {
    return <span className="status-chip status-running"><span className="status-dot" aria-hidden="true" />{t('app.state.running')}</span>;
  }
  if (installed) {
    return <span className="status-chip"><Icon name="check" size={12} />{t('app.state.installed')}</span>;
  }
  return <StatusChip status={entry.app.status} />;
}

/** Tile-sized wave from the tile's center (brief §10.3, app launch), full motion only. */
function waveTile(tile: HTMLElement | null): void {
  if (!tile || document.documentElement.dataset.motion !== 'full' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bounds = tile.getBoundingClientRect();
  spawnRipple(tile, { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
}

/**
 * Launcher / catalog tile. In `launch` mode an installed app starts in one click (the Hub is a
 * launcher, ADR-013) and its page stays one button away; otherwise the tile opens the page.
 */
export function AppTile({ entry, installed, mode = 'browse', onOpen, onLaunch }: {
  entry: CatalogEntry;
  installed?: InstalledApp;
  mode?: 'launch' | 'browse';
  onOpen: () => void;
  onLaunch?: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const tile = useRef<HTMLElement>(null);
  const { app, release } = entry;
  const canLaunch = mode === 'launch' && Boolean(onLaunch) && Boolean(installed?.exeFound) && app.role !== 'hub';
  const version = installed?.version ?? release?.version ?? null;
  return (
    <article ref={tile} className={`app-tile nebula-surface ${installed ? 'is-installed' : ''}`}>
      <button
        type="button"
        className="app-tile-main plain"
        data-sound={canLaunch ? 'none' : 'nav'}
        data-no-ripple={canLaunch ? '' : undefined}
        aria-label={canLaunch ? t('app.action.openNamed', { name: app.name }) : undefined}
        onClick={() => {
          if (canLaunch) {
            waveTile(tile.current);
            onLaunch!();
          } else {
            onOpen();
          }
        }}
      >
        <span className="app-tile-head">
          <AppIcon src={entry.icon} />
          <AppStateChip entry={entry} installed={installed} />
        </span>
        <strong>{app.name}</strong>
        <span className="app-tile-tagline">{localize(app.tagline, language)}</span>
      </button>
      <span className="app-tile-foot">
        <span className="category-chip">{t(`category.${app.category}`)}</span>
        {version ? <span className="version-chip tabular">v{version}</span> : null}
        {canLaunch ? (
          <button type="button" className="app-tile-more plain" data-sound="nav" aria-label={t('app.action.detailsNamed', { name: app.name })} onClick={onOpen}>
            {t('app.action.details')}<Icon name="chevronRight" size={14} />
          </button>
        ) : (
          <span className="app-tile-more" aria-hidden="true">{t('app.action.details')}<Icon name="chevronRight" size={14} /></span>
        )}
      </span>
    </article>
  );
}

/** The boxed control on the right of the topbar (Finterest's "Mois concerné"). */
export function TopbarControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="topbar-control">
      <span>{label}</span>
      <div className="topbar-control-box">{children}</div>
    </div>
  );
}
