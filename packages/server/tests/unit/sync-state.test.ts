import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SyncState } from '../../src/sync/SyncState.js';
import { SyncManager, type SyncMessage } from '../../src/sync/SyncManager.js';

class MockWebSocket extends EventEmitter {
  readyState = 1;
  sent: SyncMessage[] = [];

  send(payload: string): void {
    this.sent.push(JSON.parse(payload) as SyncMessage);
  }
}

describe('sync state durability and serialization', () => {
  const tempDirs: string[] = [];

  const makeDbPath = () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-deck-sync-test-'));
    tempDirs.push(dir);
    return join(dir, 'sync.db');
  };

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stores workspace UI and queued message slices in sync state', () => {
    const sync = new SyncState(makeDbPath());

    sync.mutate({ type: 'workspaceCreate', workspaceId: 'ws-1', path: '/tmp/ws-1' });
    sync.mutate({ type: 'slotCreate', workspaceId: 'ws-1', slotId: 'default' });
    sync.mutate({
      type: 'workspaceUIUpdate',
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws-1',
      rightPaneOpen: true,
      paneTabs: [{ id: 'tab-1', label: 'Chat', layout: { type: 'pane', id: 'pane-1', slotId: 'default' }, focusedPaneId: 'pane-1' }],
      activePaneTab: 'tab-1',
    });
    sync.mutate({
      type: 'queuedMessagesUpdate',
      workspaceId: 'ws-1',
      slotId: 'default',
      queuedMessages: {
        steering: ['focus on tests'],
        followUp: ['then update docs'],
      },
    });

    const ws = sync.getWorkspaceState('ws-1');
    expect(ws).toBeDefined();
    expect(ws?.rightPaneOpen).toBe(true);
    expect(ws?.activePaneTab).toBe('tab-1');
    expect(ws?.slots.get('default')?.queuedMessages).toEqual({
      steering: ['focus on tests'],
      followUp: ['then update docs'],
    });

    sync.dispose();
  });

  it('serializes slot maps in snapshot payloads for reconnect clients', async () => {
    const manager = new SyncManager(makeDbPath());

    manager.mutate({ type: 'workspaceCreate', workspaceId: 'ws-1', path: '/tmp/ws-1' });
    manager.mutate({ type: 'slotCreate', workspaceId: 'ws-1', slotId: 'default' });
    manager.mutate({
      type: 'queuedMessagesUpdate',
      workspaceId: 'ws-1',
      slotId: 'default',
      queuedMessages: { steering: ['a'], followUp: ['b'] },
    });

    const ws = new MockWebSocket();
    const clientId = manager.registerClient(ws as unknown as import('ws').WebSocket, 'ws-1');

    await manager.sendInitialSync(clientId);

    const snapshot = ws.sent.find((msg) => msg.type === 'snapshot');
    expect(snapshot).toBeDefined();
    const state = snapshot?.state as { slots?: Record<string, { queuedMessages?: { steering?: string[]; followUp?: string[] } }> };
    expect(state?.slots?.default).toBeDefined();
    expect(state.slots?.default?.queuedMessages?.steering).toEqual(['a']);
    expect(state.slots?.default?.queuedMessages?.followUp).toEqual(['b']);

    manager.dispose();
  });
});
