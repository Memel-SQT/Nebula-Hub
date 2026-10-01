import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import type { FamilyApp } from '../family';
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

export function AppIcon({ app, size = 52 }: { app: FamilyApp; size?: number }) {
  return <img className="app-icon" src={app.icon} alt="" width={size} height={size} style={{ '--icon-size': `${size}px` } as CSSProperties} />;
}

export function StatusChip({ status }: { status: FamilyApp['status'] }) {
  const t = useT();
  return <span className={`status-chip status-${status}`}>{t(`status.${status}`)}</span>;
}

/** Launcher / catalog tile: the whole card is a button that opens the app page. */
export function AppTile({ app, onOpen }: { app: FamilyApp; onOpen: () => void }) {
  const t = useT();
  const language = useLanguage();
  return (
    <button type="button" className="app-tile nebula-surface plain" data-sound="nav" onClick={onOpen}>
      <span className="app-tile-head">
        <AppIcon app={app} />
        <StatusChip status={app.status} />
      </span>
      <strong>{app.name}</strong>
      <span className="app-tile-tagline">{app.tagline[language]}</span>
      <span className="app-tile-foot">
        <span className="category-chip">{t(`category.${app.category}`)}</span>
        <span className="app-tile-more">{t('home.launcher.details')}<Icon name="chevronRight" size={14} /></span>
      </span>
    </button>
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
