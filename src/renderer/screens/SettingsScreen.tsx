import type { CSSProperties } from 'react';
import {
  ACCENT_PRESETS,
  BACKGROUNDS,
  DEFAULT_NEBULA_APPEARANCE,
  isGlassTheme,
  MOTIONS,
  playSound,
  THEMES,
  type BackgroundEffect,
  type Language,
  type NebulaAppearance,
  type ResolvedTheme,
} from '@nebula/design';
import { Icon, type IconName } from '@nebula/design/react';
import { ScreenFrame } from '../components/ScreenFrame';
import { useT } from '../i18n';
import type { HubSettings, SettingsPatch } from '@shared/settings';

const BACKGROUND_ICONS: Record<BackgroundEffect, IconName> = {
  glow: 'sparkles',
  aurora: 'droplet',
  stars: 'moon',
  particles: 'layers',
  waves: 'bolt',
  none: 'close',
};

const LANGUAGE_LABELS: Record<Language, string> = { fr: 'Français', en: 'English' };

/**
 * Settings. The appearance block reproduces Nebula Finterest v0.1.36 `SettingsPanel.tsx`
 * (same controls, same order, same sounds): theme as a segmented control, accent swatches
 * plus two color pickers in custom mode, background preview tiles, 3-step motion control,
 * sound switch, volume and test, and "reset appearance". Every change applies immediately,
 * with no Save button. Sources, channel, notifications, backups (ADR-016) and updates of the
 * Hub itself are added by later milestones.
 */
export function SettingsScreen({ settings, resolvedTheme, version, onAppearanceChange, onSettingsChange }: {
  settings: HubSettings;
  resolvedTheme: ResolvedTheme;
  version: string;
  onAppearanceChange: (patch: Partial<NebulaAppearance>) => void;
  onSettingsChange: (patch: SettingsPatch) => void;
}) {
  const t = useT();
  const appearance = settings.appearance;

  return (
    <ScreenFrame eyebrow={t('settings.eyebrow')} title={t('settings.title')} intro={t('settings.intro')} labelledBy="settings-title">
      <div className="settings-panel nebula-surface">
        <div className="settings-section">
          <h2><Icon name="palette" size={15} />{t('settings.appearance')}</h2>

          <p className="settings-label" id="settings-theme-label">{t('settings.theme')}</p>
          <div className="segmented" role="radiogroup" aria-labelledby="settings-theme-label">
            {THEMES.map((theme) => (
              <button key={theme} type="button" role="radio" aria-checked={appearance.theme === theme} className={appearance.theme === theme ? 'active' : ''} data-sound="toggle" onClick={() => onAppearanceChange({ theme })}>
                {t(`theme.${theme}`)}
              </button>
            ))}
          </div>
          {isGlassTheme(resolvedTheme) && appearance.background !== 'aurora' ? (
            <small className="path-note settings-hint"><Icon name="info" size={14} />{t('settings.glassHint')}</small>
          ) : null}

          <p className="settings-label" id="settings-language-label">{t('settings.language')}</p>
          <div className="segmented" role="radiogroup" aria-labelledby="settings-language-label">
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((language) => (
              <button key={language} type="button" role="radio" lang={language} aria-checked={appearance.language === language} className={appearance.language === language ? 'active' : ''} data-sound="toggle" onClick={() => onAppearanceChange({ language })}>
                {LANGUAGE_LABELS[language]}
              </button>
            ))}
          </div>

          <p className="settings-label" id="settings-accent-label">{t('settings.accent')}</p>
          <div className="swatch-row" role="radiogroup" aria-labelledby="settings-accent-label">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={appearance.accentPreset === preset.id}
                className={`swatch ${appearance.accentPreset === preset.id ? 'active' : ''}`}
                style={{ '--swatch-a': preset.secondary, '--swatch-b': preset.primary } as CSSProperties}
                onClick={() => onAppearanceChange({ accentPreset: preset.id })}
                data-sound="toggle"
              >
                <i aria-hidden="true" />
                <span>{t(`accent.${preset.id}`)}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={appearance.accentPreset === 'custom'}
              className={`swatch ${appearance.accentPreset === 'custom' ? 'active' : ''}`}
              style={{ '--swatch-a': appearance.customSecondary, '--swatch-b': appearance.customPrimary } as CSSProperties}
              onClick={() => onAppearanceChange({ accentPreset: 'custom' })}
              data-sound="toggle"
            >
              <i aria-hidden="true" />
              <span>{t('accent.custom')}</span>
            </button>
          </div>
          {appearance.accentPreset === 'custom' ? (
            <div className="settings-fields color-fields">
              <label className="color-field">
                <input type="color" value={appearance.customPrimary} onChange={(event) => onAppearanceChange({ customPrimary: event.target.value })} />
                {t('settings.accentPrimary')}
              </label>
              <label className="color-field">
                <input type="color" value={appearance.customSecondary} onChange={(event) => onAppearanceChange({ customSecondary: event.target.value })} />
                {t('settings.accentSecondary')}
              </label>
            </div>
          ) : null}
        </div>

        <div className="settings-section">
          <h2><Icon name="sparkles" size={15} />{t('settings.effects')}</h2>
          <p className="settings-label" id="settings-background-label">{t('settings.background')}</p>
          <div className="effect-grid" role="radiogroup" aria-labelledby="settings-background-label">
            {BACKGROUNDS.map((background) => (
              <button
                key={background}
                type="button"
                role="radio"
                aria-checked={appearance.background === background}
                className={`effect-tile effect-${background} ${appearance.background === background ? 'active' : ''}`}
                onClick={() => onAppearanceChange({ background })}
                data-sound="toggle"
              >
                <span className="effect-preview" aria-hidden="true"><Icon name={BACKGROUND_ICONS[background]} size={18} /></span>
                <span>{t(`background.${background}`)}</span>
              </button>
            ))}
          </div>
          <p className="settings-label" id="settings-motion-label">{t('settings.motion')}</p>
          <div className="segmented" role="radiogroup" aria-labelledby="settings-motion-label">
            {MOTIONS.map((motion) => (
              <button key={motion} type="button" role="radio" aria-checked={appearance.motion === motion} className={appearance.motion === motion ? 'active' : ''} onClick={() => onAppearanceChange({ motion })} data-sound="toggle">
                {t(`motion.${motion}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h2><Icon name={appearance.soundEnabled ? 'volume' : 'volumeOff'} size={15} />{t('settings.sounds')}</h2>
          <div className="sound-row">
            <button
              type="button"
              role="switch"
              aria-checked={appearance.soundEnabled}
              className={`switch ${appearance.soundEnabled ? 'on' : ''}`}
              data-sound="none"
              onClick={() => {
                const next = !appearance.soundEnabled;
                onAppearanceChange({ soundEnabled: next });
                if (next) playSound('toggle', { force: true });
              }}
            >
              <i aria-hidden="true" />
              <span>{t('settings.soundEnabled')} — {t(appearance.soundEnabled ? 'settings.on' : 'settings.off')}</span>
            </button>
            <label className="range-field">
              {t('settings.soundVolume')}
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={appearance.soundVolume}
                disabled={!appearance.soundEnabled}
                onChange={(event) => onAppearanceChange({ soundVolume: Number(event.target.value) })}
              />
              <b>{appearance.soundVolume}%</b>
            </label>
            <button type="button" className="ghost small" data-sound="none" disabled={!appearance.soundEnabled} onClick={() => playSound('success')}>
              <Icon name="volume" size={15} />{t('settings.soundTest')}
            </button>
          </div>
          <div className="settings-actions settings-reset">
            <button
              type="button"
              className="ghost small"
              data-sound="none"
              onClick={() => onAppearanceChange({ ...DEFAULT_NEBULA_APPEARANCE, theme: 'nebula-dark', language: appearance.language })}
            >
              <Icon name="refresh" size={15} />{t('settings.reset')}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h2><Icon name="tray" size={15} />{t('settings.behavior')}</h2>
          <button
            type="button"
            role="switch"
            aria-checked={settings.closeToTray}
            className={`switch ${settings.closeToTray ? 'on' : ''}`}
            data-sound="toggle"
            onClick={() => onSettingsChange({ closeToTray: !settings.closeToTray })}
          >
            <i aria-hidden="true" />
            <span>{t('settings.closeToTray')}</span>
          </button>
        </div>

        <div className="settings-section">
          <h2><Icon name="info" size={15} />{t('settings.about')}</h2>
          <p className="settings-copy tabular">{t('settings.aboutBody', { version })}</p>
        </div>
      </div>
    </ScreenFrame>
  );
}
