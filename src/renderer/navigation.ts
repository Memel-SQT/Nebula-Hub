import type { IconName } from '@nebula/design/react';
import type { Route } from '@shared/route';
import type { TranslationKey } from './i18n';

/** Navigation is typed application state (no router), shared with the main process. */
export type { Route };

export type Section = Exclude<Route['screen'], 'app' | 'docked'>;

export const SECTIONS: ReadonlyArray<{ id: Section; icon: IconName; labelKey: TranslationKey }> = [
  { id: 'home', icon: 'home', labelKey: 'nav.home' },
  { id: 'discover', icon: 'store', labelKey: 'nav.discover' },
  { id: 'my-apps', icon: 'grid', labelKey: 'nav.myApps' },
  { id: 'downloads', icon: 'download', labelKey: 'nav.downloads' },
  { id: 'integrations', icon: 'link', labelKey: 'nav.integrations' },
  { id: 'settings', icon: 'sliders', labelKey: 'nav.settings' },
];

/** The section highlighted in the sidebar for a route (an app page belongs to Discover, an app inside the Hub to Home). */
export function sectionOf(route: Route): Section {
  if (route.screen === 'app') return 'discover';
  if (route.screen === 'docked') return 'home';
  return route.screen;
}
