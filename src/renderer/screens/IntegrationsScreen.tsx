import { Icon } from '@nebula/design/react';
import { localize } from '@shared/catalog';
import type { CatalogView } from '@shared/catalog-view';
import type { ConsentState } from '@shared/consent';
import type { LinkCapabilityView, LinkPairView, LinkView } from '@shared/link-view';
import { findEntry } from '../catalog';
import { AppIcon, Panel, SummaryCard } from '../components/Cards';
import { EmptyState, StateView } from '../components/ScreenState';
import { ScreenFrame } from '../components/ScreenFrame';
import { formatDateTime, useLanguage, useT } from '../i18n';
import type { Route } from '../navigation';

const HUB_ID = 'nebula.hub';

/**
 * Integrations (brief § 8.5, § 9.6): the requests waiting for the user, then the matrix
 * app × capability with the state of each pair and the date of its last exchange. Public
 * capabilities are allowed until turned off, private ones wait for a yes (docs/NEBULA_LINK.md § 6).
 */
export function IntegrationsScreen({ link, catalog, onNavigate, onSetConsent, onDenyApp }: {
  link?: LinkView;
  catalog: CatalogView;
  onNavigate: (route: Route) => void;
  onSetConsent?: (consumer: string, capability: string, state: ConsentState | null) => void;
  onDenyApp?: (appId: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const name = (appId: string) => (appId === HUB_ID ? 'Nebula Hub' : findEntry(catalog, appId)?.app.name ?? appId);
  const icon = (appId: string) => findEntry(catalog, appId)?.icon ?? null;
  const capabilityOf = (id: string) => link?.capabilities.find((capability) => capability.id === id);
  const granted = link?.pairs.filter((pair) => pair.state === 'granted').length ?? 0;
  const providers = [...new Set(link?.pairs.map((pair) => pair.provider) ?? [])];
  const connected = new Set(link?.connected.map((entry) => entry.appId) ?? []);

  return (
    <ScreenFrame eyebrow={t('integrations.eyebrow')} title={t('integrations.title')} intro={t('integrations.intro')} labelledBy="integrations-title">
      <div className="summary-grid summary-grid-3">
        <SummaryCard label={t('integrations.card.connected')} value={String(link?.connected.length ?? 0)} icon="link" tone="accent" />
        <SummaryCard label={t('integrations.card.consents')} value={String(granted)} icon="shield" tone="positive" />
        <SummaryCard label={t('integrations.card.status')} value={t(`integrations.state.${link?.state ?? 'starting'}`)} icon="power" tone={link?.state === 'error' ? 'warning' : 'gold'} />
      </div>

      {link && link.pending.length > 0 ? (
        <Panel eyebrow={t('integrations.pending.eyebrow')} title={t('integrations.pending.title')} badge={String(link.pending.length)} labelledBy="integrations-pending" className="pending-panel">
          <ul className="consent-requests">
            {link.pending.map((request) => {
              const capability = capabilityOf(request.capability);
              const title = capability ? localize(capability.title, language) : request.capability;
              return (
                <li key={`${request.consumer}|${request.capability}`} className="consent-request">
                  <span className="consent-request-icon" aria-hidden="true"><Icon name="shield" size={18} /></span>
                  <div className="consent-request-text">
                    <strong>{t('integrations.request', { consumer: name(request.consumer), capability: title, provider: name(capability?.provider ?? '') })}</strong>
                    {capability ? <span>{localize(capability.description, language)}</span> : null}
                  </div>
                  <div className="consent-request-actions">
                    <button type="button" className="small" onClick={() => onSetConsent?.(request.consumer, request.capability, 'granted')}>
                      <Icon name="check" size={15} />{t('integrations.allow')}
                    </button>
                    <button type="button" className="ghost small" onClick={() => onSetConsent?.(request.consumer, request.capability, 'denied')}>
                      {t('integrations.deny')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Panel eyebrow={t('integrations.panel.eyebrow')} title={t('integrations.panel.title')} labelledBy="integrations-panel">
        <StateView
          status={!link || link.state === 'starting' ? 'loading' : link.state === 'error' ? 'error' : providers.length === 0 ? 'empty' : 'ready'}
          errorMessage={t('integrations.error')}
          empty={<EmptyState compact icon="puzzle" title={t('integrations.empty.title')} body={t('integrations.empty.body')} action={{ label: t('integrations.empty.action'), icon: 'grid', onClick: () => onNavigate({ screen: 'my-apps' }) }} />}
        >
          <div className="integration-apps">
            {providers.map((provider) => (
              <section key={provider} className="integration-app" aria-label={name(provider)}>
                <header className="integration-app-head">
                  {provider === HUB_ID ? <span className="app-icon integration-hub-icon" aria-hidden="true"><Icon name="grid" size={18} /></span> : <AppIcon src={icon(provider)} size={34} />}
                  <strong>{name(provider)}</strong>
                  {provider !== HUB_ID ? (
                    <span className={`status-chip ${connected.has(provider) ? 'status-running' : 'status-coming-soon'}`}>
                      {connected.has(provider) ? <span className="status-dot" aria-hidden="true" /> : null}
                      {t(connected.has(provider) ? 'integrations.connected' : 'integrations.notConnected')}
                    </span>
                  ) : null}
                  {provider !== HUB_ID && onDenyApp ? (
                    <button type="button" className="ghost small danger integration-deny-all" onClick={() => onDenyApp(provider)}>
                      {t('integrations.denyAll', { name: name(provider) })}
                    </button>
                  ) : null}
                </header>
                <ul className="integration-pairs">
                  {link!.pairs.filter((pair) => pair.provider === provider).map((pair) => (
                    <PairRow key={`${pair.consumer}|${pair.capability}`} pair={pair} capability={capabilityOf(pair.capability)} consumer={name(pair.consumer)} onSetConsent={onSetConsent} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </StateView>
      </Panel>
    </ScreenFrame>
  );
}

function PairRow({ pair, capability, consumer, onSetConsent }: {
  pair: LinkPairView;
  capability?: LinkCapabilityView;
  consumer: string;
  onSetConsent?: (consumer: string, capability: string, state: ConsentState | null) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const title = capability ? localize(capability.title, language) : pair.capability;
  const on = pair.decision === 'allow';
  return (
    <li className={`integration-pair decision-${pair.decision}`}>
      <div className="integration-pair-main">
        <span className="integration-pair-title">
          <strong>{title}</strong>
          {capability ? <span className="category-chip">{t(`integrations.kind.${capability.kind}`)}</span> : null}
          <span className={`status-chip ${pair.sensitivity === 'private' ? 'status-beta' : ''}`}>{t(`integrations.sensitivity.${pair.sensitivity}`)}</span>
        </span>
        <span className="integration-pair-meta">
          {t('integrations.consumer', { consumer })} · {t(`integrations.decision.${pair.decision}`)} · {pair.lastExchange ? t('integrations.lastExchange', { date: formatDateTime(language, pair.lastExchange) }) : t('integrations.never')}
        </span>
      </div>
      <div className="integration-pair-actions">
        {pair.state !== null && onSetConsent ? (
          <button type="button" className="ghost small" onClick={() => onSetConsent(pair.consumer, pair.capability, null)}>{t('integrations.default')}</button>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('integrations.pairLabel', { consumer, capability: title })}
          className={`switch small-switch ${on ? 'on' : ''}`}
          data-sound="toggle"
          onClick={() => onSetConsent?.(pair.consumer, pair.capability, on ? 'denied' : 'granted')}
        >
          <i aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
