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
}

/**
 * Orchestrates multiple Pi sessions across different directories
 */
export class SessionOrchestrator extends EventEmitter {
  private workspaces = new Map<string, Workspace>();
  private nextWorkspaceId = 1;

  constructor(private allowedDirectories: string[]) {
    super();
  }

  /**
   * Open a new workspace in the specified directory
   * Multiple workspaces can be opened for the same path (each gets its own session)
   */
  async openWorkspace(path: string): Promise<{
    workspace: WorkspaceInfo;
    state: SessionState;
    messages: ChatMessage[];
  }> {
    // Security check
    if (!isPathAllowed(path, this.allowedDirectories)) {
      throw new Error(`Access denied: ${path} is not within allowed directories`);
    }

    // Create new workspace
    const id = `workspace-${this.nextWorkspaceId++}`;
    const session = new PiSession(path);

    // Subscribe to session events and re-emit with workspaceId
    const unsubscribe = this.subscribeToSession(id, session);

    const workspace: Workspace = {
      id,
      path,
      name: basename(path) || path,
      session,
      unsubscribe,
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
    };
  }

  /**
   * Close a workspace
   */
  closeWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.unsubscribe();
    workspace.session.dispose();
    this.workspaces.delete(workspaceId);
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
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
   * Dispose all workspaces
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
      this.emit('event', scopedEvent);
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
