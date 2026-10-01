import type { HubDatabase } from '../db';
import { pairKey, type ConsentState } from '../../shared/consent';

/**
 * Persistent side of Nebula Link (docs/NEBULA_LINK.md § 6, § 12) in `store.sqlite`:
 * - consents per pair, archived (not deleted) when an app is uninstalled, restored when it comes
 *   back;
 * - the exchange journal (who, what, when, outcome, size — never the content), written in small
 *   batches because every write of `store.sqlite` rewrites the whole file;
 * - the activity center's notifications (30 days, public and private, erasable).
 */
export type AuditOutcome = 'delivered' | 'consent-required' | 'denied' | 'invalid' | 'error' | 'timeout' | 'offline';

export interface AuditEntry {
  at: string;
  consumer: string;
  provider: string;
  capability: string;
  kind: string;
  outcome: AuditOutcome;
  bytes: number;
}

export interface StoredNotification {
  id: number;
  appId: string;
  receivedAt: string;
  notificationId: string | null;
  title: string;
  body: string;
  sensitivity: 'public' | 'private';
  deepLink: string | null;
  category: string | null;
}

export const RETENTION_DAYS = 30;

type ConsentRow = { consumer: string; capability: string; state: string; decided_at: string; archived_at: string | null };

export class LinkStore {
  private consents = new Map<string, { consumer: string; capability: string; state: ConsentState; decidedAt: string }>();
  private auditBuffer: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly db: HubDatabase, private readonly flushDelayMs = 5000) {}

  /** Loads the active consents into memory (they are read on every message). */
  load(): void {
    this.consents.clear();
    for (const row of this.db.all<ConsentRow>('SELECT consumer, capability, state, decided_at, archived_at FROM consents WHERE archived_at IS NULL')) {
      if (row.state === 'granted' || row.state === 'denied') {
        this.consents.set(pairKey(row.consumer, row.capability), { consumer: row.consumer, capability: row.capability, state: row.state, decidedAt: row.decided_at });
      }
    }
  }

  consent(consumer: string, capability: string): ConsentState | null {
    return this.consents.get(pairKey(consumer, capability))?.state ?? null;
  }

  listConsents(): Array<{ consumer: string; capability: string; state: ConsentState; decidedAt: string }> {
    return [...this.consents.values()];
  }

  /** `null` forgets the decision (back to the default: public allowed, private asked). */
  async setConsent(consumer: string, capability: string, state: ConsentState | null, at: string): Promise<void> {
    await this.db.transaction((run) => {
      if (state === null) run('DELETE FROM consents WHERE consumer = ? AND capability = ?', [consumer, capability]);
      else run('INSERT OR REPLACE INTO consents (consumer, capability, state, decided_at, archived_at) VALUES (?, ?, ?, ?, NULL)', [consumer, capability, state, at]);
    });
    if (state === null) this.consents.delete(pairKey(consumer, capability));
    else this.consents.set(pairKey(consumer, capability), { consumer, capability, state, decidedAt: at });
  }

  /** Uninstall: the app's pairs (as consumer or provider) are archived, not deleted (§ 6). */
  async archiveApp(appId: string, prefix: string, at: string): Promise<void> {
    await this.db.transaction((run) => {
      run('UPDATE consents SET archived_at = ? WHERE archived_at IS NULL AND (consumer = ? OR capability LIKE ?)', [at, appId, `${prefix}.%`]);
    });
    this.load();
  }

  /** Reinstall: archived pairs come back. */
  async restoreApp(appId: string, prefix: string): Promise<void> {
    await this.db.transaction((run) => {
      run('UPDATE consents SET archived_at = NULL WHERE archived_at IS NOT NULL AND (consumer = ? OR capability LIKE ?)', [appId, `${prefix}.%`]);
    });
    this.load();
  }

  audit(entry: AuditEntry): void {
    this.auditBuffer.push(entry);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), this.flushDelayMs);
      this.flushTimer.unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const entries = this.auditBuffer;
    this.auditBuffer = [];
    if (!entries.length) return;
    await this.db.transaction((run) => {
      for (const entry of entries) {
        run('INSERT INTO link_audit (at, consumer, provider, capability, kind, outcome, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)', [entry.at, entry.consumer, entry.provider, entry.capability, entry.kind, entry.outcome, entry.bytes]);
      }
    });
  }

  /** Last delivered exchange per pair (the Integrations matrix). Includes what is not flushed yet. */
  lastExchanges(): Map<string, string> {
    const result = new Map<string, string>();
    for (const row of this.db.all<{ consumer: string; capability: string; at: string }>("SELECT consumer, capability, MAX(at) AS at FROM link_audit WHERE outcome = 'delivered' GROUP BY consumer, capability")) {
      result.set(pairKey(row.consumer, row.capability), row.at);
    }
    for (const entry of this.auditBuffer) {
      const key = pairKey(entry.consumer, entry.capability);
      if (entry.outcome === 'delivered' && (result.get(key) ?? '') < entry.at) result.set(key, entry.at);
    }
    return result;
  }

  async addNotification(appId: string, notification: Omit<StoredNotification, 'id' | 'appId' | 'receivedAt'>, at: string): Promise<void> {
    await this.db.transaction((run) => {
      run('INSERT INTO notifications (app_id, received_at, notification_id, title, body, sensitivity, deep_link, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [appId, at, notification.notificationId, notification.title, notification.body, notification.sensitivity, notification.deepLink, notification.category]);
    });
  }

  listNotifications(limit = 200): StoredNotification[] {
    return this.db
      .all<{ id: number; app_id: string; received_at: string; notification_id: string | null; title: string; body: string; sensitivity: string; deep_link: string | null; category: string | null }>(
        'SELECT id, app_id, received_at, notification_id, title, body, sensitivity, deep_link, category FROM notifications ORDER BY id DESC LIMIT ?',
        [limit],
      )
      .map((row) => ({ id: Number(row.id), appId: row.app_id, receivedAt: row.received_at, notificationId: row.notification_id, title: row.title, body: row.body, sensitivity: row.sensitivity === 'private' ? 'private' : 'public', deepLink: row.deep_link, category: row.category }));
  }

  /** Settings → Advanced (ADR-023): erase the whole history, or one app's. */
  async deleteNotifications(appId?: string): Promise<void> {
    await this.db.transaction((run) => {
      if (appId) run('DELETE FROM notifications WHERE app_id = ?', [appId]);
      else run('DELETE FROM notifications');
    });
  }

  /** 30-day retention for the journal and the notifications. */
  async purge(now: Date): Promise<void> {
    const limit = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
    await this.flush();
    await this.db.transaction((run) => {
      run('DELETE FROM link_audit WHERE at < ?', [limit]);
      run('DELETE FROM notifications WHERE received_at < ?', [limit]);
    });
  }
}
