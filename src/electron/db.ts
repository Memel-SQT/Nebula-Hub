import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';
import { writeFileAtomic } from './fsutil';

/**
 * `store.sqlite` in userData (brief §5.3), with sql.js like Nebula Finterest's BudgetStore:
 * every mutation runs in an explicit transaction, then the whole database is exported and
 * written atomically through a promise chain (no interleaved writes, no half-written file).
 *
 * Migrations are additive only (the Hub updates itself over existing data): a new version adds
 * tables or nullable columns, never drops or rewrites. Tables arrive with their milestone.
 */
const MIGRATIONS: string[][] = [
  // 1 — M2: HTTP cache (ETag + last body) and the last catalog whose signature was valid.
  [
    'CREATE TABLE IF NOT EXISTS http_cache (url TEXT PRIMARY KEY, etag TEXT, body BLOB NOT NULL, fetched_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS catalog_cache (id INTEGER PRIMARY KEY CHECK (id = 1), source TEXT NOT NULL, body BLOB NOT NULL, signature TEXT NOT NULL, generated_at TEXT NOT NULL, verified_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export class HubDatabase {
  private database: SqlJsDatabase | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string | null) {}

  static inDirectory(directory: string): HubDatabase {
    return new HubDatabase(path.join(directory, 'store.sqlite'));
  }

  /** In-memory database for tests. */
  static inMemory(): HubDatabase {
    return new HubDatabase(null);
  }

  async initialize(): Promise<void> {
    if (this.database) {
      return;
    }
    const sqlJs = await initSqlJs({
      locateFile: (fileName: string) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), fileName),
    });
    let bytes: Uint8Array | null = null;
    if (this.filePath) {
      try {
        bytes = await fs.readFile(this.filePath);
      } catch {
        bytes = null;
      }
    }
    try {
      this.database = bytes ? new sqlJs.Database(bytes) : new sqlJs.Database();
      this.database.exec('SELECT count(*) FROM sqlite_master');
    } catch {
      // A corrupt cache file is not worth failing over: it only holds caches. Keep a copy for
      // diagnosis and start empty.
      if (this.filePath && bytes) {
        await fs.writeFile(`${this.filePath}.corrupt-${Date.now()}`, bytes).catch(() => undefined);
      }
      this.database = new sqlJs.Database();
    }
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    const database = this.require();
    database.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = database.exec('SELECT version FROM schema_version LIMIT 1');
    const current = row.length ? Number(row[0].values[0][0]) : 0;
    if (current >= SCHEMA_VERSION) {
      return;
    }
    await this.transaction(() => {
      for (let version = current; version < SCHEMA_VERSION; version += 1) {
        for (const statement of MIGRATIONS[version]) {
          database.run(statement);
        }
      }
      database.run('DELETE FROM schema_version');
      database.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    });
  }

  private require(): SqlJsDatabase {
    if (!this.database) {
      throw new Error('ERR_DB_NOT_INITIALIZED');
    }
    return this.database;
  }

  /** Rows as plain objects. */
  all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.require().prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  get<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T | null {
    return this.all<T>(sql, params)[0] ?? null;
  }

  async transaction(action: (run: (sql: string, params?: SqlValue[]) => void) => void): Promise<void> {
    const database = this.require();
    database.run('BEGIN IMMEDIATE');
    try {
      action((sql, params = []) => database.run(sql, params));
      database.run('COMMIT');
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
    // Outside the try (Finterest session #44): after COMMIT there is nothing left to roll back.
    await this.persist();
  }

  private persist(): Promise<void> {
    if (!this.filePath) {
      return Promise.resolve();
    }
    const filePath = this.filePath;
    const run = async () => {
      // Exported when the write starts, so it always carries the latest committed state.
      await writeFileAtomic(filePath, this.require().export());
    };
    const next = this.persistChain.then(run, run);
    this.persistChain = next.catch(() => undefined);
    return next;
  }

  async flush(): Promise<void> {
    await this.persistChain;
  }
}
