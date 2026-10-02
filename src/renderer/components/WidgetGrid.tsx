import { useEffect, useState, type DragEvent } from 'react';
import { Icon } from '@nebula/design/react';
import type { ConsentState } from '@shared/consent';
import { moveWidget, placeWidget, type WidgetView } from '@shared/widgets';
import { formatTime, useLanguage, useT } from '../i18n';
import { AppIcon } from './Cards';

interface WidgetGridProps {
  /** Already in the user's order. */
  widgets: WidgetView[];
  appName: (appId: string) => string;
  appIcon: (appId: string) => string | null;
  onReorder: (order: string[]) => void;
  onConsent: (capability: string, state: ConsentState) => void;
  onRefresh: (capability: string) => void;
  onOpenLink: (url: string) => void;
  onLaunch: (appId: string) => void;
}

/**
 * Home widgets (brief I3, §10.4): cards drawn by the Hub from `WidgetV1` data, never from the
 * app's HTML. Reordered by drag and drop (grabbed card: strong shadow, scale 1.02) or with the
 * arrow buttons, which a screen reader announces. Private values are masked until the user asks,
 * and masked again whenever the data is replaced.
 */
export function WidgetGrid({ widgets, appName, appIcon, onReorder, onConsent, onRefresh, onOpenLink, onLaunch }: WidgetGridProps) {
  const t = useT();
  const language = useLanguage();
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const ids = widgets.map((widget) => widget.id);
  const titleOf = (id: string) => widgetTitle(widgets.find((widget) => widget.id === id), language);

  const commit = (order: string[], id: string) => {
    onReorder(order);
    setAnnounce(t('widgets.moved', { title: titleOf(id), position: String(order.indexOf(id) + 1), count: String(order.length) }));
  };

  const onDrop = (event: DragEvent, target: string) => {
    event.preventDefault();
    const id = dragged ?? event.dataTransfer.getData('text/plain');
    setDragged(null);
    setOver(null);
    if (!id || id === target || !ids.includes(id)) return;
    commit(placeWidget(ids, id, ids.indexOf(target)), id);
  };

  return (
    <>
      <ul className="widget-grid" aria-label={t('widgets.title')}>
        {widgets.map((widget, index) => (
          <li
            key={widget.id}
            className={`widget-card nebula-surface ${dragged === widget.id ? 'is-dragged' : ''} ${over === widget.id && dragged !== widget.id ? 'is-drop-target' : ''}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', widget.id);
              setDragged(widget.id);
            }}
            onDragEnd={() => {
              setDragged(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              if (!dragged) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (over !== widget.id) setOver(widget.id);
            }}
            onDrop={(event) => onDrop(event, widget.id)}
          >
            <WidgetCard
              widget={widget}
              appName={appName(widget.provider)}
              icon={appIcon(widget.provider)}
              first={index === 0}
              last={index === widgets.length - 1}
              onMove={(delta) => commit(moveWidget(ids, widget.id, delta), widget.id)}
              onConsent={(state) => onConsent(widget.id, state)}
              onRefresh={() => onRefresh(widget.id)}
              onOpenLink={onOpenLink}
              onLaunch={() => onLaunch(widget.provider)}
            />
          </li>
        ))}
      </ul>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
    </>
  );
}

function widgetTitle(widget: WidgetView | undefined, language: 'fr' | 'en'): string {
  if (!widget) return '';
  return (language === 'en' ? widget.title.en : undefined) ?? widget.title.fr;
}

function WidgetCard({ widget, appName, icon, first, last, onMove, onConsent, onRefresh, onOpenLink, onLaunch }: {
  widget: WidgetView;
  appName: string;
  icon: string | null;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onConsent: (state: ConsentState) => void;
  onRefresh: () => void;
  onOpenLink: (url: string) => void;
  onLaunch: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const title = widgetTitle(widget, language);
  const data = widget.data;
  const [revealed, setRevealed] = useState(false);
  // A new value (or none) is masked again: a revealed private value never stays on screen by default.
  useEffect(() => setRevealed(false), [data]);
  const masked = widget.sensitivity === 'private' && !revealed;
  const headingId = `widget-${widget.id.replace(/\W/g, '-')}`;

  return (
    <article className="widget-body" aria-labelledby={headingId}>
      <header className="widget-head">
        <AppIcon src={icon} size={30} />
        <div className="widget-titles">
          <h3 id={headingId}>{title}</h3>
          <span className="widget-source">{appName}{widget.sensitivity === 'private' ? <span className="widget-private"><Icon name="shield" size={11} />{t('widgets.private')}</span> : null}</span>
        </div>
        <span className="widget-grip" aria-hidden="true" title={t('widgets.grab', { title })}><Icon name="grip" size={16} /></span>
      </header>

      <div className="widget-content">
        {widget.state === 'ready' && data ? (
          <>
            {data.value !== undefined ? (
              <div className="widget-value-row">
                <strong className={`widget-value tabular ${masked ? 'is-masked' : 'is-revealed'}`} aria-live="polite">
                  {masked ? <span className="mask-dots" aria-label={t('widgets.masked')} role="img"><i /><i /><i /></span> : <>{data.value}{data.unit ? <small>{data.unit}</small> : null}</>}
                </strong>
                {widget.sensitivity === 'private' ? (
                  <button type="button" className="icon-button ghost plain" aria-label={t(masked ? 'widgets.reveal' : 'widgets.conceal', { title })} aria-pressed={!masked} data-sound="toggle" onClick={() => setRevealed(!revealed)}>
                    <Icon name={masked ? 'eye' : 'eyeOff'} size={17} />
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="widget-data-title">{data.title}</p>
            {data.caption ? <p className="widget-caption">{data.caption}</p> : null}
            {data.items?.length ? (
              <ul className={`widget-items ${masked ? 'is-masked' : ''}`}>
                {data.items.map((item, index) => (
                  <li key={`${item.label}-${index}`}><span>{item.label}</span><strong className="tabular">{masked ? t('widgets.masked') : item.value}</strong></li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <WidgetMessage widget={widget} appName={appName} onConsent={onConsent} onLaunch={onLaunch} />
        )}
      </div>

      <footer className="widget-foot">
        <span className="widget-time">{widget.refreshedAt && widget.state === 'ready' ? t('widgets.updated', { time: formatTime(language, widget.refreshedAt) }) : null}</span>
        <span className="widget-actions">
          {data?.deepLink ? (
            <button type="button" className="icon-button ghost plain" aria-label={t('widgets.open', { name: appName })} title={t('widgets.open', { name: appName })} onClick={() => onOpenLink(data.deepLink!)}>
              <Icon name="external" size={16} />
            </button>
          ) : null}
          <button type="button" className="icon-button ghost plain" aria-label={t('widgets.refresh', { title })} title={t('widgets.refresh', { title })} disabled={widget.state === 'loading' || widget.state === 'offline'} onClick={onRefresh}>
            <Icon name="refresh" size={16} />
          </button>
          <button type="button" className="icon-button ghost plain" aria-label={t('widgets.moveBefore', { title })} title={t('widgets.moveBefore', { title })} disabled={first} onClick={() => onMove(-1)}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button type="button" className="icon-button ghost plain" aria-label={t('widgets.moveAfter', { title })} title={t('widgets.moveAfter', { title })} disabled={last} onClick={() => onMove(1)}>
            <Icon name="chevronRight" size={16} />
          </button>
        </span>
      </footer>
    </article>
  );
}

function WidgetMessage({ widget, appName, onConsent, onLaunch }: { widget: WidgetView; appName: string; onConsent: (state: ConsentState) => void; onLaunch: () => void }) {
  const t = useT();
  switch (widget.state) {
    case 'consent-required':
      return (
        <div className="widget-message">
          <p>{t('widgets.state.consent', { name: appName })}</p>
          <div className="settings-actions">
            <button type="button" className="small" data-sound="unlock" onClick={() => onConsent('granted')}>{t('widgets.consent.allow')}</button>
            <button type="button" className="ghost small" onClick={() => onConsent('denied')}>{t('widgets.consent.deny')}</button>
          </div>
        </div>
      );
    case 'denied':
      return (
        <div className="widget-message">
          <p>{t('widgets.state.denied')}</p>
          <button type="button" className="ghost small" data-sound="unlock" onClick={() => onConsent('granted')}>{t('widgets.consent.again')}</button>
        </div>
      );
    case 'offline':
      return (
        <div className="widget-message">
          <p>{t('widgets.state.offline', { name: appName })}</p>
          <button type="button" className="ghost small" data-sound="none" onClick={onLaunch}><Icon name="play" size={15} />{t('widgets.launch', { name: appName })}</button>
        </div>
      );
    case 'loading':
      return <div className="widget-message" aria-busy="true"><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line short" /><span className="visually-hidden">{t('widgets.state.loading')}</span></div>;
    case 'empty':
      return <p className="widget-message">{t('widgets.state.empty')}</p>;
    default:
      return <p className="widget-message">{t('widgets.state.error')}</p>;
  }
}
