import { entries } from '../../tests/renderer/fixtures';
import type { CatalogEntry } from './catalog-view';
import { availableHubVersion, HUB_UPDATE_ARGUMENTS, hubEntry, hubUpdateBlocker, isHubUpdating } from './hub-update';
import { FORBIDDEN_ARGUMENT } from './installer-args';

function hub(version: string | null, fileName = 'Nebula-Hub-Setup-0.2.1.exe'): CatalogEntry {
  const entry = hubEntry(entries())!;
  return {
    ...entry,
    release: version ? { version, tag: `v${version}`, name: `Nebula Hub ${version}`, publishedAt: '2026-10-02T18:00:00Z', notes: '', prerelease: false, installer: { fileName, size: 1000, sha512: 'x', url: 'https://github.com/Memel-SQT/Nebula-Hub/releases/download/x' } } : null,
  };
}

describe('Hub update (ADR-029)', () => {
  it('finds the Hub entry by its role', () => {
    expect(hubEntry(entries())?.app.id).toBe('nebula.hub');
  });

  it('offers only a strictly newer release', () => {
    expect(availableHubVersion(hub('0.2.1'), '0.2.0')).toBe('0.2.1');
    expect(availableHubVersion(hub('0.2.0'), '0.2.0')).toBeNull();
    expect(availableHubVersion(hub('0.1.9'), '0.2.0')).toBeNull();
    expect(availableHubVersion(hub(null), '0.2.0')).toBeNull();
    expect(availableHubVersion(undefined, '0.2.0')).toBeNull();
  });

  it('says why the update cannot start', () => {
    expect(hubUpdateBlocker(hub('0.2.1'), '0.2.0', 'idle', true)).toBeNull();
    expect(hubUpdateBlocker(hub('0.2.1'), '0.2.0', 'failed', true)).toBeNull();
    expect(hubUpdateBlocker(hub('0.2.0'), '0.2.0', 'idle', true)).toBe('no-update');
    expect(hubUpdateBlocker(hub('0.2.1', '..\\evil.exe'), '0.2.0', 'idle', true)).toBe('no-installer');
    expect(hubUpdateBlocker(hub('0.2.1'), '0.2.0', 'idle', false)).toBe('not-packaged');
    expect(hubUpdateBlocker(hub('0.2.1'), '0.2.0', 'downloading', true)).toBe('in-progress');
    expect(hubUpdateBlocker(hub('0.2.1'), '0.2.0', 'restarting', true)).toBe('in-progress');
  });

  it('updates like electron-updater and restarts, never deleting data nor choosing a folder (ADR-004)', () => {
    expect(HUB_UPDATE_ARGUMENTS).toEqual(['--updated', '/S', '--force-run']);
    expect(HUB_UPDATE_ARGUMENTS.some((argument) => argument.startsWith(FORBIDDEN_ARGUMENT) || /^\/D=/i.test(argument))).toBe(false);
  });

  it('knows when the update is running', () => {
    expect(['downloading', 'verifying', 'waiting', 'restarting'].every((phase) => isHubUpdating(phase as never))).toBe(true);
    expect(isHubUpdating('idle') || isHubUpdating('failed')).toBe(false);
  });
});
