import fs from 'node:fs';
import path from 'node:path';
import type { NebulaAppearance } from '@nebula/design';
import { DEFAULT_SETTINGS, mergeAppearance, mergeSettings, parseSettings, type HubSettings } from '../shared/settings';
import { writeFileAtomic } from './fsutil';

/**
 * Owns `settings.json` in userData. Reads are synchronous at startup (the preload needs the
 * theme before the first paint); writes are atomic and serialized through a promise chain, so
 * two quick changes can never interleave on disk.
 */
export class SettingsStore {
  private settings: HubSettings = DEFAULT_SETTINGS;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  static inDirectory(directory: string): SettingsStore {
    return new SettingsStore(path.join(directory, 'settings.json'));
  }

  load(): HubSettings {
    try {
      // Strip a UTF-8 BOM: a file re-saved with Notepad starts with one and JSON.parse rejects it.
      const raw = fs.readFileSync(this.filePath, 'utf8').replace(/^﻿/, '');
      this.settings = parseSettings(JSON.parse(raw));
    } catch {
      // Missing or unreadable: start from the defaults; the next change writes a fresh file.
      this.settings = DEFAULT_SETTINGS;
    }
    return this.settings;
  }

  get(): HubSettings {
    return this.settings;
  }

  async updateAppearance(patch: Partial<NebulaAppearance> | unknown): Promise<HubSettings> {
    this.settings = { ...this.settings, appearance: mergeAppearance(this.settings.appearance, patch) };
    await this.persist();
    return this.settings;
  }

  async update(patch: unknown): Promise<HubSettings> {
    this.settings = mergeSettings(this.settings, patch);
    await this.persist();
    return this.settings;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.settings, null, 2);
    const run = this.writeChain.then(() => writeFileAtomic(this.filePath, snapshot));
    // Keep the chain alive after a failed write; the caller still sees the error.
    this.writeChain = run.catch(() => undefined);
    return run;
  }
}
