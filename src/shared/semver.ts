/**
 * Semantic versions (semver 2.0.0): the Hub compares a release version with the installed
 * `DisplayVersion` (brief 7.5: an update exists only when the release is strictly greater).
 * Build metadata is ignored; pre-release identifiers follow the semver precedence rules.
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
}

const PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseSemver(value: unknown): SemVer | null {
  if (typeof value !== 'string' || value.length > 128) {
    return null;
  }
  const match = PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const numbers = [match[1], match[2], match[3]].map(Number);
  if (numbers.some((part) => !Number.isSafeInteger(part))) {
    return null;
  }
  const prerelease = match[4]
    ? match[4].split('.').map((identifier) => (/^(0|[1-9]\d*)$/.test(identifier) ? Number(identifier) : identifier))
    : [];
  if (match[4] && match[4].split('.').some((identifier) => /^0\d+$/.test(identifier))) {
    return null;
  }
  return { major: numbers[0], minor: numbers[1], patch: numbers[2], prerelease };
}

export function isSemver(value: unknown): value is string {
  return parseSemver(value) !== null;
}

/** -1, 0 or 1. Throws on an invalid version: callers validate first. */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    throw new Error(`ERR_INVALID_VERSION: ${!left ? a : b}`);
  }
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) {
      return left[key] > right[key] ? 1 : -1;
    }
  }
  // A version without pre-release ranks higher than the same version with one.
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const x = left.prerelease[index];
    const y = right.prerelease[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

/** True only when `candidate` is strictly newer than `installed`. */
export function isNewerVersion(candidate: string, installed: string): boolean {
  return compareSemver(candidate, installed) > 0;
}
