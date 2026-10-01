import type { IconName } from '@nebula/design/react';
import type { TranslationKey } from './i18n';

/** Navigation is typed application state (no router), as in Nebula Finterest. */
export type Route =
  | { screen: 'home' }
  | { screen: 'discover' }
  | { screen: 'app'; appId: string }
  | { screen: 'my-apps' }
  | { screen: 'downloads' }
  | { screen: 'integrations' }
  | { screen: 'settings' };

export type Section = Exclude<Route['screen'], 'app'>;

export const SECTIONS: ReadonlyArray<{ id: Section; icon: IconName; labelKey: TranslationKey }> = [
  { id: 'home', icon: 'home', labelKey: 'nav.home' },
  { id: 'discover', icon: 'store', labelKey: 'nav.discover' },
  { id: 'my-apps', icon: 'grid', labelKey: 'nav.myApps' },
  { id: 'downloads', icon: 'download', labelKey: 'nav.downloads' },
  { id: 'integrations', icon: 'link', labelKey: 'nav.integrations' },
  { id: 'settings', icon: 'sliders', labelKey: 'nav.settings' },
];

/** The section highlighted in the sidebar for a route (an app page belongs to Discover). */
export function sectionOf(route: Route): Section {
  return route.screen === 'app' ? 'discover' : route.screen;
}
