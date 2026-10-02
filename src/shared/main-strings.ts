import type { Language } from '@nebula/design';
import type { HistoryOutcome, OperationKind } from './install-state';

/** The few strings the main process shows itself (tray menu, tooltips, Windows notifications). */
const STRINGS = {
  fr: {
    trayOpen: 'Ouvrir Nebula Hub',
    trayLaunch: 'Lancer {name}',
    trayQuit: 'Quitter',
    trayTooltip: 'Nebula Hub',
    trayTooltipUpdates: 'Nebula Hub — {count} mise(s) à jour',
    trayCheckUpdates: 'Rechercher des mises à jour',
    trayUpdates: 'Mises à jour disponibles ({count})',
    trayActivity: 'Centre d’activité ({count} non lue(s))',
    toastPrivate: 'Nouvelle notification privée : ouvrez le Hub pour la lire.',
    consentTitle: 'Autorisation demandée',
    consentBody: '{name} demande l’accès à « {capability} ». Répondez dans Intégrations.',
    opInstallSuccess: '{name} est installée',
    opUpdateSuccess: '{name} est à jour',
    opRepairSuccess: '{name} a été réparée',
    opUninstallSuccess: '{name} a été désinstallée',
    opSuccessBody: 'Version {version}.',
    opUninstallBody: 'Vous pouvez la réinstaller depuis Découvrir.',
    opFailed: 'Échec de l’opération sur {name}',
    opFailedBody: 'Le détail est dans Téléchargements.',
  },
  en: {
    trayOpen: 'Open Nebula Hub',
    trayLaunch: 'Launch {name}',
    trayQuit: 'Quit',
    trayTooltip: 'Nebula Hub',
    trayTooltipUpdates: 'Nebula Hub — {count} update(s)',
    trayCheckUpdates: 'Check for updates',
    trayUpdates: 'Updates available ({count})',
    trayActivity: 'Activity center ({count} unread)',
    toastPrivate: 'New private notification: open the Hub to read it.',
    consentTitle: 'Permission requested',
    consentBody: '{name} asks for access to “{capability}”. Answer in Integrations.',
    opInstallSuccess: '{name} is installed',
    opUpdateSuccess: '{name} is up to date',
    opRepairSuccess: '{name} was repaired',
    opUninstallSuccess: '{name} was uninstalled',
    opSuccessBody: 'Version {version}.',
    opUninstallBody: 'You can install it again from Discover.',
    opFailed: 'Operation on {name} failed',
    opFailedBody: 'The details are in Downloads.',
  },
} satisfies Record<Language, Record<string, string>>;

export type MainStringKey = keyof (typeof STRINGS)['fr'];

export function mainString(language: Language, key: MainStringKey, params: Record<string, string> = {}): string {
  const template = STRINGS[language][key] ?? STRINGS.fr[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

/** The activity center's entry for a finished operation of the Hub (cancelled ones are not reported). */
export function operationEntry(language: Language, entry: { kind: OperationKind; outcome: HistoryOutcome; version: string }, name: string): { title: string; body: string } | null {
  if (entry.outcome === 'cancelled') return null;
  if (entry.outcome === 'failed') return { title: mainString(language, 'opFailed', { name }), body: mainString(language, 'opFailedBody') };
  const titles: Record<OperationKind, MainStringKey> = { install: 'opInstallSuccess', update: 'opUpdateSuccess', repair: 'opRepairSuccess', uninstall: 'opUninstallSuccess' };
  const body = entry.kind === 'uninstall' ? mainString(language, 'opUninstallBody') : mainString(language, 'opSuccessBody', { version: entry.version });
  return { title: mainString(language, titles[entry.kind], { name }), body };
}
