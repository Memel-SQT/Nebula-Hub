/**
 * @jest-environment node
 */
import type { AppearancePack } from '@nebula/link';
import { AppearancePacks, toPackView } from '../../src/electron/appearance-packs';
import type { InstalledView } from '../../src/shared/installed-view';

const PACK: AppearancePack = {
  schema: 1,
  id: 'sample',
  owner: { appId: 'nebula.sample', exe: 'C:\Programs\Sample\Sample.exe' },
  themes: [{ id: 'sample-dark', scheme: 'dark', label: { fr: 'Exemple nuit' }, tokens: { '--page': '#101010' }, chrome: { page: '#101010', ink: '#f0f0f0' } }],
  names: {},
  mark: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  marks: { 'nebula.clock': '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>' },
};

describe('AppearancePacks (spec § 18)', () => {
  it('turns the mark into an image URL and never hands the owner path to the renderer', () => {
    const view = toPackView(PACK);
    expect(view.markUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(JSON.stringify(view)).not.toContain('Sample.exe');
  });

  it('follows the folder and the detection, and only reports real changes', () => {
    let files: AppearancePack[] = [PACK];
    let installed: InstalledView = { state: 'loading', apps: [], detectedAt: null };
    const packs = new AppearancePacks({ read: () => files, installedView: () => installed });
    const changes: number[] = [];
    packs.onChange((view) => changes.push(view.length));
    expect(packs.reload()).toBe(true);
    expect(packs.reload()).toBe(false);
    installed = { state: 'ready', apps: [], detectedAt: '2026-10-05T10:00:00Z' };
    expect(packs.reload()).toBe(true);
    expect(packs.view()).toEqual([]);
    installed = { ...installed, apps: [{ appId: 'nebula.sample', version: '1.0.0', scope: 'user', location: 'C:\Programs\Sample', exeFound: true, running: false }] };
    packs.reload();
    files = [];
    packs.reload();
    expect(changes).toEqual([1, 0, 1, 0]);
  });

  it('survives a failing read', () => {
    const packs = new AppearancePacks({ read: () => { throw new Error('EACCES'); }, installedView: () => ({ state: 'ready', apps: [], detectedAt: null }) });
    expect(packs.reload()).toBe(false);
    expect(packs.view()).toEqual([]);
  });
});
