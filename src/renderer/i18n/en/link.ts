import type { link as fr } from '../fr/link';

export const link: Record<keyof typeof fr, string> = {
  'integrations.eyebrow': 'Nebula Link',
  'integrations.title': 'Integrations',
  'integrations.intro': 'Decide what flows between your apps. Nothing leaves this computer.',
  'integrations.card.connected': 'Connected apps',
  'integrations.card.consents': 'Permissions',
  'integrations.card.status': 'Link status',
  'integrations.panel.eyebrow': 'Consent center',
  'integrations.panel.title': 'Who shares what',
  'integrations.empty.title': 'No app connected',
  'integrations.empty.body': 'When a Nebula app connects to the Hub, its integrations and your permissions will show up here.',
  'integrations.empty.action': 'See my apps',
  'integrations.error': 'Unable to load the integrations.',
  'link.offline': 'Link offline',
  'link.online': 'Link active',
};
