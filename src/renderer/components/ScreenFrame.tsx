import type { ReactNode } from 'react';

/**
 * Page shell: eyebrow, title, optional actions, then the content (page-enter in full motion). The
 * inner column is centered with a maximum width that grows with the screen (app.css), so a wide or
 * ultrawide window never leaves everything stuck to the left.
 */
export function ScreenFrame({ eyebrow, title, intro, actions, children, labelledBy }: { eyebrow: string; title: string; intro?: string; actions?: ReactNode; children: ReactNode; labelledBy: string }) {
  return (
    <section className="workspace motion-page" aria-labelledby={labelledBy}>
      <div className="workspace-inner">
      <header className="topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id={labelledBy} tabIndex={-1}>{title}</h1>
          {intro ? <p className="topbar-intro">{intro}</p> : null}
        </div>
        {actions ? <div className="topbar-actions">{actions}</div> : null}
      </header>
      {children}
      </div>
    </section>
  );
}
