import type { Language } from '@nebula/design';

/** The few strings the main process shows itself (tray menu, tooltips). */
const STRINGS = {
  fr: { trayOpen: 'Ouvrir Nebula Hub', trayQuit: 'Quitter', trayTooltip: 'Nebula Hub' },
  en: { trayOpen: 'Open Nebula Hub', trayQuit: 'Quit', trayTooltip: 'Nebula Hub' },
} satisfies Record<Language, Record<string, string>>;

export type MainStringKey = keyof (typeof STRINGS)['fr'];

export function mainString(language: Language, key: MainStringKey): string {
  return STRINGS[language][key] ?? STRINGS.fr[key];
}
