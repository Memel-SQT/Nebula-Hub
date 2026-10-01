/**
 * @jest-environment node
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HubDatabase, SCHEMA_VERSION } from '../../src/electron/db';

let directory = '';

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-hub-db-'));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe('HubDatabase', () => {
  it('creates the schema and records its version', async () => {
    const db = HubDatabase.inDirectory(directory);
    await db.initialize();
    expect(db.get<{ version: number }>('SELECT version FROM schema_version')?.version).toBe(SCHEMA_VERSION);
    expect(db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name)).toEqual(
      expect.arrayContaining(['catalog_cache', 'http_cache', 'schema_version', 'sync_state']),
    );
  });

  it('persists committed writes and reloads them', async () => {
    const db = HubDatabase.inDirectory(directory);
    await db.initialize();
    await db.transaction((run) => run('INSERT INTO sync_state (key, value) VALUES (?, ?)', ['a', '1']));
    await db.flush();
    const reopened = HubDatabase.inDirectory(directory);
    await reopened.initialize();
    expect(reopened.get<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', ['a'])?.value).toBe('1');
  });

  it('rolls back a failed transaction entirely', async () => {
    const db = HubDatabase.inMemory();
    await db.initialize();
    await expect(db.transaction((run) => {
      run('INSERT INTO sync_state (key, value) VALUES (?, ?)', ['b', '1']);
      run('INSERT INTO missing_table VALUES (1)');
    })).rejects.toThrow();
    expect(db.get('SELECT value FROM sync_state WHERE key = ?', ['b'])).toBeNull();
  });

  it('starts empty, keeping a copy, when the file is corrupt', async () => {
    await fs.writeFile(path.join(directory, 'store.sqlite'), 'not a database');
    const db = HubDatabase.inDirectory(directory);
    await db.initialize();
    expect(db.get<{ version: number }>('SELECT version FROM schema_version')?.version).toBe(SCHEMA_VERSION);
    expect((await fs.readdir(directory)).some((name) => name.startsWith('store.sqlite.corrupt-'))).toBe(true);
  });
});
