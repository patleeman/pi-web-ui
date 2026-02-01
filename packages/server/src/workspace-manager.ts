import { EventEmitter } from 'events';
import { basename } from 'path';
import { PiSession } from './pi-session.js';
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
  session: PiSession;
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
      
      const state = await existing.session.getState();
      const messages = existing.session.getMessages();

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
    const session = new PiSession(path);

    // Subscribe to session events
    const unsubscribe = this.subscribeToSession(id, session);

    const workspace: Workspace = {
      id,
      path,
      name: basename(path) || path,
      session,
      unsubscribe,
      clientCount: 1,
      bufferedEvents: [],
      maxBufferedEvents: 1000,
    };

    this.workspaces.set(id, workspace);

    // Initialize the session
    await session.initialize();

    const state = await session.getState();
    const messages = session.getMessages();

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
    workspace.session.dispose();
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
   * Get the Pi session for a workspace
   */
  getSession(workspaceId: string): PiSession {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return workspace.session;
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
   * Get workspaces that are currently active (agent running)
   */
  getActiveWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.workspaces.entries())
      .filter(([_, ws]) => ws.session.isActive())
      .map(([id, ws]) => this.toWorkspaceInfo(id, ws));
  }

  /**
   * Dispose all workspaces (for server shutdown)
   */
  dispose(): void {
    for (const workspace of this.workspaces.values()) {
      workspace.unsubscribe();
      workspace.session.dispose();
    }
    this.workspaces.clear();
  }

  private subscribeToSession(workspaceId: string, session: PiSession): () => void {
    const handler = (event: SessionEvent) => {
      // Add workspaceId to convert SessionEvent to WsServerEvent
      const scopedEvent: WsServerEvent = { ...event, workspaceId } as WsServerEvent;
      
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

    session.on('event', handler);
    return () => session.off('event', handler);
  }

  private toWorkspaceInfo(id: string, workspace: Workspace): WorkspaceInfo {
    return {
      id,
      path: workspace.path,
      name: workspace.name,
      isActive: workspace.session.isActive(),
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
