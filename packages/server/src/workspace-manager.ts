import { EventEmitter } from 'events';
import { basename } from 'path';
import { SessionOrchestrator } from './session-orchestrator.js';
import { isPathAllowed } from './config.js';
import type {
  WorkspaceInfo,
  SessionState,
  ChatMessage,
  SessionEvent,
  WsServerEvent,
} from '@pi-web-ui/shared';

interface Workspace {
  id: string;
  path: string;
  name: string;
  orchestrator: SessionOrchestrator;
  unsubscribe: () => void;
  /** Connected client count */
  clientCount: number;
  /** Events buffered while no clients connected (during active agent loop) */
  bufferedEvents: WsServerEvent[];
  /** Max events to buffer (prevent memory issues) */
  maxBufferedEvents: number;
}

/**
 * Global workspace manager that persists sessions across WebSocket connections.
 * 
 * Sessions continue running even when all clients disconnect.
 * Clients can reconnect and receive buffered events + current state.
 * 
 * Each workspace contains a SessionOrchestrator that manages multiple
 * concurrent session "slots" (one per pane in the UI).
 */
export class WorkspaceManager extends EventEmitter {
  private workspaces = new Map<string, Workspace>();
  private nextWorkspaceId = 1;

  constructor(private allowedDirectories: string[]) {
    super();
  }

  /**
   * Open or attach to a workspace.
   * If a workspace already exists for this path, attach to it.
   * Otherwise, create a new one.
   */
  async openWorkspace(path: string): Promise<{
    workspace: WorkspaceInfo;
    state: SessionState;
    messages: ChatMessage[];
    bufferedEvents: WsServerEvent[];
    isExisting: boolean;
  }> {
    // Security check
    if (!isPathAllowed(path, this.allowedDirectories)) {
      throw new Error(`Access denied: ${path} is not within allowed directories`);
    }

    // Check if workspace already exists for this path
    const existing = this.findWorkspaceByPath(path);
    if (existing) {
      existing.clientCount++;
      
      // Return buffered events and clear buffer
      const bufferedEvents = [...existing.bufferedEvents];
      existing.bufferedEvents = [];
      
      // Get state from default slot
      const defaultSlot = await existing.orchestrator.getDefaultSlot();
      const state = await defaultSlot.session.getState();
      const messages = defaultSlot.session.getMessages();

      return {
        workspace: this.toWorkspaceInfo(existing.id, existing),
        state,
        messages,
        bufferedEvents,
        isExisting: true,
      };
    }

    // Create new workspace
    const id = `workspace-${this.nextWorkspaceId++}`;
    const orchestrator = new SessionOrchestrator(path);

    // Subscribe to orchestrator events
    const unsubscribe = this.subscribeToOrchestrator(id, orchestrator);

    const workspace: Workspace = {
      id,
      path,
      name: basename(path) || path,
      orchestrator,
      unsubscribe,
      clientCount: 1,
      bufferedEvents: [],
      maxBufferedEvents: 1000,
    };

    this.workspaces.set(id, workspace);

    // Initialize the default slot
    const { state, messages } = await orchestrator.createSlot('default');

    return {
      workspace: this.toWorkspaceInfo(id, workspace),
      state,
      messages,
      bufferedEvents: [],
      isExisting: false,
    };
  }

  /**
   * Detach a client from a workspace.
   * The workspace continues to exist and run.
   */
  detachFromWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return; // Already gone
    }

    workspace.clientCount = Math.max(0, workspace.clientCount - 1);
    
    // Note: We do NOT dispose the workspace here.
    // It continues running even with no clients.
    console.log(`[WorkspaceManager] Client detached from ${workspaceId}, ${workspace.clientCount} clients remaining`);
  }

  /**
   * Explicitly close and dispose a workspace.
   * Use this when the user explicitly closes a workspace tab.
   */
  closeWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.unsubscribe();
    workspace.orchestrator.dispose();
    this.workspaces.delete(workspaceId);
    console.log(`[WorkspaceManager] Workspace ${workspaceId} closed and disposed`);
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Find a workspace by path
   */
  findWorkspaceByPath(path: string): Workspace | undefined {
    for (const workspace of this.workspaces.values()) {
      if (workspace.path === path) {
        return workspace;
      }
    }
    return undefined;
  }

  /**
   * Get the orchestrator for a workspace
   */
  getOrchestrator(workspaceId: string): SessionOrchestrator {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return workspace.orchestrator;
  }

  /**
   * List all open workspaces
   */
  listWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.workspaces.entries()).map(([id, ws]) =>
      this.toWorkspaceInfo(id, ws)
    );
  }

  /**
   * Get workspaces that are currently active (any slot running)
   */
  getActiveWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.workspaces.entries())
      .filter(([_, ws]) => ws.orchestrator.isAnySlotActive())
      .map(([id, ws]) => this.toWorkspaceInfo(id, ws));
  }

  /**
   * Dispose all workspaces (for server shutdown)
   */
  dispose(): void {
    for (const workspace of this.workspaces.values()) {
      workspace.unsubscribe();
      workspace.orchestrator.dispose();
    }
    this.workspaces.clear();
  }

  private subscribeToOrchestrator(workspaceId: string, orchestrator: SessionOrchestrator): () => void {
    const handler = (event: SessionEvent & { sessionSlotId?: string }) => {
      // Add workspaceId to convert SessionEvent to WsServerEvent
      const scopedEvent: WsServerEvent = { 
        ...event, 
        workspaceId,
        sessionSlotId: event.sessionSlotId,
      } as WsServerEvent;
      
      const workspace = this.workspaces.get(workspaceId);
      if (workspace) {
        if (workspace.clientCount > 0) {
          // Clients connected - emit the event
          this.emit('event', scopedEvent);
        } else {
          // No clients - buffer the event
          if (workspace.bufferedEvents.length < workspace.maxBufferedEvents) {
            workspace.bufferedEvents.push(scopedEvent);
          }
          // Also emit so server can log if needed
          this.emit('bufferedEvent', scopedEvent);
        }
      }
    };

    // Listen for slot closed events too
    const slotHandler = (data: { slotId: string }) => {
      const event: WsServerEvent = {
        type: 'sessionSlotClosed',
        workspaceId,
        sessionSlotId: data.slotId,
      };
      this.emit('event', event);
    };

    orchestrator.on('event', handler);
    orchestrator.on('slotClosed', slotHandler);
    
    return () => {
      orchestrator.off('event', handler);
      orchestrator.off('slotClosed', slotHandler);
    };
  }

  private toWorkspaceInfo(id: string, workspace: Workspace): WorkspaceInfo {
    return {
      id,
      path: workspace.path,
      name: workspace.name,
      isActive: workspace.orchestrator.isAnySlotActive(),
      state: null, // State is fetched separately when needed
    };
  }
}

// Singleton instance
let workspaceManager: WorkspaceManager | null = null;

export function getWorkspaceManager(allowedDirectories: string[]): WorkspaceManager {
  if (!workspaceManager) {
    workspaceManager = new WorkspaceManager(allowedDirectories);
  }
  return workspaceManager;
}
