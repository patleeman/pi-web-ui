import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { WorkspaceManager } from '../../src/workspace-manager.js';
import { SessionOrchestrator } from '../../src/session-orchestrator.js';
import type { SessionEvent } from '@pi-deck/shared';

// Mock SessionOrchestrator
class MockSessionOrchestrator extends EventEmitter {
  private workspaceId: string | null = null;
  private syncIntegration: any = null;
  private slots = new Map<string, {
    state: any;
    messages: any[];
  }>();
  private _isAnySlotActive = false;

  constructor(private path: string) {
    super();
  }

  setWorkspaceId(id: string): void {
    this.workspaceId = id;
  }

  setSyncIntegration(sync: any): void {
    this.syncIntegration = sync;
  }

  async createSlot(slotId: string): Promise<{ state: any; messages: any[] }> {
    const slot = {
      state: {
        sessionId: `session-${slotId}`,
        isStreaming: false,
      },
      messages: [],
    };
    this.slots.set(slotId, slot);
    return slot;
  }

  getState(slotId: string = 'default'): Promise<any> {
    return this.slots.get(slotId)?.state || null;
  }

  getMessages(slotId: string = 'default'): any[] {
    return this.slots.get(slotId)?.messages || [];
  }

  setThinkingLevel(slotId: string, level: string): void {
    const slot = this.slots.get(slotId);
    if (slot) {
      slot.state.thinkingLevel = level;
    }
  }

  isAnySlotActive(): boolean {
    return this._isAnySlotActive;
  }

  setStreaming(active: boolean): void {
    this._isAnySlotActive = active;
  }

  listSlots(): Array<{ slotId: string }> {
    return Array.from(this.slots.keys()).map(slotId => ({ slotId }));
  }

  dispose(): void {
    this.slots.clear();
    this._isAnySlotActive = false;
    this.removeAllListeners();
  }
}

// Mock SyncIntegration
class MockSyncIntegration {
  private workspaces = new Set<string>();
  private slots = new Set<string>();

  registerClient(): string {
    return 'mock-client-1';
  }

  createWorkspace(workspaceId: string, path: string): void {
    this.workspaces.add(workspaceId);
  }

  createSlot(workspaceId: string, slotId: string): void {
    this.slots.add(`${workspaceId}:${slotId}`);
  }

  closeWorkspace(workspaceId: string): void {
    this.workspaces.delete(workspaceId);
  }

  deleteSlot(workspaceId: string, slotId: string): void {
    this.slots.delete(`${workspaceId}:${slotId}`);
  }

  getRegisteredWorkspaces(): string[] {
    return Array.from(this.workspaces);
  }

  getRegisteredSlots(): string[] {
    return Array.from(this.slots);
  }
}

describe('WorkspaceManager - Disconnect/Reconnect Persistence', () => {
  let workspaceManager: WorkspaceManager;
  let syncIntegration: MockSyncIntegration;
  let originalCreateOrchestrator: any;

  beforeEach(() => {
    // Mock SessionOrchestrator constructor
    originalCreateOrchestrator = SessionOrchestrator;
    vi.stubGlobal('SessionOrchestrator', MockSessionOrchestrator as any);

    workspaceManager = new WorkspaceManager();
    syncIntegration = new MockSyncIntegration();
    workspaceManager.setSyncIntegration(syncIntegration as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    workspaceManager.dispose();
  });

  describe('Client Detach (Disconnect) Handling', () => {
    it('keeps workspace alive when last client detaches', async () => {
      // Open workspace with first client
      const result1 = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result1.workspace.id;
      const orchestrator = workspaceManager.getOrchestrator(workspaceId);

      // Verify workspace exists and client is attached
      expect(workspaceManager.listWorkspaces()).toHaveLength(1);
      expect(orchestrator).toBeInstanceOf(MockSessionOrchestrator);

      // Detach the client
      workspaceManager.detachFromWorkspace(workspaceId);

      // CRITICAL: Workspace should still exist
      expect(workspaceManager.listWorkspaces()).toHaveLength(1);
      expect(workspaceManager.getWorkspace(workspaceId)).toBeDefined();
    });

    it('tracks client count correctly', async () => {
      const result1 = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result1.workspace.id;

      // First client
      const ws1 = workspaceManager.getWorkspace(workspaceId);
      expect(ws1?.clientCount).toBe(1);

      // Second client attaches (simulates another browser tab)
      const result2 = await workspaceManager.openWorkspace('/test/project');
      const ws2 = workspaceManager.getWorkspace(workspaceId);
      expect(ws2?.clientCount).toBe(2);

      // First client detaches
      workspaceManager.detachFromWorkspace(workspaceId);
      const ws3 = workspaceManager.getWorkspace(workspaceId);
      expect(ws3?.clientCount).toBe(1);

      // Second client detaches
      workspaceManager.detachFromWorkspace(workspaceId);
      const ws4 = workspaceManager.getWorkspace(workspaceId);
      expect(ws4?.clientCount).toBe(0);

      // Workspace should still exist with 0 clients
      expect(workspaceManager.listWorkspaces()).toHaveLength(1);
    });

    it('buffers events when no clients are connected', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;
      const orchestrator = workspaceManager.getOrchestrator(workspaceId) as MockSessionOrchestrator;

      // Start the agent (simulating activity)
      orchestrator.setStreaming(true);

      // Detach all clients
      workspaceManager.detachFromWorkspace(workspaceId);
      workspaceManager.detachFromWorkspace(workspaceId);

      // Emit some events while no clients are connected
      const event: SessionEvent = {
        type: 'messageStart',
        message: {
          id: 'msg-1',
          role: 'assistant',
          timestamp: Date.now(),
          content: [{ type: 'text', text: '' }],
        },
      };
      orchestrator.emit('event', event);

      // The workspace should have buffered the event
      const ws = workspaceManager.getWorkspace(workspaceId) as any;
      expect(ws.bufferedEvents).toHaveLength(1);
      expect(ws.bufferedEvents[0]).toMatchObject({
        type: 'messageStart',
        workspaceId,
      });
    });

    it('clears buffered events on reattach', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;
      const orchestrator = workspaceManager.getOrchestrator(workspaceId) as MockSessionOrchestrator;

      // Emit some events
      orchestrator.emit('event', { type: 'messageStart' as any, message: {} });
      orchestrator.emit('event', { type: 'messageUpdate' as any, message: {} });

      // Detach client
      workspaceManager.detachFromWorkspace(workspaceId);

      // Emit more events (should be buffered)
      orchestrator.emit('event', { type: 'agentEnd' as any });

      const ws = workspaceManager.getWorkspace(workspaceId) as any;
      expect(ws.bufferedEvents).toHaveLength(3);

      // Reattach client
      const reattachResult = await workspaceManager.openWorkspace('/test/project');
      expect(reattachResult.bufferedEvents).toHaveLength(3);

      // Buffer should be cleared after reattach
      const wsAfter = workspaceManager.getWorkspace(workspaceId) as any;
      expect(wsAfter.bufferedEvents).toHaveLength(0);
    });
  });

  describe('Workspace Close vs Client Detach', () => {
    it('distinguishes between detach and close', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;

      // Detach - workspace should persist
      workspaceManager.detachFromWorkspace(workspaceId);
      expect(workspaceManager.listWorkspaces()).toHaveLength(1);

      // Close - workspace should be removed
      workspaceManager.closeWorkspace(workspaceId);
      expect(workspaceManager.listWorkspaces()).toHaveLength(0);
    });

    it('throws error when closing non-existent workspace', async () => {
      expect(() => {
        workspaceManager.closeWorkspace('non-existent-id');
      }).toThrow('Workspace not found: non-existent-id');
    });
  });

  describe('Streaming Sessions Persist Across Disconnect', () => {
    it('preserves streaming state through disconnect', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;
      const orchestrator = workspaceManager.getOrchestrator(workspaceId) as MockSessionOrchestrator;

      // Start streaming
      orchestrator.setStreaming(true);
      expect(workspaceManager.getActiveWorkspaces()).toHaveLength(1);

      // Disconnect all clients
      workspaceManager.detachFromWorkspace(workspaceId);
      workspaceManager.detachFromWorkspace(workspaceId);

      // Session should still be streaming (server-side)
      expect(workspaceManager.getActiveWorkspaces()).toHaveLength(1);
      expect(orchestrator.isAnySlotActive()).toBe(true);

      // Reattach and verify streaming state
      const reattachResult = await workspaceManager.openWorkspace('/test/project');
      expect(reattachResult.workspace.isActive).toBe(true);
    });
  });

  describe('Sync Integration Persistence', () => {
    it('registers with sync integration on open', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;

      expect(syncIntegration.getRegisteredWorkspaces()).toContain(workspaceId);
      expect(syncIntegration.getRegisteredSlots()).toContain(`${workspaceId}:default`);
    });

    it('removes from sync integration on close', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;

      workspaceManager.closeWorkspace(workspaceId);

      expect(syncIntegration.getRegisteredWorkspaces()).not.toContain(workspaceId);
    });

    it('keeps sync registration on detach', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;

      workspaceManager.detachFromWorkspace(workspaceId);

      // Should still be registered with sync
      expect(syncIntegration.getRegisteredWorkspaces()).toContain(workspaceId);
      expect(syncIntegration.getRegisteredSlots()).toContain(`${workspaceId}:default`);
    });
  });

  describe('Event Buffer Limits', () => {
    it('limits buffered events to prevent memory issues', async () => {
      const result = await workspaceManager.openWorkspace('/test/project');
      const workspaceId = result.workspace.id;
      const orchestrator = workspaceManager.getOrchestrator(workspaceId) as MockSessionOrchestrator;

      // Detach clients
      workspaceManager.detachFromWorkspace(workspaceId);
      workspaceManager.detachFromWorkspace(workspaceId);

      // Emit more than the max buffer size (1000)
      for (let i = 0; i < 1500; i++) {
        orchestrator.emit('event', { type: 'messageStart' as any, message: { id: `msg-${i}` } });
      }

      const ws = workspaceManager.getWorkspace(workspaceId) as any;
      expect(ws.bufferedEvents.length).toBeLessThanOrEqual(1000);
    });
  });
});
