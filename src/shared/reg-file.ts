/**
 * Parser for the `.reg` files written by `reg.exe export` (ADR-003): UTF-16LE text, locale
 * independent, unlike `reg query` whose redirected output uses the OEM code page. Handles the
 * value types the Hub reads (REG_SZ, REG_EXPAND_SZ as `hex(2)`, REG_DWORD) and skips the others
 * without failing. Value names are case-insensitive, like the registry.
 */
export type RegValue =
  | { type: 'sz' | 'expand_sz'; value: string }
  | { type: 'dword'; value: number }
  | { type: 'multi_sz'; value: string[] }
  | { type: 'binary' | 'qword' | 'other'; value: number[] };

export interface RegKey {
  /** Full path as written by reg.exe, e.g. `HKEY_CURRENT_USER\Software\…`. */
  path: string;
  /** Lower-cased value name → value; the default value is `''`. */
  values: Map<string, RegValue>;
}

/** Decodes a reg.exe export file: UTF-16LE with BOM (UTF-8 accepted for fixtures). */
export function decodeRegFile(bytes: Uint8Array): string {
  // Main process only (Buffer): the renderer never reads registry files.
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^﻿/, '');
}

/** Reads a quoted .reg string starting at `start` (on the opening quote). */
function readQuoted(line: string, start: number): { text: string; end: number } | null {
  let text = '';
  for (let index = start + 1; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\' && index + 1 < line.length) {
      text += line[index + 1];
      index += 1;
    } else if (char === '"') {
      return { text, end: index + 1 };
    } else {
      text += char;
    }
  }
  return null;
}

function hexBytes(list: string): number[] {
  const trimmed = list.trim();
  if (!trimmed) return [];
  return trimmed.split(',').map((part) => parseInt(part.trim(), 16)).filter((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

function utf16(bytes: number[]): string {
  const units: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    units.push(bytes[index] | (bytes[index + 1] << 8));
  }
  return String.fromCharCode(...units);
}

function parseData(data: string): RegValue | null {
  if (data.startsWith('"')) {
    const quoted = readQuoted(data, 0);
    return quoted ? { type: 'sz', value: quoted.text } : null;
  }
  const dword = /^dword:([0-9a-f]{8})$/i.exec(data);
  if (dword) return { type: 'dword', value: parseInt(dword[1], 16) };
  const hex = /^hex(?:\(([0-9a-f]+)\))?:(.*)$/i.exec(data);
  if (hex) {
    const bytes = hexBytes(hex[2]);
    const kind = (hex[1] ?? '').toLowerCase();
    if (kind === '2') return { type: 'expand_sz', value: utf16(bytes).replace(/\0+$/, '') };
    if (kind === '7') return { type: 'multi_sz', value: utf16(bytes).split('\0').filter(Boolean) };
    if (kind === '') return { type: 'binary', value: bytes };
    if (kind === 'b') return { type: 'qword', value: bytes };
    return { type: 'other', value: bytes };
  }
  return null;
}

export function parseRegFile(text: string): RegKey[] {
  // reg.exe wraps long hex lists with a trailing backslash and indents the continuation.
  const lines = text.replace(/^﻿/, '').replace(/\\\r?\n\s*/g, '').split(/\r?\n/);
  const keys: RegKey[] = [];
  let current: RegKey | null = null;
  for (const line of lines) {
    if (!line.trim() || line.startsWith('Windows Registry Editor') || line.startsWith(';')) {
      continue;
    }
    const keyMatch = /^\[(-?)(.+)\]\s*$/.exec(line);
    if (keyMatch) {
      current = keyMatch[1] === '-' ? null : { path: keyMatch[2], values: new Map() };
      if (current) keys.push(current);
      continue;
    }
    if (!current) continue;
    let name: string;
    let rest: number;
    if (line.startsWith('@=')) {
      name = '';
      rest = 2;
    } else if (line.startsWith('"')) {
      const quoted = readQuoted(line, 0);
      if (!quoted || line[quoted.end] !== '=') continue;
      name = quoted.text;
      rest = quoted.end + 1;
    } else {
      continue;
    }
    const value = parseData(line.slice(rest).trim());
    if (value) current.values.set(name.toLowerCase(), value);
  }
  return keys;
}

/** A string value (REG_SZ or REG_EXPAND_SZ), or null. */
export function regString(key: RegKey, name: string): string | null {
  const value = key.values.get(name.toLowerCase());
  return value && (value.type === 'sz' || value.type === 'expand_sz') ? value.value : null;
}

/** Expands `%NAME%` like Windows does for REG_EXPAND_SZ (unknown variables stay as they are). */
export function expandEnvironment(value: string, env: Record<string, string | undefined>): string {
  const lookup = new Map(Object.entries(env).map(([name, content]) => [name.toLowerCase(), content]));
  return value.replace(/%([^%]+)%/g, (match, name: string) => lookup.get(name.toLowerCase()) ?? match);
}
