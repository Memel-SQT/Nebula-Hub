import type { HubDatabase } from '../db';
import type { FailureReason, HistoryEntry, HistoryOutcome, OperationKind } from '../../shared/install-state';

/** `install_history` (brief §5.3, §9.5): one row per finished operation, newest first. */
export const HISTORY_LIMIT = 200;

type Row = {
  id: number;
  app_id: string;
  kind: string;
  version: string;
  from_version: string | null;
  outcome: string;
  failure: string | null;
  detail: string | null;
  started_at: string;
  finished_at: string;
};

export class InstallHistory {
  constructor(private readonly db: HubDatabase) {}

  async add(entry: Omit<HistoryEntry, 'id'>): Promise<void> {
    await this.db.transaction((run) => {
      run(
        'INSERT INTO install_history (app_id, kind, version, from_version, outcome, failure, detail, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [entry.appId, entry.kind, entry.version, entry.fromVersion, entry.outcome, entry.failure, entry.detail, entry.startedAt, entry.finishedAt],
      );
    });
  }

  list(limit = HISTORY_LIMIT): HistoryEntry[] {
    return this.db
      .all<Row>('SELECT id, app_id, kind, version, from_version, outcome, failure, detail, started_at, finished_at FROM install_history ORDER BY id DESC LIMIT ?', [limit])
      .map((row) => ({
        id: Number(row.id),
        appId: row.app_id,
        kind: row.kind as OperationKind,
        version: row.version,
        fromVersion: row.from_version,
        outcome: row.outcome as HistoryOutcome,
        failure: row.failure as FailureReason | null,
        detail: row.detail,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      }));
  }
}
