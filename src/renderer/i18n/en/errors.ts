import type { errors as fr } from '../fr/errors';

export const errors: Record<keyof typeof fr, string> = {
  'error.generic': 'An unexpected error occurred.',
  'error.saveSettings': 'Unable to save this setting.',
};
