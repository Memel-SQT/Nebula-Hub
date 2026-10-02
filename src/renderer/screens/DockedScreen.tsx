import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@nebula/design/react';
import type { CatalogView } from '@shared/catalog-view';
import type { DockView, Rect } from '@shared/dock';
import { AppIcon } from '../components/Cards';
import { useT } from '../i18n';
import type { Route } from '../navigation';

/** After this long without the app connecting, say it stayed in its own window. */
const SLOW_MS = 15_000;

/**
 * An app "inside the Hub" (ADR-027). The app draws itself, in its own window laid exactly over
 * `.dock-area`; this screen only reports where that area is (on every layout change) and shows
 * what is going on underneath: starting, too slow (older app), closed. Leaving the screen tells
 * the Hub the area is gone, so the app hides until it is shown again.
 */
export function DockedScreen({ appId, catalog, dock, onShow, onRelease, onNavigate, onArea }: {
  appId: string;
  catalog: CatalogView;
  dock: DockView;
  onShow: (appId: string) => void;
  onRelease: (appId: string) => void;
  onNavigate: (route: Route) => void;
  onArea: (area: Rect | null) => void;
}) {
  const t = useT();
  const area = useRef<HTMLDivElement>(null);
  const [slow, setSlow] = useState(false);
  const entry = catalog.entries.find((candidate) => candidate.app.id === appId);
  const name = entry?.app.name ?? appId;
  const open = dock.open.find((candidate) => candidate.appId === appId);
  const connected = Boolean(open?.connected);

  // Report the area on every layout change, and nothing once the screen is left.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return undefined;
    const report = () => {
      const box = element.getBoundingClientRect();
      onArea({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    report();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(report);
    observer?.observe(element);
    window.addEventListener('resize', report);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', report);
      onArea(null);
    };
  }, [onArea, appId]);

  useEffect(() => {
    setSlow(false);
    if (connected) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [connected, appId]);

  return (
    <section className="workspace docked-workspace" aria-labelledby="docked-title">
      <header className="docked-bar">
        <AppIcon src={entry?.icon ?? null} size={30} />
        <div className="docked-titles">
          <p className="eyebrow">{t('dock.eyebrow')}</p>
          <h1 id="docked-title" tabIndex={-1}>{name}</h1>
        </div>
        <div className="docked-actions">
          {open ? (
            <button type="button" className="ghost small" onClick={() => onRelease(appId)}>
              <Icon name="external" size={15} />{t('dock.release')}
            </button>
          ) : null}
          <button type="button" className="ghost small" data-sound="nav" onClick={() => onNavigate({ screen: 'home' })}>
            <Icon name="home" size={15} />{t('dock.back')}
          </button>
        </div>
      </header>
      <div ref={area} className="dock-area nebula-surface" role="region" aria-label={t('dock.areaLabel', { name })}>
        <div className="dock-placeholder" role="status" aria-live="polite">
          {!open ? (
            <>
              <p>{t('dock.closed', { name })}</p>
              <button type="button" data-sound="none" onClick={() => onShow(appId)}><Icon name="play" size={16} />{t('dock.reopen', { name })}</button>
            </>
          ) : connected ? (
            <p className="dock-hint"><Icon name="grid" size={18} />{t('dock.shown', { name })}</p>
          ) : slow ? (
            <p className="dock-hint warning"><Icon name="alert" size={18} />{t('dock.slow', { name })}</p>
          ) : (
            <p className="dock-hint"><Icon name="refresh" size={18} className="spin" />{t('dock.starting', { name })}</p>
          )}
        </div>
      </div>
    </section>
  );
}
