import type { dock as fr } from '../fr/dock';

export const dock: Record<keyof typeof fr, string> = {
  'dock.eyebrow': 'Inside the Hub',
  'dock.openInHub': 'Open inside the Hub',
  'dock.openInHubNamed': 'Open {name} inside the Hub',
  'dock.mode': 'Open {name} inside the Hub rather than in its own window',
  'dock.modeHint': '{name} shows in the Hub’s content area and follows it; the sidebar stays there to switch between apps. The app is the same, and so is its data.',
  'dock.unsupported': 'The Hub mode comes with a next version of {name}: for now, it opens in its own window.',
  'dock.starting': 'Opening {name} inside the Hub…',
  'dock.slow': '{name} did not place itself in the Hub: it stays in its own window. Check that it is up to date, or detach it.',
  'dock.shown': '{name} shows here.',
  'dock.closed': '{name} was closed.',
  'dock.reopen': 'Open {name} again',
  'dock.release': 'Detach to its own window',
  'dock.back': 'Back to Home',
  'dock.failed': '{name} could not open inside the Hub.',
  'dock.areaLabel': 'Area of {name}',
};
