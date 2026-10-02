import type { hub as fr } from '../fr/hub';

export const hub: Record<keyof typeof fr, string> = {
  'home.eyebrow': 'Your Nebula space',
  'home.title': 'My Nebula apps',
  'home.sync': 'Last sync',
  'home.syncNever': 'Never',
  'home.card.family': 'Family apps',
  'home.card.installed': 'Installed',
  'home.card.updates': 'Updates',
  'home.card.link': 'Nebula Link',
  'home.card.unknown': '—',
  'home.card.linkApps': '{count} connected app(s)',
  'home.card.linkOffline': 'Offline',
  'home.launcher.eyebrow': 'Launcher',
  'home.launcher.title': 'Your apps, one click away',
  'home.launcher.count': '{count} apps',
  'home.launcher.details': 'See details',
  'home.empty.title': 'No Nebula app is installed yet',
  'home.empty.body': 'Nebula Hub launches, installs and updates your Nebula apps. Each one still works on its own, with or without the Hub.',
  'home.empty.action': 'Discover the apps',
  'home.error': 'Unable to load the home screen.',
};
