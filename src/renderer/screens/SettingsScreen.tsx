import { useState, type CSSProperties } from 'react';
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
import { formatDateTime, useLanguage, useT } from '../i18n';
import { SnapshotRow } from '../components/Cards';
import type { CatalogView } from '@shared/catalog-view';
import type { ActivityItem } from '@shared/activity';
import { HUB_ID } from '@shared/consent';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { familyEntries } from '../catalog';
import { HubUpdatePanel } from '../components/HubUpdate';
import type { HubUpdateView } from '@shared/hub-update';
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
 * with no Save button. The catalog section (read-only sources, channel, last sync, key
 * fingerprint) arrives with M2; start with Windows, notifications and the Advanced section
 * (erase the activity history, ADR-023; show the welcome screens again) with M7.
 */
export function SettingsScreen({ settings, resolvedTheme, version, catalog, activity = [], onAppearanceChange, onSettingsChange, onRefreshCatalog, onPickInstallDirectory, onPickBackupCopyDirectory, onClearActivity, onReplayOnboarding, hubUpdate, onHubUpdate, onCancelHubUpdate }: {
  settings: HubSettings;
  resolvedTheme: ResolvedTheme;
  version: string;
  catalog: CatalogView;
  activity?: ActivityItem[];
  onAppearanceChange: (patch: Partial<NebulaAppearance>) => void;
  onSettingsChange: (patch: SettingsPatch) => void;
  onRefreshCatalog: () => void;
  onPickInstallDirectory?: () => void;
  onPickBackupCopyDirectory?: () => void;
  onClearActivity?: (appId: string | null) => void;
  onReplayOnboarding?: () => void;
  /** The Hub's own update (ADR-029): first section, so the button is always at hand. */
  hubUpdate?: HubUpdateView;
  onHubUpdate?: () => void;
  onCancelHubUpdate?: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const appearance = settings.appearance;
  // Erasing the history is confirmed (R04 spirit): undefined = no dialog, null = everything.
  const [clearing, setClearing] = useState<string | null | undefined>(undefined);
  const nameOf = (appId: string) => (appId === HUB_ID ? t('app.name') : catalog.entries.find((entry) => entry.app.id === appId)?.app.name ?? appId);
  const notifyingApps = [HUB_ID, ...familyEntries(catalog).filter((entry) => entry.app.role !== 'hub').map((entry) => entry.app.id)];
  const historyApps = [...new Set(activity.map((item) => item.appId))];
  const toggleMuted = (appId: string) => onSettingsChange({ mutedApps: settings.mutedApps.includes(appId) ? settings.mutedApps.filter((id) => id !== appId) : [...settings.mutedApps, appId] });

  return (
    <ScreenFrame eyebrow={t('settings.eyebrow')} title={t('settings.title')} intro={t('settings.intro')} labelledBy="settings-title">
      <div className="settings-panel nebula-surface">
        {hubUpdate && onHubUpdate && onCancelHubUpdate ? (
          <HubUpdatePanel view={hubUpdate} refreshing={catalog.refreshing} onCheck={onRefreshCatalog} onUpdate={onHubUpdate} onCancel={onCancelHubUpdate} />
        ) : null}
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
          <button
            type="button"
            role="switch"
            aria-checked={settings.launchAtLogin}
            aria-describedby="settings-login-hint"
            className={`switch ${settings.launchAtLogin ? 'on' : ''}`}
            data-sound="toggle"
            onClick={() => onSettingsChange({ launchAtLogin: !settings.launchAtLogin })}
          >
            <i aria-hidden="true" />
            <span>{t('settings.launchAtLogin')}</span>
          </button>
          <small className="path-note" id="settings-login-hint">{t('settings.launchAtLoginHint')}</small>
          <button
            type="button"
            role="switch"
            aria-checked={settings.keepExtensionsRunning}
            aria-describedby="settings-extensions-hint"
            className={`switch ${settings.keepExtensionsRunning ? 'on' : ''}`}
            data-sound="toggle"
            onClick={() => onSettingsChange({ keepExtensionsRunning: !settings.keepExtensionsRunning })}
          >
            <i aria-hidden="true" />
            <span>{t('settings.keepExtensions')}</span>
          </button>
          <small className="path-note" id="settings-extensions-hint">{t('settings.keepExtensionsHint')}</small>

          <p className="settings-label" id="settings-install-dir-label">{t('settings.installDir')}</p>
          <div className="install-dir" aria-labelledby="settings-install-dir-label" role="group">
            {settings.installDirectory ? <code className="install-dir-path">{settings.installDirectory}</code> : <span className="install-dir-default">{t('settings.installDir.default')}</span>}
            <div className="settings-actions">
              {onPickInstallDirectory ? (
                <button type="button" className="ghost small" onClick={onPickInstallDirectory}>
                  <Icon name="folderSync" size={15} />{t('settings.installDir.choose')}
                </button>
              ) : null}
              {settings.installDirectory ? (
                <button type="button" className="ghost small" onClick={() => onSettingsChange({ installDirectory: null })}>
                  <Icon name="refresh" size={15} />{t('settings.installDir.reset')}
                </button>
              ) : null}
            </div>
          </div>
          <small className="path-note">{t('settings.installDir.hint')}</small>
        </div>

        <div className="settings-section">
          <h2><Icon name="folderSync" size={15} />{t('settings.backups')}</h2>
          <p className="settings-label" id="settings-backup-copy-label">{t('settings.backupCopy')}</p>
          <div className="install-dir" aria-labelledby="settings-backup-copy-label" role="group">
            {settings.backupCopyDirectory ? <code className="install-dir-path">{settings.backupCopyDirectory}</code> : <span className="install-dir-default">{t('settings.backupCopy.none')}</span>}
            <div className="settings-actions">
              {onPickBackupCopyDirectory ? (
                <button type="button" className="ghost small" onClick={onPickBackupCopyDirectory}>
                  <Icon name="folderSync" size={15} />{t('settings.backupCopy.choose')}
                </button>
              ) : null}
              {settings.backupCopyDirectory ? (
                <button type="button" className="ghost small" onClick={() => onSettingsChange({ backupCopyDirectory: null })}>
                  <Icon name="close" size={15} />{t('settings.backupCopy.reset')}
                </button>
              ) : null}
            </div>
          </div>
          <small className="path-note">{t('settings.backupCopy.hint')}</small>
        </div>

        <div className="settings-section">
          <h2><Icon name="store" size={15} />{t('settings.catalog')}</h2>
          <p className="settings-label" id="settings-channel-label">{t('settings.channel')}</p>
          <div className="segmented" role="radiogroup" aria-labelledby="settings-channel-label">
            {(['stable', 'beta'] as const).map((channel) => (
              <button key={channel} type="button" role="radio" aria-checked={settings.channel === channel} className={settings.channel === channel ? 'active' : ''} data-sound="toggle" onClick={() => onSettingsChange({ channel })}>
                {t(`channel.${channel}`)}
              </button>
            ))}
          </div>
          <small className="path-note">{t('settings.channelHint')}</small>
          <div className="settings-facts">
            <SnapshotRow label={t('settings.lastSync')} value={catalog.syncedAt ? formatDateTime(language, catalog.syncedAt) : t('settings.never')} />
            <SnapshotRow label={t('settings.currentSource')} value={catalog.source ? t(`source.${catalog.source}`) : '—'} />
            {catalog.generatedAt ? <SnapshotRow label={t('settings.generatedAt')} value={formatDateTime(language, catalog.generatedAt)} /> : null}
          </div>
          <p className="settings-label">{t('settings.sources')}</p>
          <ol className="source-list">
            {catalog.sources.map((source) => (
              <li key={source.id}>
                <strong>{t(`source.${source.id}`)}</strong>
                {source.url !== 'app' ? <code>{source.url}</code> : null}
              </li>
            ))}
          </ol>
          <p className="settings-label">{t('settings.fingerprint')}</p>
          <code className="fingerprint tabular">{catalog.publicKeyFingerprint}</code>
          <small className="path-note">{t('settings.fingerprintHint')}</small>
          <div className="settings-actions settings-reset">
            <button type="button" className="ghost small" disabled={catalog.refreshing} onClick={onRefreshCatalog}>
              <Icon name="refresh" size={15} className={catalog.refreshing ? 'spin' : undefined} />{t('settings.refreshNow')}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h2><Icon name="bell" size={15} />{t('settings.notifications')}</h2>
          <button
            type="button"
            role="switch"
            aria-checked={settings.windowsNotifications}
            aria-describedby="settings-notify-hint"
            className={`switch ${settings.windowsNotifications ? 'on' : ''}`}
            data-sound="toggle"
            onClick={() => onSettingsChange({ windowsNotifications: !settings.windowsNotifications })}
          >
            <i aria-hidden="true" />
            <span>{t('settings.windowsNotifications')}</span>
          </button>
          <small className="path-note" id="settings-notify-hint">{t('settings.notificationsHint')}</small>
          <p className="settings-label" id="settings-notify-apps">{t('settings.notifyPerApp')}</p>
          <div className="switch-list" role="group" aria-labelledby="settings-notify-apps">
            {notifyingApps.map((appId) => (
              <button
                key={appId}
                type="button"
                role="switch"
                aria-checked={!settings.mutedApps.includes(appId)}
                disabled={!settings.windowsNotifications}
                className={`switch ${settings.mutedApps.includes(appId) ? '' : 'on'}`}
                data-sound="toggle"
                onClick={() => toggleMuted(appId)}
              >
                <i aria-hidden="true" />
                <span>{nameOf(appId)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h2><Icon name="sliders" size={15} />{t('settings.advanced')}</h2>
          <p className="settings-label">{t('settings.activityHistory')}</p>
          <p className="settings-copy">{t('settings.activityCount', { count: String(activity.length) })}</p>
          {onClearActivity && activity.length ? (
            <div className="settings-actions settings-reset">
              <button type="button" className="ghost small danger-text" onClick={() => setClearing(null)}>
                <Icon name="trash" size={15} />{t('settings.clearAll')}
              </button>
              {historyApps.map((appId) => (
                <button key={appId} type="button" className="ghost small" onClick={() => setClearing(appId)}>
                  <Icon name="trash" size={15} />{t('settings.clearApp', { name: nameOf(appId) })}
                </button>
              ))}
            </div>
          ) : null}
          {onReplayOnboarding ? (
            <>
              <p className="settings-label">{t('settings.onboarding')}</p>
              <button type="button" className="ghost small" onClick={onReplayOnboarding}>
                <Icon name="sparkles" size={15} />{t('settings.onboardingReplay')}
              </button>
            </>
          ) : null}
        </div>

        <div className="settings-section">
          <h2><Icon name="info" size={15} />{t('settings.about')}</h2>
          <p className="settings-copy tabular">{t('settings.aboutBody', { version })}</p>
        </div>
      </div>
      {clearing !== undefined && onClearActivity ? (
        <ConfirmDialog
          title={t('settings.clear.title')}
          icon="trash"
          tone="danger"
          confirmLabel={t('settings.clear.confirm')}
          onCancel={() => setClearing(undefined)}
          onConfirm={() => {
            onClearActivity(clearing);
            setClearing(undefined);
          }}
        >
          <p>{clearing === null ? t('settings.clear.bodyAll') : t('settings.clear.bodyApp', { name: nameOf(clearing) })}</p>
        </ConfirmDialog>
      ) : null}
    </ScreenFrame>
  );
}
