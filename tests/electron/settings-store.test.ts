/**
 * @jest-environment node
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SettingsStore } from '../../src/electron/settings-store';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

let directory = '';

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-settings-'));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('starts from the defaults when the file is missing', () => {
    expect(SettingsStore.inDirectory(directory).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a corrupt file and a UTF-8 BOM', async () => {
    const file = path.join(directory, 'settings.json');
    await fs.writeFile(file, '{ not json', 'utf8');
    expect(SettingsStore.inDirectory(directory).load()).toEqual(DEFAULT_SETTINGS);

    await fs.writeFile(file, '﻿{"closeToTray": false}', 'utf8');
    expect(SettingsStore.inDirectory(directory).load().closeToTray).toBe(false);
  });

  it('persists atomically and reloads what it wrote', async () => {
    const store = SettingsStore.inDirectory(directory);
    store.load();
    await store.updateAppearance({ theme: 'glass-dark', accentPreset: 'ember' });
    await store.update({ channel: 'beta' });

    const reloaded = SettingsStore.inDirectory(directory).load();
    expect(reloaded.appearance.theme).toBe('glass-dark');
    expect(reloaded.appearance.accentPreset).toBe('ember');
    expect(reloaded.channel).toBe('beta');
    const leftovers = (await fs.readdir(directory)).filter((name) => name.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });

  it('serializes quick successive writes: the last one wins on disk', async () => {
    const store = SettingsStore.inDirectory(directory);
    store.load();
    await Promise.all(['full', 'reduced', 'off', 'reduced'].map((motion) => store.updateAppearance({ motion: motion as 'full' })));
    expect(SettingsStore.inDirectory(directory).load().appearance.motion).toBe('reduced');
  });
});
