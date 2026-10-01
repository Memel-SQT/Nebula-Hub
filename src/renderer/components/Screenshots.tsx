import { useEffect, useRef, useState } from 'react';
import { Icon } from '@nebula/design/react';
import { useT } from '../i18n';

function prefersInstant(): boolean {
  return document.documentElement.dataset.motion !== 'full' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Screenshot carousel: a scroll-snap strip (keyboard and wheel friendly) with previous / next
 * buttons that scroll smoothly in full motion only. Images are loaded lazily through the main
 * process, which serves only the paths the signed catalog declares.
 */
export function Screenshots({ appId, paths, load }: { appId: string; paths: string[]; load: (appId: string, path: string) => Promise<string | null> }) {
  const t = useT();
  const [images, setImages] = useState<Array<string | null>>(() => paths.map(() => null));
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setImages(paths.map(() => null));
    paths.forEach((path, position) => {
      void load(appId, path).then((url) => {
        if (!cancelled) setImages((current) => current.map((value, i) => (i === position ? url : value)));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [appId, paths, load]);

  const go = (next: number) => {
    const target = Math.max(0, Math.min(paths.length - 1, next));
    setIndex(target);
    const element = strip.current?.children[target] as HTMLElement | undefined;
    element?.scrollIntoView?.({ behavior: prefersInstant() ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
  };

  if (paths.length === 0) {
    return null;
  }
  return (
    <div className="screenshots">
      <div className="screenshot-strip" ref={strip} tabIndex={0} aria-label={t('appDetail.screenshots')}>
        {paths.map((path, position) => (
          <figure key={path} className="screenshot nebula-surface" aria-label={t('appDetail.screenshot', { index: String(position + 1), total: String(paths.length) })}>
            {images[position] ? <img src={images[position]!} alt={t('appDetail.screenshot', { index: String(position + 1), total: String(paths.length) })} /> : <i className="skeleton screenshot-placeholder" aria-hidden="true" />}
          </figure>
        ))}
      </div>
      {paths.length > 1 ? (
        <div className="screenshot-controls">
          <button type="button" className="ghost small icon-button" aria-label={t('appDetail.previous')} disabled={index === 0} onClick={() => go(index - 1)}><Icon name="chevronLeft" size={16} /></button>
          <span className="tabular">{index + 1} / {paths.length}</span>
          <button type="button" className="ghost small icon-button" aria-label={t('appDetail.next')} disabled={index === paths.length - 1} onClick={() => go(index + 1)}><Icon name="chevronRight" size={16} /></button>
        </div>
      ) : null}
    </div>
  );
}
