import type { install as fr } from '../fr/install';

export const install: Record<keyof typeof fr, string> = {
  'myApps.eyebrow': 'Library',
  'myApps.title': 'My apps',
  'myApps.panel.eyebrow': 'On this computer',
  'myApps.panel.title': 'Installed apps',
  'myApps.empty.title': 'No installed app detected',
  'myApps.empty.body': 'Nebula apps already on this computer, installed with or without the Hub, are detected automatically.',
  'myApps.empty.action': 'Discover the apps',
  'myApps.error': 'Unable to list the installed apps.',
  'downloads.eyebrow': 'Operations',
  'downloads.title': 'Downloads',
  'downloads.card.active': 'In progress',
  'downloads.card.queued': 'Queued',
  'downloads.card.done': 'Completed',
  'downloads.panel.eyebrow': 'Queue and history',
  'downloads.panel.title': 'Operations',
  'downloads.empty.title': 'No download',
  'downloads.empty.body': 'Installs and updates will show up here, with their progress and history.',
  'downloads.empty.action': 'Discover the apps',
  'downloads.error': 'Unable to load the downloads.',
};
