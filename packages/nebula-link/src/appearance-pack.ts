import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Appearance packs (docs/NEBULA_LINK.md § 18): extra themes that an installed family app shares with
 * the others. The owner app writes `<id>.json` into `%LOCALAPPDATA%\Nebula Link\appearance\` while
 * it is installed; every app (and the Hub) reads that folder, keeps only the packs whose owner is
 * still installed, and offers their themes next to its own. A pack holds data only (CSS custom
 * property values, display names, a mark drawn as an image): it never carries code, never reaches
 * the network, and anything outside the strict shape below rejects the whole pack.
 */

export interface PackLabel { fr: string; en?: string }

export interface PackTheme {
  /** Prefixed with the pack id (`<pack>-dark`); never one of the built-in themes. */
  id: string;
  scheme: 'dark' | 'light';
  label: PackLabel;
  /** CSS custom properties set on the root element while this theme is active. */
  tokens: Record<string, string>;
  /** Page and ink colors of the native window chrome. */
  chrome: { page: string; ink: string };
}

export interface AppearancePack {
  schema: 1;
  id: string;
  owner: { appId: string; exe: string };
  themes: PackTheme[];
  /** Display names of the family apps while one of the pack's themes is active (by app id). */
  names: Record<string, string>;
  /** The pack's own SVG mark, shown as an image (never inlined in a page) while the pack is active. */
  mark: string | null;
  /** An SVG logo per family app (by app id), in place of its catalog icon while the pack is active. */
  marks: Record<string, string>;
}

export const MAX_PACK_BYTES = 256 * 1024;
const MAX_MARK_BYTES = 32 * 1024;
const PACK_ID = /^[a-z][a-z0-9]{1,20}$/;
const THEME_SUFFIX = /^[a-z][a-z0-9-]{0,20}$/;
const PACK_APP_ID = /^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/;
const TOKEN_NAME = /^--[a-z][a-z0-9-]{0,40}$/;
// Colors, lengths, durations, gradients and color-mix/var expressions only: no url(), quotes,
// semicolons, braces, slashes or escapes, so a value can never leave its own property.
const TOKEN_VALUE = /^[#a-zA-Z0-9 ,.%()-]{1,200}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const BUILT_IN_THEMES = ['nebula-dark', 'nebula-light', 'glass-dark', 'glass-light', 'system'];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
}

function label(value: unknown): PackLabel | null {
  const raw = record(value);
  if (!raw || !text(raw.fr, 40) || (raw.en !== undefined && !text(raw.en, 40))) return null;
  return raw.en === undefined ? { fr: raw.fr } : { fr: raw.fr, en: raw.en as string };
}

// No url(), image(), element() or anything else that could load or reference outside content.
const CSS_FUNCTIONS = new Set(['var', 'calc', 'color-mix', 'rgb', 'rgba', 'hsl', 'hsla', 'linear-gradient', 'radial-gradient']);

function onlyAllowedFunctions(token: string): boolean {
  return [...token.matchAll(/([a-zA-Z-]*)\(/g)].every((match) => CSS_FUNCTIONS.has(match[1].toLowerCase()));
}

function tokens(value: unknown): Record<string, string> | null {
  const raw = record(value);
  if (!raw) return null;
  const entries = Object.entries(raw);
  if (entries.length === 0 || entries.length > 80) return null;
  const result: Record<string, string> = {};
  for (const [name, token] of entries) {
    if (!TOKEN_NAME.test(name) || typeof token !== 'string' || !TOKEN_VALUE.test(token) || !onlyAllowedFunctions(token)) return null;
    result[name] = token;
  }
  return result;
}

function theme(value: unknown, packId: string): PackTheme | null {
  const raw = record(value);
  if (!raw || typeof raw.id !== 'string') return null;
  const suffix = raw.id.startsWith(`${packId}-`) ? raw.id.slice(packId.length + 1) : '';
  if (!THEME_SUFFIX.test(suffix) || BUILT_IN_THEMES.includes(raw.id)) return null;
  if (raw.scheme !== 'dark' && raw.scheme !== 'light') return null;
  const themeLabel = label(raw.label);
  const themeTokens = tokens(raw.tokens);
  const chrome = record(raw.chrome);
  if (!themeLabel || !themeTokens || !chrome || typeof chrome.page !== 'string' || typeof chrome.ink !== 'string' || !HEX.test(chrome.page) || !HEX.test(chrome.ink)) return null;
  return { id: raw.id, scheme: raw.scheme, label: themeLabel, tokens: themeTokens, chrome: { page: chrome.page, ink: chrome.ink } };
}

function mark(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_MARK_BYTES) return undefined;
  const svg = value.trim();
  if (!/^<svg[\s>]/.test(svg) || !svg.endsWith('</svg>') || /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(svg)) return undefined;
  return svg;
}

/** Strict: anything unexpected in a known field rejects the whole pack (unknown fields are ignored). */
export function parseAppearancePack(value: unknown): AppearancePack | null {
  const raw = record(value);
  if (!raw || raw.schema !== 1 || typeof raw.id !== 'string' || !PACK_ID.test(raw.id)) return null;
  const owner = record(raw.owner);
  if (!owner || typeof owner.appId !== 'string' || !PACK_APP_ID.test(owner.appId)) return null;
  if (typeof owner.exe !== 'string' || owner.exe.length > 260 || !path.win32.isAbsolute(owner.exe) || !/\.exe$/i.test(owner.exe)) return null;
  if (!Array.isArray(raw.themes) || raw.themes.length === 0 || raw.themes.length > 4) return null;
  const themes: PackTheme[] = [];
  for (const candidate of raw.themes) {
    const parsed = theme(candidate, raw.id);
    if (!parsed || themes.some((existing) => existing.id === parsed.id)) return null;
    themes.push(parsed);
  }
  const names: Record<string, string> = {};
  if (raw.names !== undefined) {
    const rawNames = record(raw.names);
    if (!rawNames || Object.keys(rawNames).length > 20) return null;
    for (const [appId, name] of Object.entries(rawNames)) {
      if (!PACK_APP_ID.test(appId) || !text(name, 60)) return null;
      names[appId] = name;
    }
  }
  const packMark = mark(raw.mark);
  if (packMark === undefined) return null;
  const marks: Record<string, string> = {};
  if (raw.marks !== undefined) {
    const rawMarks = record(raw.marks);
    if (!rawMarks || Object.keys(rawMarks).length > 8) return null;
    for (const [appId, svg] of Object.entries(rawMarks)) {
      const parsed = mark(svg);
      if (!PACK_APP_ID.test(appId) || !parsed) return null;
      marks[appId] = parsed;
    }
  }
  return { schema: 1, id: raw.id, owner: { appId: owner.appId, exe: owner.exe }, themes, names, mark: packMark, marks };
}

export function parseAppearancePackBytes(bytes: Buffer | string): AppearancePack | null {
  if (Buffer.byteLength(bytes) > MAX_PACK_BYTES) return null;
  try {
    return parseAppearancePack(JSON.parse(bytes.toString()));
  } catch {
    return null;
  }
}

/** `%LOCALAPPDATA%\Nebula Link\appearance`, next to the session file. */
export function defaultAppearancePackDir(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Nebula Link', 'appearance');
}

export interface ReadPacksOptions {
  directory?: string;
  /** Whether the owner is still installed; defaults to "its executable exists". */
  ownerInstalled?(pack: AppearancePack): boolean;
}

/**
 * The valid packs of installed owners, sorted by id. Never throws: a missing folder, an unreadable
 * or invalid file only means fewer packs (R09: an app never depends on them).
 */
export function readAppearancePacks(options: ReadPacksOptions = {}): AppearancePack[] {
  const directory = options.directory ?? defaultAppearancePackDir();
  const installed = options.ownerInstalled ?? ((pack: AppearancePack) => fs.existsSync(pack.owner.exe));
  let files: string[];
  try {
    files = fs.readdirSync(directory).filter((name) => /^[a-z][a-z0-9]{1,20}\.json$/.test(name)).sort().slice(0, 10);
  } catch {
    return [];
  }
  const packs: AppearancePack[] = [];
  for (const file of files) {
    try {
      const pack = parseAppearancePackBytes(fs.readFileSync(path.join(directory, file)));
      if (pack && `${pack.id}.json` === file && installed(pack)) packs.push(pack);
    } catch {
      // Unreadable: skipped.
    }
  }
  return packs;
}

/** The pack theme with this id among the packs, if any. */
export function findPackTheme(packs: readonly AppearancePack[], themeId: string): { pack: AppearancePack; theme: PackTheme } | null {
  for (const pack of packs) {
    const found = pack.themes.find((candidate) => candidate.id === themeId);
    if (found) return { pack, theme: found };
  }
  return null;
}

/** Writes a pack atomically (temporary file then rename); for the owner app. */
export function writeAppearancePack(pack: AppearancePack, directory = defaultAppearancePackDir()): boolean {
  if (!parseAppearancePack(pack)) return false;
  try {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `${pack.id}.json`);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(pack, null, 2));
    fs.renameSync(temporary, file);
    return true;
  } catch {
    return false;
  }
}

/** Removes the owner's pack (on uninstall, or when the owner stops sharing it). */
export function removeAppearancePack(id: string, directory = defaultAppearancePackDir()): void {
  if (!PACK_ID.test(id)) return;
  try {
    fs.rmSync(path.join(directory, `${id}.json`), { force: true });
  } catch {
    // Already gone or locked: readers check the owner anyway.
  }
}
