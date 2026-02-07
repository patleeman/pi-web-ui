/**
 * SyncManager - Bridges SyncState with WebSocket clients
 * 
 * Handles:
 * - Client connections/disconnections
 * - Broadcasting state changes
 * - Handling client mutations
 * - Reconnection sync (deltas vs snapshots)
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import { SyncState, type StateMutation, type WorkspaceState } from './SyncState.js';

export interface SyncClient {
  id: string;
  ws: WebSocket;
  workspaceId: string;
  lastAckVersion: number;
  connectedAt: number;
}

export interface SyncMessage {
  type: 'sync' | 'mutate' | 'ack' | 'snapshot' | 'delta';
  clientId?: string;
  workspaceId?: string;
  version?: number;
  sinceVersion?: number;
  mutation?: StateMutation;
  state?: unknown;
  deltas?: StateMutation[];
  error?: string;
}

export class SyncManager extends EventEmitter {
  private syncState: SyncState;
  private clients = new Map<string, SyncClient>();
  private clientIdCounter = 0;

  constructor(dbPath: string) {
    super();
    this.syncState = new SyncState(dbPath);
    
    // Listen for state changes and broadcast to clients
    this.syncState.on('stateChanged', ({ workspaceId, version, mutation }) => {
      this.broadcastDelta(workspaceId, version, mutation);
    });
  }

  /**
   * Register a new WebSocket client
   */
  registerClient(ws: WebSocket, workspaceId: string): string {
    const clientId = `client-${++this.clientIdCounter}`;
    
    const client: SyncClient = {
      id: clientId,
      ws,
      workspaceId,
      lastAckVersion: 0,
      connectedAt: Date.now(),
    };
    
    this.clients.set(clientId, client);
    this.syncState.registerClient(clientId, workspaceId);
    
    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as SyncMessage;
        this.handleClientMessage(clientId, message);
      } catch (err) {
        console.error('[SyncManager] Failed to parse client message:', err);
      }
    });
    
    // Handle disconnect
    ws.on('close', () => {
      this.unregisterClient(clientId);
    });
    
    ws.on('error', (err) => {
      console.error(`[SyncManager] Client ${clientId} error:`, err);
      this.unregisterClient(clientId);
    });
    
    return clientId;
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.syncState.removeClient(clientId);
    }
  }

  /**
   * Send initial sync to a client (full state or deltas)
   */
  async sendInitialSync(clientId: string, sinceVersion?: number): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const workspaceState = this.syncState.getWorkspaceState(client.workspaceId);
    if (!workspaceState) {
      this.sendToClient(clientId, { type: 'snapshot', state: null });
      return;
    }
    
    // If no sinceVersion or very old, send full snapshot
    const currentVersion = this.syncState.getGlobalState().version;
    const shouldSendSnapshot = !sinceVersion || (currentVersion - (sinceVersion || 0)) > 50;
    
    if (shouldSendSnapshot) {
      this.sendToClient(clientId, {
        type: 'snapshot',
        version: currentVersion,
        state: this.serializeWorkspaceState(workspaceState),
      });
    } else {
      // Send deltas
      const deltas = this.syncState.getDeltaSince(client.workspaceId, sinceVersion || 0);
      this.sendToClient(clientId, {
        type: 'delta',
        version: currentVersion,
        sinceVersion: sinceVersion || 0,
        deltas,
      });
    }
    
    // Update client's ack version
    client.lastAckVersion = currentVersion;
    this.syncState.clientAck(clientId, currentVersion);
  }

  /**
   * Apply a mutation (from server-side code)
   */
  mutate(mutation: StateMutation): number {
    return this.syncState.mutate(mutation);
  }

  /**
   * Get current workspace state
   */
  getWorkspaceState(workspaceId: string) {
    return this.syncState.getWorkspaceState(workspaceId);
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.syncState.dispose();
    this.clients.clear();
    this.removeAllListeners();
  }

  // ============ Private methods ============

  private handleClientMessage(clientId: string, message: SyncMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    switch (message.type) {
      case 'mutate':
        if (message.mutation) {
          this.syncState.mutate(message.mutation);
        }
        break;
        
      case 'ack':
        if (message.version !== undefined) {
          client.lastAckVersion = message.version;
          this.syncState.clientAck(clientId, message.version);
        }
        break;
        
      case 'sync':
        this.sendInitialSync(clientId, message.sinceVersion);
        break;
    }
  }

  private broadcastDelta(workspaceId: string, version: number, mutation: StateMutation): void {
    const staleClients = this.syncState.getStaleClients(workspaceId, version);
    
    for (const { clientId } of staleClients) {
      const client = this.clients.get(clientId);
      if (client && client.workspaceId === workspaceId) {
        this.sendToClient(clientId, {
          type: 'delta',
          version,
          deltas: [mutation],
        });
      }
    }
  }

  private sendToClient(clientId: string, message: SyncMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    if (client.ws.readyState === 1) { // WebSocket.OPEN
      client.ws.send(JSON.stringify(message));
    }
  }

  private serializeWorkspaceState(state: WorkspaceState): unknown {
    const slots: Record<string, unknown> = {};
    for (const [slotId, slot] of state.slots.entries()) {
      slots[slotId] = {
        ...slot,
        queuedMessages: {
          steering: [...slot.queuedMessages.steering],
          followUp: [...slot.queuedMessages.followUp],
        },
        activeTools: [...slot.activeTools],
        messages: [...slot.messages],
      };
    }

    return {
      ...state,
      slots,
      sessions: [...state.sessions],
      plans: [...state.plans],
      jobs: [...state.jobs],
      activeJobs: [...state.activeJobs],
      paneTabs: [...state.paneTabs],
    };
  }
}
