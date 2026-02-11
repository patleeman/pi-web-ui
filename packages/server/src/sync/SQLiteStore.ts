/**
 * SQLite persistence layer for sync state.
 * Stores snapshots, deltas, and client registry.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface StoredSnapshot {
  id: number;
  workspace_id: string;
  version: number;
  state: Buffer;
  timestamp: number;
}

export interface StoredDelta {
  id: number;
  workspace_id: string;
  version: number;
  base_version: number;
  changes: Buffer;
  timestamp: number;
}

export interface StoredClient {
  client_id: string;
  workspace_id: string;
  last_ack_version: number;
  connected_at: number;
  last_seen_at: number;
}

export class SQLiteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initTables();
  }

  private initTables(): void {
    // Snapshots - full state blobs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        state BLOB NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(workspace_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON snapshots(workspace_id, version);
    `);

    // Deltas - incremental changes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deltas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        base_version INTEGER NOT NULL,
        changes BLOB NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(workspace_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_deltas_workspace ON deltas(workspace_id, version);
      CREATE INDEX IF NOT EXISTS idx_deltas_timestamp ON deltas(timestamp);
    `);

    // Clients - connected client registry
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        client_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        last_ack_version INTEGER NOT NULL DEFAULT 0,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);
    `);
  }

  /**
   * Store a full state snapshot
   */
  storeSnapshot(workspaceId: string, version: number, state: Buffer): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (workspace_id, version, state, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(workspaceId, version, state, Date.now());
  }

  /**
   * Get the latest snapshot for a workspace
   */
  getLatestSnapshot(workspaceId: string): StoredSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM snapshots 
      WHERE workspace_id = ? 
      ORDER BY version DESC 
      LIMIT 1
    `);
    return stmt.get(workspaceId) as StoredSnapshot | null;
  }

  /**
   * Get snapshot at specific version
   */
  getSnapshotAtVersion(workspaceId: string, version: number): StoredSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM snapshots 
      WHERE workspace_id = ? AND version = ?
    `);
    return stmt.get(workspaceId, version) as StoredSnapshot | null;
  }

  /**
   * Store a delta (incremental change)
   */
  storeDelta(workspaceId: string, version: number, baseVersion: number, changes: Buffer): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO deltas (workspace_id, version, base_version, changes, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(workspaceId, version, baseVersion, changes, Date.now());
  }

  /**
   * Get deltas for a workspace since a specific version
   */
  getDeltasSince(workspaceId: string, sinceVersion: number): StoredDelta[] {
    const stmt = this.db.prepare(`
      SELECT * FROM deltas 
      WHERE workspace_id = ? AND version > ?
      ORDER BY version ASC
    `);
    return stmt.all(workspaceId, sinceVersion) as StoredDelta[];
  }

  /**
   * Register or update a client
   */
  registerClient(clientId: string, workspaceId: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO clients (client_id, workspace_id, last_ack_version, connected_at, last_seen_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        last_seen_at = excluded.last_seen_at
    `);
    stmt.run(clientId, workspaceId, now, now);
  }

  /**
   * Update client's last acknowledged version
   */
  updateClientAck(clientId: string, version: number): void {
    const stmt = this.db.prepare(`
      UPDATE clients 
      SET last_ack_version = ?, last_seen_at = ?
      WHERE client_id = ?
    `);
    stmt.run(version, Date.now(), clientId);
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const stmt = this.db.prepare(`DELETE FROM clients WHERE client_id = ?`);
    stmt.run(clientId);
  }

  /**
   * Get clients for a workspace
   */
  getWorkspaceClients(workspaceId: string): StoredClient[] {
    const stmt = this.db.prepare(`
      SELECT * FROM clients WHERE workspace_id = ?
    `);
    return stmt.all(workspaceId) as StoredClient[];
  }

  /**
   * Clean up old deltas and snapshots to prevent database bloat
   * - Keep last 100 deltas per workspace
   * - Delete deltas older than 7 days
   * - Keep only last 10 snapshots per workspace
   * - Delete snapshots older than 30 days
   */
  vacuum(keepDeltas: number = 100, keepSnapshots: number = 10, maxDeltaAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxDeltaAgeMs;

    // Delete old deltas per workspace (keep last N)
    this.db.exec(`
      DELETE FROM deltas
      WHERE id IN (
        SELECT id FROM deltas d1
        WHERE (
          SELECT COUNT(*) FROM deltas d2
          WHERE d2.workspace_id = d1.workspace_id
          AND d2.version >= d1.version
        ) > ${keepDeltas}
        OR d1.timestamp < ${cutoffTime}
      )
    `);

    // Delete old snapshots per workspace (keep last N)
    this.db.exec(`
      DELETE FROM snapshots
      WHERE id IN (
        SELECT id FROM snapshots s1
        WHERE (
          SELECT COUNT(*) FROM snapshots s2
          WHERE s2.workspace_id = s1.workspace_id
          AND s2.version >= s1.version
        ) > ${keepSnapshots}
      )
    `);

    // Delete old client records (disconnected > 7 days)
    const clientCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.db.exec(`
      DELETE FROM clients
      WHERE last_seen_at < ${clientCutoff}
    `);

    // Vacuum the database to reclaim space
    this.db.exec('VACUUM');
  }

  /**
   * @deprecated Use vacuum() instead
   */
  vacuumDeltas(keepCount: number = 1000, maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    this.vacuum(keepCount, 10, maxAgeMs);
  }

  /**
   * Get the current version for a workspace
   */
  getCurrentVersion(workspaceId: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(version) as version FROM deltas WHERE workspace_id = ?
    `);
    const result = stmt.get(workspaceId) as { version: number | null };
    return result.version ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
