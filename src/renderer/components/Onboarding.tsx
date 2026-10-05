import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import type { CatalogView } from '@shared/catalog-view';
import type { InstalledView } from '@shared/installed-view';
import type { HubSettings, SettingsPatch } from '@shared/settings';
import { HubLogo } from '../brand/HubMark';
import { useT } from '../i18n';
import { AppIcon } from './Cards';

const STEPS = 3;

/**
 * First launch (brief §9.9): what the Hub is, which apps are already there, then two explained
 * yes/no choices (start with Windows, Windows notifications). Every screen can be skipped, and
 * the choices apply at once (they are ordinary settings, changeable later). Link has no global
 * switch (ADR-023): the third screen says how consent works instead.
 */
export function Onboarding({ catalog, installed, settings, onSettingsChange, onFinish }: {
  catalog: CatalogView;
  installed: InstalledView;
  settings: HubSettings;
  onSettingsChange: (patch: SettingsPatch) => void;
  onFinish: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Each new screen is announced: focus goes to its title.
  useEffect(() => heading.current?.focus(), [step]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onFinish();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const apps = installed.apps
    .map((record) => ({ record, entry: catalog.entries.find((candidate) => candidate.app.id === record.appId) }))
    .filter((pair) => pair.entry && pair.entry.app.role !== 'hub');

  return (
    <div className="dialog-backdrop onboarding-backdrop">
      <div ref={dialog} className="dialog onboarding nebula-surface" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-step" onKeyDown={onKeyDown}>
        <div className="onboarding-top">
          <p id="onboarding-step" className="eyebrow">{t('onboarding.step', { step: String(step), count: String(STEPS) })}</p>
          <button type="button" className="ghost small" onClick={onFinish}>{t('onboarding.skip')}</button>
        </div>
        <ol className="onboarding-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, index) => <li key={index} className={index + 1 <= step ? 'done' : ''} />)}
        </ol>

        {step === 1 ? (
          <div className="onboarding-step" key="welcome">
            <HubLogo size={72} className="onboarding-mark" />
            <h2 id="onboarding-title" ref={heading} tabIndex={-1}>{t('onboarding.welcome.title')}</h2>
            <p>{t('onboarding.welcome.body')}</p>
            <ul className="onboarding-points">
              <Point icon="play">{t('onboarding.welcome.launch')}</Point>
              <Point icon="shield">{t('onboarding.welcome.store')}</Point>
              <Point icon="link">{t('onboarding.welcome.link')}</Point>
            </ul>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboarding-step" key="apps">
            <h2 id="onboarding-title" ref={heading} tabIndex={-1}>{t('onboarding.apps.title')}</h2>
            <p>{t('onboarding.apps.body')}</p>
            {installed.state !== 'ready' ? (
              <p className="panel-empty" aria-busy="true"><Icon name="search" size={18} />{t('onboarding.apps.loading')}</p>
            ) : apps.length === 0 ? (
              <p className="panel-empty"><Icon name="store" size={18} />{t('onboarding.apps.none')}</p>
            ) : (
              <ul className="onboarding-apps">
                {apps.map(({ record, entry }) => (
                  <li key={record.appId}>
                    <AppIcon src={entry!.icon} size={36} />
                    <span><strong>{entry!.app.name}</strong><small className="tabular">{t('onboarding.apps.version', { version: record.version ?? '?' })}</small></span>
                    <Icon name="check" size={16} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="onboarding-step" key="prefs">
            <h2 id="onboarding-title" ref={heading} tabIndex={-1}>{t('onboarding.prefs.title')}</h2>
            <Choice id="onboarding-login" label={t('onboarding.login.label')} body={t('onboarding.login.body')} value={settings.launchAtLogin} onChange={(value) => onSettingsChange({ launchAtLogin: value })} />
            <Choice id="onboarding-notify" label={t('onboarding.notify.label')} body={t('onboarding.notify.body')} value={settings.windowsNotifications} onChange={(value) => onSettingsChange({ windowsNotifications: value })} />
            <p className="dialog-note"><Icon name="link" size={15} />{t('onboarding.link.note')}</p>
          </div>
        ) : null}

        <div className="dialog-actions">
          {step > 1 ? <button type="button" className="ghost" onClick={() => setStep(step - 1)}>{t('onboarding.back')}</button> : null}
          {step < STEPS ? (
            <button type="button" onClick={() => setStep(step + 1)}>{t('onboarding.next')}<Icon name="chevronRight" size={15} /></button>
          ) : (
            <button type="button" data-sound="success" onClick={onFinish}>{t('onboarding.finish')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Point({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <li><span className="onboarding-point-icon" aria-hidden="true"><Icon name={icon} size={17} /></span><span>{children}</span></li>;
}

/** A yes/no choice with its explanation, as a radio group (brief §9.9: "oui/non expliqués"). */
function Choice({ id, label, body, value, onChange }: { id: string; label: string; body: string; value: boolean; onChange: (value: boolean) => void }) {
  const t = useT();
  return (
    <div className="onboarding-choice">
      <div>
        <p className="settings-label" id={`${id}-label`}>{label}</p>
        <p className="onboarding-choice-body" id={`${id}-body`}>{body}</p>
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-body`}>
        {[true, false].map((option) => (
          <button key={String(option)} type="button" role="radio" aria-checked={value === option} className={value === option ? 'active' : ''} data-sound="toggle" onClick={() => onChange(option)}>
            {t(option ? 'onboarding.yes' : 'onboarding.no')}
          </button>
        ))}
      </div>
    </div>
  );
}
