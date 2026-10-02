import { createContext, useContext } from 'react';
import type { Language } from '@nebula/design';
import { activity as frActivity } from './fr/activity';
import { catalog as frCatalog } from './fr/catalog';
import { data as frData } from './fr/data';
import { common as frCommon } from './fr/common';
import { errors as frErrors } from './fr/errors';
import { hub as frHub } from './fr/hub';
import { install as frInstall } from './fr/install';
import { link as frLink } from './fr/link';
import { settings as frSettings } from './fr/settings';
import { activity as enActivity } from './en/activity';
import { catalog as enCatalog } from './en/catalog';
import { data as enData } from './en/data';
import { common as enCommon } from './en/common';
import { errors as enErrors } from './en/errors';
import { hub as enHub } from './en/hub';
import { install as enInstall } from './en/install';
import { link as enLink } from './en/link';
import { settings as enSettings } from './en/settings';

/**
 * Same API as Nebula Finterest's `i18n.ts` (`translate(language, key, params)`, French as the
 * fallback), with the dictionaries split by domain. Each English file is typed against its
 * French twin, so a missing key fails `tsc`; `i18n.test.ts` checks the parity as well.
 */
export const fr = { ...frCommon, ...frHub, ...frCatalog, ...frInstall, ...frData, ...frLink, ...frActivity, ...frSettings, ...frErrors };
export type TranslationKey = keyof typeof fr;
export const en: Record<TranslationKey, string> = { ...enCommon, ...enHub, ...enCatalog, ...enInstall, ...enData, ...enLink, ...enActivity, ...enSettings, ...enErrors };

const dictionaries: Record<Language, Record<TranslationKey, string>> = { fr, en };

export function translate(language: Language, key: TranslationKey, params?: Record<string, string>): string {
  const template = dictionaries[language]?.[key] ?? fr[key] ?? key;
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(value), template);
}

export function locale(language: Language): string {
  return language === 'en' ? 'en-US' : 'fr-FR';
}

export function formatDateTime(language: Language, value: Date | string | number): string {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** Hour and minute only (a widget refreshed today). */
export function formatTime(language: Language, value: Date | string | number): string {
  return new Intl.DateTimeFormat(locale(language), { timeStyle: 'short' }).format(new Date(value));
}

export function formatBytes(language: Language, bytes: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale(language), { style: 'unit', unit: units[unit], unitDisplay: 'short', maximumFractionDigits: unit < 2 ? 0 : 1 }).format(value);
}

export type Translate = (key: TranslationKey, params?: Record<string, string>) => string;

export const LanguageContext = createContext<Language>('fr');

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

export function useT(): Translate {
  const language = useLanguage();
  return (key, params) => translate(language, key, params);
}

/** A short duration for "time left": seconds under a minute, then minutes, then hours. */
export function formatDuration(language: Language, seconds: number): string {
  const [value, unit] = seconds < 60 ? [Math.max(1, Math.round(seconds)), 'second'] : seconds < 3600 ? [Math.round(seconds / 60), 'minute'] : [Math.round(seconds / 360) / 10, 'hour'];
  return new Intl.NumberFormat(locale(language), { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(language: Language, ratio: number): string {
  return new Intl.NumberFormat(locale(language), { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}
