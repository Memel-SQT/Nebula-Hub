import type { Language } from '@nebula/design';
import clockIcon from '../../catalog/icons/clock.svg';
import finterestIcon from '../../catalog/icons/finterest.svg';
import newsIcon from '../../catalog/icons/news.svg';

/**
 * The Nebula family as known at build time: the initial catalog entries (brief §6.2) and their
 * official marks (copied from each app's public repository into catalog/icons/). From M2 on the
 * signed catalog replaces this list; it then only serves as the offline first-run fallback.
 */
export type AppCategory = 'finance' | 'info' | 'productivity';
export type AppStatus = 'stable' | 'beta' | 'coming-soon';

export interface FamilyApp {
  id: string;
  name: string;
  icon: string;
  category: AppCategory;
  status: AppStatus;
  tagline: Record<Language, string>;
  description: Record<Language, string>;
}

export const FAMILY_APPS: readonly FamilyApp[] = [
  {
    id: 'nebula.finterest',
    name: 'Nebula Finterest',
    icon: finterestIcon,
    category: 'finance',
    status: 'stable',
    tagline: { fr: 'Votre budget, simplement', en: 'Your budget, simply' },
    description: {
      fr: 'Budget mensuel personnel, 100 % local et hors ligne : plusieurs comptes protégés par un code, calendrier des prélèvements et des achats, prêts, sauvegarde avant désinstallation.',
      en: 'A personal monthly budget, 100% local and offline: several PIN-protected accounts, a calendar of charges and purchases, loans, and a backup before uninstalling.',
    },
  },
  {
    id: 'nebula.clock',
    name: 'Nebula Clock',
    icon: clockIcon,
    category: 'productivity',
    status: 'stable',
    tagline: { fr: 'Le Pomodoro sans compte', en: 'Pomodoro, no account' },
    description: {
      fr: 'Minuteur Pomodoro avec tâches, statistiques, séries et ambiances sonores. Toutes les données restent sur l’appareil.',
      en: 'A Pomodoro timer with tasks, statistics, streaks and ambient sounds. All data stays on the device.',
    },
  },
  {
    id: 'nebula.news',
    name: 'Nebula News',
    icon: newsIcon,
    category: 'info',
    status: 'coming-soon',
    tagline: { fr: 'Le briefing du jour', en: 'Today’s briefing' },
    description: {
      fr: 'Briefing quotidien de l’actualité mondiale, agrégé depuis des flux RSS français et anglais, résumé et classé par importance. Fonctionne sans aucune clé d’API.',
      en: 'A daily briefing of world news, aggregated from French and English RSS feeds, summarized and ranked by importance. Works without any API key.',
    },
  },
];

export function findFamilyApp(id: string): FamilyApp | undefined {
  return FAMILY_APPS.find((app) => app.id === id);
}
