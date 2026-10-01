import type { ReactNode } from 'react';

/** Page shell: eyebrow, title, optional actions, then the content (page-enter in full motion). */
export function ScreenFrame({ eyebrow, title, intro, actions, children, labelledBy }: { eyebrow: string; title: string; intro?: string; actions?: ReactNode; children: ReactNode; labelledBy: string }) {
  return (
    <section className="workspace motion-page" aria-labelledby={labelledBy}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id={labelledBy} tabIndex={-1}>{title}</h1>
          {intro ? <p className="topbar-intro">{intro}</p> : null}
        </div>
        {actions ? <div className="topbar-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
