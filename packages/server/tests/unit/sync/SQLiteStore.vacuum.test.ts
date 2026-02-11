import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../../../src/sync/SQLiteStore.js';
import { existsSync, unlinkSync } from 'fs';

describe('SQLiteStore.vacuum', () => {
  const testDbPath = '/tmp/test_vacuum_store.db';
  let store: SQLiteStore;

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    store = new SQLiteStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('should delete old deltas beyond keep count per workspace', () => {
    // Insert 150 deltas for workspace "ws1"
    for (let i = 1; i <= 150; i++) {
      store.storeDelta('ws1', i, i - 1, Buffer.from(JSON.stringify({ test: i })));
    }

    // Insert 150 deltas for workspace "ws2"
    for (let i = 1; i <= 150; i++) {
      store.storeDelta('ws2', i, i - 1, Buffer.from(JSON.stringify({ test: i })));
    }

    const db = (store as any).db;
    const deltasBefore = db.prepare('SELECT COUNT(*) as count FROM deltas').get();
    expect(deltasBefore.count).toBe(300);

    // Vacuum with keep 50 deltas per workspace
    store.vacuum(50, 10);

    const deltasAfter = db.prepare('SELECT COUNT(*) as count FROM deltas').get();
    // Should keep 50 per workspace = 100 total
    expect(deltasAfter.count).toBe(100);

    // Verify we kept the latest versions
    const ws1Deltas = db.prepare('SELECT MIN(version) as min, MAX(version) as max FROM deltas WHERE workspace_id = ?').get('ws1');
    expect(ws1Deltas.min).toBe(101); // Oldest should be version 101
    expect(ws1Deltas.max).toBe(150); // Newest should be version 150
  });

  it('should delete old snapshots beyond keep count per workspace', () => {
    // Insert 20 snapshots for ws1
    for (let i = 1; i <= 20; i++) {
      store.storeSnapshot('ws1', i, Buffer.from(JSON.stringify({ snapshot: i })));
    }

    // Insert 20 snapshots for ws2
    for (let i = 1; i <= 20; i++) {
      store.storeSnapshot('ws2', i, Buffer.from(JSON.stringify({ snapshot: i })));
    }

    const db = (store as any).db;
    const snapshotsBefore = db.prepare('SELECT COUNT(*) as count FROM snapshots').get();
    expect(snapshotsBefore.count).toBe(40);

    // Vacuum with keep 5 snapshots per workspace
    store.vacuum(100, 5);

    const snapshotsAfter = db.prepare('SELECT COUNT(*) as count FROM snapshots').get();
    // Should keep 5 per workspace = 10 total
    expect(snapshotsAfter.count).toBe(10);

    // Verify we kept the latest versions
    const ws1Snapshots = db.prepare('SELECT MIN(version) as min, MAX(version) as max FROM snapshots WHERE workspace_id = ?').get('ws1');
    expect(ws1Snapshots.min).toBe(16); // Oldest should be version 16
    expect(ws1Snapshots.max).toBe(20); // Newest should be version 20
  });

  it('should delete old client records', () => {
    const db = (store as any).db;
    const now = Date.now();
    const oldTime = now - (8 * 24 * 60 * 60 * 1000); // 8 days ago

    // Insert a recent client
    db.prepare('INSERT INTO clients (client_id, workspace_id, last_ack_version, connected_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .run('client1', 'ws1', 0, now, now);

    // Insert an old client
    db.prepare('INSERT INTO clients (client_id, workspace_id, last_ack_version, connected_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .run('client2', 'ws1', 0, oldTime, oldTime);

    const clientsBefore = db.prepare('SELECT COUNT(*) as count FROM clients').get();
    expect(clientsBefore.count).toBe(2);

    // Vacuum
    store.vacuum(100, 10);

    const clientsAfter = db.prepare('SELECT COUNT(*) as count FROM clients').get();
    expect(clientsAfter.count).toBe(1);

    const remainingClient = db.prepare('SELECT client_id FROM clients').get();
    expect(remainingClient.client_id).toBe('client1');
  });
});