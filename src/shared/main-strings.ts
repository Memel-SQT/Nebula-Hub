import type { Language } from '@nebula/design';

/** The few strings the main process shows itself (tray menu, tooltips). */
const STRINGS = {
  fr: { trayOpen: 'Ouvrir Nebula Hub', trayLaunch: 'Lancer {name}', trayQuit: 'Quitter', trayTooltip: 'Nebula Hub', trayTooltipUpdates: 'Nebula Hub — {count} mise(s) à jour', trayCheckUpdates: 'Rechercher des mises à jour', trayUpdates: 'Mises à jour disponibles ({count})' },
  en: { trayOpen: 'Open Nebula Hub', trayLaunch: 'Launch {name}', trayQuit: 'Quit', trayTooltip: 'Nebula Hub', trayTooltipUpdates: 'Nebula Hub — {count} update(s)', trayCheckUpdates: 'Check for updates', trayUpdates: 'Updates available ({count})' },
} satisfies Record<Language, Record<string, string>>;

export type MainStringKey = keyof (typeof STRINGS)['fr'];

export function mainString(language: Language, key: MainStringKey): string {
  return STRINGS[language][key] ?? STRINGS.fr[key];
}
