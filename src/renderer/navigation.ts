import type { IconName } from '@nebula/design/react';
import type { Route } from '@shared/route';
import type { TranslationKey } from './i18n';

/** Navigation is typed application state (no router), shared with the main process. */
export type { Route };

export type Section = Exclude<Route['screen'], 'app' | 'docked'>;

/** Sidebar groups: the user's space, what the Hub manages, and the settings pinned at the bottom. */
export type SectionGroup = 'space' | 'manage' | 'system';

export const SECTIONS: ReadonlyArray<{ id: Section; icon: IconName; labelKey: TranslationKey; group: SectionGroup }> = [
  { id: 'home', icon: 'navHome', labelKey: 'nav.home', group: 'space' },
  { id: 'discover', icon: 'compass', labelKey: 'nav.discover', group: 'space' },
  { id: 'my-apps', icon: 'apps', labelKey: 'nav.myApps', group: 'space' },
  { id: 'downloads', icon: 'downloadTray', labelKey: 'nav.downloads', group: 'manage' },
  { id: 'integrations', icon: 'orbit', labelKey: 'nav.integrations', group: 'manage' },
  { id: 'settings', icon: 'gear', labelKey: 'nav.settings', group: 'system' },
];

/** The section highlighted in the sidebar for a route (an app page belongs to Discover, an app inside the Hub to Home). */
export function sectionOf(route: Route): Section {
  if (route.screen === 'app') return 'discover';
  if (route.screen === 'docked') return 'home';
  return route.screen;
}
