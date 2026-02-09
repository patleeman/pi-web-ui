import { EventEmitter } from 'events';
import { basename } from 'path';
import { SessionOrchestrator } from './session-orchestrator.js';
import { canonicalizePath } from './config.js';
import type { SyncIntegration } from './sync/index.js';
import type {
  WorkspaceInfo,
  SessionState,
  ChatMessage,
  SessionEvent,
  WsServerEvent,
  ExtensionUIRequest,
  QuestionnaireQuestion,
} from '@pi-deck/shared';

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
  private syncIntegration: SyncIntegration | null = null;
  private openingPaths = new Set<string>();

  constructor() {
    super();
  }

  /**
   * Set the sync integration for state tracking
   */
  setSyncIntegration(sync: SyncIntegration): void {
    this.syncIntegration = sync;
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
    const normalizedPath = canonicalizePath(path);

    // If another request is currently opening this exact path, wait and attach.
    while (this.openingPaths.has(normalizedPath)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Check if workspace already exists for this path
    const existing = this.findWorkspaceByPath(normalizedPath);
    if (existing) {
      existing.clientCount++;

      // Ensure orchestrator has workspace ID and sync integration
      existing.orchestrator.setWorkspaceId(existing.id);
      if (this.syncIntegration) {
        existing.orchestrator.setSyncIntegration(this.syncIntegration);
      }

      // Return buffered events and clear buffer
      const bufferedEvents = [...existing.bufferedEvents];
      existing.bufferedEvents = [];

      // Get state from default slot
      const defaultSlot = await existing.orchestrator.getDefaultSlot();
      const state = await defaultSlot.session.getState();
      const messages = defaultSlot.session.getMessages();

      // Check for pending questionnaire request in the slot (for reconnects)
      if (defaultSlot.pendingQuestionnaireRequest) {
        bufferedEvents.push({
          type: 'questionnaireRequest',
          workspaceId: existing.id,
          sessionSlotId: 'default',
          toolCallId: defaultSlot.pendingQuestionnaireRequest.toolCallId,
          questions: defaultSlot.pendingQuestionnaireRequest.questions,
        });
      }

      return {
        workspace: this.toWorkspaceInfo(existing.id, existing),
        state,
        messages,
        bufferedEvents,
        isExisting: true,
      };
    }

    // Create new workspace (guarded by openingPaths to prevent duplicates)
    this.openingPaths.add(normalizedPath);
    try {
      const id = `workspace-${this.nextWorkspaceId++}`;
      const orchestrator = new SessionOrchestrator(normalizedPath);
      orchestrator.setWorkspaceId(id);
      if (this.syncIntegration) {
        orchestrator.setSyncIntegration(this.syncIntegration);
      }

      // Subscribe to orchestrator events
      const unsubscribe = this.subscribeToOrchestrator(id, orchestrator);

      const workspace: Workspace = {
        id,
        path: normalizedPath,
        name: basename(normalizedPath) || normalizedPath,
        orchestrator,
        unsubscribe,
        clientCount: 1,
        bufferedEvents: [],
        maxBufferedEvents: 1000,
      };

      // Register early so concurrent callers attach to this workspace
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
    } finally {
      this.openingPaths.delete(normalizedPath);
    }
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
    console.log(`[WorkspaceManager] Client detached from ${workspaceId}, ${workspace.clientCount} clients remaining, buffered events: ${workspace.bufferedEvents.length}`);
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

    // Listen for extension UI requests
    const extensionUIHandler = (data: { request: ExtensionUIRequest; sessionSlotId: string }) => {
      const event: WsServerEvent = {
        type: 'extensionUIRequest',
        workspaceId,
        sessionSlotId: data.sessionSlotId,
        request: data.request,
      };
      // Extension UI requests should always be sent (even if buffered events would be dropped)
      // because they need immediate user interaction
      this.emit('event', event);
    };

    // Listen for extension notifications
    const notificationHandler = (data: { message: string; type: 'info' | 'warning' | 'error'; sessionSlotId: string }) => {
      // Could emit as a special event or just log for now
      console.log(`[Extension Notification] [${data.type}] ${data.message}`);
      // TODO: Could add a WsExtensionNotificationEvent type
    };

    // Listen for custom UI events (ctx.ui.custom())
    const customUIStartHandler = (data: { state: import('@pi-deck/shared').CustomUIState; sessionSlotId: string }) => {
      const event: WsServerEvent = {
        type: 'customUIStart',
        workspaceId,
        sessionSlotId: data.sessionSlotId,
        state: data.state,
      };
      this.emit('event', event);
    };

    const customUIUpdateHandler = (data: { sessionId: string; root: import('@pi-deck/shared').CustomUINode; sessionSlotId: string }) => {
      const event: WsServerEvent = {
        type: 'customUIUpdate',
        workspaceId,
        sessionSlotId: data.sessionSlotId,
        sessionId: data.sessionId,
        root: data.root,
      };
      this.emit('event', event);
    };

    const customUICloseHandler = (data: { sessionId: string; sessionSlotId: string }) => {
      const event: WsServerEvent = {
        type: 'customUIClose',
        workspaceId,
        sessionSlotId: data.sessionSlotId,
        sessionId: data.sessionId,
      };
      this.emit('event', event);
    };

    // Listen for native questionnaire requests
    const questionnaireRequestHandler = (data: { toolCallId: string; questions: QuestionnaireQuestion[]; sessionSlotId: string }) => {
      const event: WsServerEvent = {
        type: 'questionnaireRequest',
        workspaceId,
        sessionSlotId: data.sessionSlotId,
        toolCallId: data.toolCallId,
        questions: data.questions,
      };
      const workspace = this.workspaces.get(workspaceId);
      if (workspace) {
        // Always emit the event for immediate delivery
        this.emit('event', event);

        // Also buffer for reconnects if no clients
        if (workspace.clientCount === 0) {
          if (workspace.bufferedEvents.length < workspace.maxBufferedEvents) {
            workspace.bufferedEvents.push(event);
          }
        }

        // Track in sync state for durable reconnects
        if (this.syncIntegration) {
          this.syncIntegration.setPendingQuestionnaire(workspaceId, data.sessionSlotId, data.toolCallId, data.questions);
        }
      }
    };

    orchestrator.on('event', handler);
    orchestrator.on('slotClosed', slotHandler);
    orchestrator.on('extensionUIRequest', extensionUIHandler);
    orchestrator.on('extensionNotification', notificationHandler);
    orchestrator.on('customUIStart', customUIStartHandler);
    orchestrator.on('customUIUpdate', customUIUpdateHandler);
    orchestrator.on('customUIClose', customUICloseHandler);
    orchestrator.on('questionnaireRequest', questionnaireRequestHandler);
    
    return () => {
      orchestrator.off('event', handler);
      orchestrator.off('slotClosed', slotHandler);
      orchestrator.off('extensionUIRequest', extensionUIHandler);
      orchestrator.off('extensionNotification', notificationHandler);
      orchestrator.off('customUIStart', customUIStartHandler);
      orchestrator.off('customUIUpdate', customUIUpdateHandler);
      orchestrator.off('customUIClose', customUICloseHandler);
      orchestrator.off('questionnaireRequest', questionnaireRequestHandler);
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

export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) {
    workspaceManager = new WorkspaceManager();
  }
  return workspaceManager;
}
