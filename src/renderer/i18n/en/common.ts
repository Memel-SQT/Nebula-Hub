import type { common as fr } from '../fr/common';

export const common: Record<keyof typeof fr, string> = {
  'app.name': 'Nebula Hub',
  'app.tagline': 'All your Nebula apps, in one place',
  'nav.home': 'Home',
  'nav.discover': 'Discover',
  'nav.myApps': 'My apps',
  'nav.downloads': 'Downloads',
  'nav.integrations': 'Integrations',
  'nav.settings': 'Settings',
  'nav.sections': 'Sections',
  'nav.launcher': 'Launch an app',
  'nav.launcherEmpty': 'Your installed apps will show up here.',
  'sidebar.local': 'Local, no account',
  'sidebar.localNote': 'Nothing leaves this computer.',
  'sidebar.version': 'Version {version}',
  'state.loading': 'Loading…',
  'state.retry': 'Try again',
  'state.offline.title': 'You are offline',
  'state.offline.body': 'Showing the last known data, synced on {date}.',
  'state.offline.never': 'Nothing could be synced yet.',
  'state.error.title': 'Something went wrong',
};
