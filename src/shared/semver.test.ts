import { compareSemver, isNewerVersion, parseSemver } from './semver';

describe('parseSemver', () => {
  it.each(['0.1.36', '1.1.3', 'v2.0.0', '1.0.0-beta.2', '1.0.0+build.5', '10.20.30-rc.1+meta'])('accepts %s', (value) => {
    expect(parseSemver(value)).not.toBeNull();
  });

  it.each(['', '1', '1.2', '1.2.3.4', '01.2.3', '1.2.3-01', '1.2.3-', 'latest', 'v', ' 1.2.3x', null, 42, '1.2.3-é'])('rejects %p', (value) => {
    expect(parseSemver(value)).toBeNull();
  });
});

describe('compareSemver', () => {
  it('orders the numeric parts numerically, not as text', () => {
    expect(compareSemver('0.1.36', '0.1.35')).toBe(1);
    expect(compareSemver('0.1.9', '0.1.10')).toBe(-1);
    expect(compareSemver('1.10.0', '1.9.9')).toBe(1);
    expect(compareSemver('v1.1.3', '1.1.3')).toBe(0);
  });

  it('follows the semver pre-release precedence', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    for (let index = 1; index < ordered.length; index += 1) {
      expect(compareSemver(ordered[index], ordered[index - 1])).toBe(1);
      expect(compareSemver(ordered[index - 1], ordered[index])).toBe(-1);
    }
  });

  it('ignores build metadata', () => {
    expect(compareSemver('1.0.0+a', '1.0.0+b')).toBe(0);
  });

  it('throws on an invalid version', () => {
    expect(() => compareSemver('1.0', '1.0.0')).toThrow('ERR_INVALID_VERSION');
  });
});

describe('isNewerVersion', () => {
  it('is strictly greater only', () => {
    expect(isNewerVersion('0.1.36', '0.1.35')).toBe(true);
    expect(isNewerVersion('0.1.35', '0.1.35')).toBe(false);
    expect(isNewerVersion('0.1.35', '0.1.36')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
  });
});
