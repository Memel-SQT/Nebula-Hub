import { isSemver } from './semver';

/**
 * electron-builder's update feed (`latest.yml`), the source of truth for an installer's size
 * and SHA-512 (rule R02). The file is small and machine-written, so a strict parser for its
 * exact subset of YAML (scalars, one `files` list of maps) is used instead of a YAML library:
 * anything unexpected is a refusal, not a guess.
 */
export interface FeedFile {
  url: string;
  /** Base64 SHA-512 of the file (64 bytes). */
  sha512: string;
  size: number;
}

export interface UpdateFeed {
  version: string;
  files: FeedFile[];
  path?: string;
  sha512?: string;
  releaseDate?: string;
}

export const MAX_FEED_BYTES = 64 * 1024;
/** Installers bigger than this are refused outright. */
export const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;

/** A bare file name: no directory, no traversal, no URL. */
export function isSafeFileName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/.test(value)
    && !value.includes('..');
}

export function isSha512Base64(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').length === 64;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

export class FeedError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'FeedError';
  }
}

export function parseUpdateFeed(text: string): UpdateFeed {
  if (text.length > MAX_FEED_BYTES) {
    throw new FeedError('ERR_FEED_TOO_LARGE');
  }
  const top: Record<string, string> = {};
  const files: Array<Record<string, string>> = [];
  let inFiles = false;

  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      continue;
    }
    const item = /^ {2}- ([A-Za-z0-9]+):(.*)$/.exec(rawLine);
    const nested = /^ {4}([A-Za-z0-9]+):(.*)$/.exec(rawLine);
    const scalar = /^([A-Za-z0-9]+):(.*)$/.exec(rawLine);
    if (inFiles && item) {
      files.push({ [item[1]]: unquote(item[2]) });
    } else if (inFiles && nested && files.length > 0) {
      files[files.length - 1][nested[1]] = unquote(nested[2]);
    } else if (scalar) {
      inFiles = scalar[1] === 'files' && scalar[2].trim() === '';
      if (!inFiles) {
        top[scalar[1]] = unquote(scalar[2]);
      }
    } else {
      throw new FeedError('ERR_FEED_SYNTAX');
    }
  }

  if (!isSemver(top.version)) {
    throw new FeedError('ERR_FEED_VERSION');
  }
  if (files.length === 0) {
    throw new FeedError('ERR_FEED_NO_FILES');
  }
  const parsedFiles = files.map((file) => {
    const size = Number(file.size);
    if (!isSafeFileName(file.url) || !isSha512Base64(file.sha512) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_INSTALLER_BYTES) {
      throw new FeedError('ERR_FEED_FILE');
    }
    return { url: file.url, sha512: file.sha512, size };
  });
  if (top.path !== undefined && !isSafeFileName(top.path)) {
    throw new FeedError('ERR_FEED_FILE');
  }
  if (top.sha512 !== undefined && !isSha512Base64(top.sha512)) {
    throw new FeedError('ERR_FEED_FILE');
  }
  return { version: top.version, files: parsedFiles, path: top.path, sha512: top.sha512, releaseDate: top.releaseDate };
}

/**
 * The Windows installer of a release: the feed file whose name is exactly one of the release
 * assets (brief 6.3: asset name and feed `url` must agree), `.exe` only, consistent with the
 * top-level `path`/`sha512` when they are present.
 */
export function selectInstaller(feed: UpdateFeed, assetNames: readonly string[]): FeedFile {
  const candidates = feed.files.filter((file) => file.url.toLowerCase().endsWith('.exe') && assetNames.includes(file.url));
  if (candidates.length !== 1) {
    throw new FeedError(candidates.length === 0 ? 'ERR_FEED_ASSET_MISSING' : 'ERR_FEED_AMBIGUOUS');
  }
  const [file] = candidates;
  if (feed.path === file.url && feed.sha512 && feed.sha512 !== file.sha512) {
    throw new FeedError('ERR_FEED_INCONSISTENT');
  }
  return file;
}
