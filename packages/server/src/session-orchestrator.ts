import { EventEmitter } from 'events';
import { PiSession } from './pi-session.js';
import type {
  ChatMessage,
  SessionState,
  SessionEvent,
  SessionInfo,
  ModelInfo,
  SlashCommand,
  StartupInfo,
  ThinkingLevel,
  ImageAttachment,
  SessionStats,
  BashResult,
  SessionTreeNode,
  ScopedModelInfo,
  ExtensionUIRequest,
  ExtensionUIResponse,
  QuestionnaireQuestion,
  QuestionnaireResponse,
} from '@pi-deck/shared';

/**
 * Represents a session slot - a "pane" that can hold a session
 */
interface SessionSlot {
  id: string;
  session: PiSession;
  unsubscribe: () => void;
  /** The session file/ID currently loaded in this slot (if any) */
  loadedSessionId: string | null;
  /** Pending questionnaire request, if any (for reconnects) */
  pendingQuestionnaireRequest?: { toolCallId: string; questions: QuestionnaireQuestion[] };
  /** Slot initialization promise (used to avoid races on reconnect/create) */
  initializationPromise: Promise<void> | null;
}

/**
 * Orchestrates multiple concurrent PiSession instances within a single workspace.
 * 
 * Each "slot" represents a pane in the UI that can independently:
 * - Load different sessions
 * - Run agent prompts concurrently
 * - Have its own streaming state
 * 
 * Events are scoped with sessionSlotId so the UI knows which pane to update.
 */
export class SessionOrchestrator extends EventEmitter {
  private cwd: string;
  private slots = new Map<string, SessionSlot>();
  private nextSlotId = 1;
  private workspaceId: string | null = null;
  private syncIntegration: import('./sync/index.js').SyncIntegration | null = null;

  constructor(cwd: string) {
    super();
    this.cwd = cwd;
  }

  /**
   * Set the workspace ID for this orchestrator
   */
  setWorkspaceId(id: string): void {
    this.workspaceId = id;
  }

  /**
   * Set the sync integration for state tracking
   */
  setSyncIntegration(sync: import('./sync/index.js').SyncIntegration): void {
    this.syncIntegration = sync;
  }

  /**
   * Create a new session slot (pane)
   */
  async createSlot(slotId?: string): Promise<{
    slotId: string;
    state: SessionState;
    messages: ChatMessage[];
  }> {
    const id = slotId || `slot-${this.nextSlotId++}`;

    // Check if slot already exists
    if (this.slots.has(id)) {
      const slot = this.slots.get(id)!;
      if (slot.initializationPromise) {
        await slot.initializationPromise;
      }
      const state = await slot.session.getState();
      const messages = slot.session.getMessages();
      // Re-send pending questionnaire request if any (for client reconnects),
      // but only if the underlying resolver is still pending in the session.
      if (slot.pendingQuestionnaireRequest) {
        const pending = slot.session.hasPendingQuestionnaire(slot.pendingQuestionnaireRequest.toolCallId);
        if (pending) {
          setTimeout(() => {
            this.emit('questionnaireRequest', {
              ...slot.pendingQuestionnaireRequest!,
              sessionSlotId: id,
            });
          }, 100);
        } else {
          // Drop stale pending questionnaire entries
          delete slot.pendingQuestionnaireRequest;
        }
      }
      return { slotId: id, state, messages };
    }

    // Create a new PiSession for this slot
    const session = new PiSession(this.cwd);

    // Subscribe to session events, adding slotId
    const unsubscribe = this.subscribeToSession(id, session);

    const initializationPromise = session.initialize();

    const slot: SessionSlot = {
      id,
      session,
      unsubscribe,
      loadedSessionId: null,
      initializationPromise,
    };

    this.slots.set(id, slot);

    try {
      await initializationPromise;
      slot.initializationPromise = null;

      const state = await session.getState();
      const messages = session.getMessages();

      return { slotId: id, state, messages };
    } catch (error) {
      slot.unsubscribe();
      slot.session.dispose();
      this.slots.delete(id);
      throw error;
    }
  }

  /**
   * Get the default (first) slot, creating it if needed
   */
  async getDefaultSlot(): Promise<SessionSlot> {
    if (this.slots.size === 0) {
      await this.createSlot('default');
    }
    const slot = this.slots.values().next().value!;
    if (slot.initializationPromise) {
      await slot.initializationPromise;
    }
    return slot;
  }

  /**
   * Get a specific slot by ID
   */
  getSlot(slotId: string): SessionSlot | undefined {
    return this.slots.get(slotId);
  }

  /**
   * Get the session for a specific slot
   */
  async getSession(slotId: string): Promise<PiSession> {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
    }
    if (slot.initializationPromise) {
      await slot.initializationPromise;
    }
    return slot.session;
  }

  /**
   * Close a session slot
   */
  closeSlot(slotId: string): void {
    const slot = this.slots.get(slotId);
    if (!slot) {
      return;
    }

    slot.unsubscribe();
    slot.session.dispose();
    this.slots.delete(slotId);

    this.emit('slotClosed', { slotId });
  }

  /**
   * List all active slots
   */
  listSlots(): Array<{
    slotId: string;
    loadedSessionId: string | null;
    isActive: boolean;
  }> {
    return Array.from(this.slots.values()).map(slot => ({
      slotId: slot.id,
      loadedSessionId: slot.loadedSessionId,
      isActive: slot.session.isActive(),
    }));
  }

  /**
   * Check if any slot is currently active (streaming)
   */
  isAnySlotActive(): boolean {
    for (const slot of this.slots.values()) {
      if (slot.session.isActive()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Dispose all slots
   */
  dispose(): void {
    for (const slot of this.slots.values()) {
      slot.unsubscribe();
      slot.session.dispose();
    }
    this.slots.clear();
  }

  // ============================================================================
  // Proxy methods for session operations (all require slotId)
  // ============================================================================

  async getState(slotId: string): Promise<SessionState> {
    return (await this.getSession(slotId)).getState();
  }

  async getMessages(slotId: string): Promise<ChatMessage[]> {
    return (await this.getSession(slotId)).getMessages();
  }

  async prompt(slotId: string, message: string, images?: ImageAttachment[]): Promise<void> {
    return (await this.getSession(slotId)).prompt(message, images);
  }

  async steer(slotId: string, message: string, images?: ImageAttachment[]): Promise<void> {
    return (await this.getSession(slotId)).steer(message, images);
  }

  async followUp(slotId: string, message: string): Promise<void> {
    return (await this.getSession(slotId)).followUp(message);
  }

  async abort(slotId: string): Promise<void> {
    return (await this.getSession(slotId)).abort();
  }

  async setModel(slotId: string, provider: string, modelId: string): Promise<void> {
    return (await this.getSession(slotId)).setModel(provider, modelId);
  }

  async setThinkingLevel(slotId: string, level: ThinkingLevel): Promise<void> {
    return (await this.getSession(slotId)).setThinkingLevel(level);
  }

  async newSession(slotId: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
    }
    if (slot.initializationPromise) {
      await slot.initializationPromise;
    }
    await slot.session.newSession();
    slot.loadedSessionId = null;
  }

  async switchSession(slotId: string, sessionPath: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
    }
    if (slot.initializationPromise) {
      console.log(`[SessionOrchestrator] Waiting for slot ${slotId} to initialize before switchSession`);
      await slot.initializationPromise;
      console.log(`[SessionOrchestrator] Slot ${slotId} initialized, proceeding with switchSession`);
    }
    await slot.session.switchSession(sessionPath);
    slot.loadedSessionId = sessionPath;
  }

  async compact(slotId: string, customInstructions?: string): Promise<void> {
    return (await this.getSession(slotId)).compact(customInstructions);
  }

  async listSessions(): Promise<SessionInfo[]> {
    // Sessions list is shared across all slots (they can all load any session)
    const defaultSlot = await this.getDefaultSlot();
    const sessions = await defaultSlot.session.listSessions();

    // Hide stale empty sessions, but keep empty sessions currently open in a slot.
    const activeSessionFiles = new Set<string>();
    for (const slot of this.slots.values()) {
      if (slot.initializationPromise) {
        await slot.initializationPromise;
      }
      const sessionFile = slot.session.getSessionFile();
      if (sessionFile) {
        activeSessionFiles.add(sessionFile);
      }
    }

    return sessions.filter((session) => session.messageCount > 0 || activeSessionFiles.has(session.path));
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    // Models list is shared across all slots
    const defaultSlot = await this.getDefaultSlot();
    return defaultSlot.session.getAvailableModels();
  }

  async getCommands(slotId: string): Promise<SlashCommand[]> {
    return (await this.getSession(slotId)).getCommands();
  }

  // Session operations
  async fork(slotId: string, entryId: string): Promise<{ text: string; cancelled: boolean }> {
    return (await this.getSession(slotId)).fork(entryId);
  }

  async getForkMessages(slotId: string): Promise<Array<{ entryId: string; text: string }>> {
    return (await this.getSession(slotId)).getForkMessages();
  }

  async setSessionName(slotId: string, name: string): Promise<void> {
    return (await this.getSession(slotId)).setSessionName(name);
  }

  async exportHtml(slotId: string, outputPath?: string): Promise<string> {
    return (await this.getSession(slotId)).exportHtml(outputPath);
  }

  // Model/Thinking cycling
  async cycleModel(slotId: string, direction?: 'forward' | 'backward') {
    return (await this.getSession(slotId)).cycleModel(direction);
  }

  async cycleThinkingLevel(slotId: string): Promise<ThinkingLevel | null> {
    return (await this.getSession(slotId)).cycleThinkingLevel();
  }

  // Mode settings
  async setSteeringMode(slotId: string, mode: 'all' | 'one-at-a-time'): Promise<void> {
    return (await this.getSession(slotId)).setSteeringMode(mode);
  }

  async setFollowUpMode(slotId: string, mode: 'all' | 'one-at-a-time'): Promise<void> {
    return (await this.getSession(slotId)).setFollowUpMode(mode);
  }

  async setAutoCompaction(slotId: string, enabled: boolean): Promise<void> {
    return (await this.getSession(slotId)).setAutoCompaction(enabled);
  }

  async setAutoRetry(slotId: string, enabled: boolean): Promise<void> {
    return (await this.getSession(slotId)).setAutoRetry(enabled);
  }

  async abortRetry(slotId: string): Promise<void> {
    return (await this.getSession(slotId)).abortRetry();
  }

  // Bash execution
  async executeBash(slotId: string, command: string, onChunk?: (chunk: string) => void, excludeFromContext = false): Promise<BashResult> {
    return (await this.getSession(slotId)).executeBash(command, onChunk, excludeFromContext);
  }

  async abortBash(slotId: string): Promise<void> {
    return (await this.getSession(slotId)).abortBash();
  }

  // Stats
  async getSessionStats(slotId: string): Promise<SessionStats> {
    return (await this.getSession(slotId)).getSessionStats();
  }

  async getLastAssistantText(slotId: string): Promise<string | null> {
    return (await this.getSession(slotId)).getLastAssistantText();
  }

  // Startup info (shared across slots - uses default slot)
  async getStartupInfo(): Promise<StartupInfo> {
    const slot = await this.getDefaultSlot();
    return slot.session.getStartupInfo();
  }

  // ============================================================================
  // Session Tree Navigation
  // ============================================================================

  async getSessionTree(slotId: string): Promise<{ tree: SessionTreeNode[]; currentLeafId: string | null }> {
    return (await this.getSession(slotId)).getSessionTree();
  }

  async navigateTree(slotId: string, targetId: string, summarize?: boolean): Promise<{ success: boolean; editorText?: string; error?: string }> {
    return (await this.getSession(slotId)).navigateTree(targetId, summarize);
  }

  // ============================================================================
  // Queued Messages
  // ============================================================================

  async getQueuedMessages(slotId: string): Promise<{ steering: string[]; followUp: string[] }> {
    return (await this.getSession(slotId)).getQueuedMessages();
  }

  async clearQueue(slotId: string): Promise<{ steering: string[]; followUp: string[] }> {
    return (await this.getSession(slotId)).clearQueue();
  }

  // ============================================================================
  // Scoped Models
  // ============================================================================

  async getScopedModels(slotId: string): Promise<ScopedModelInfo[]> {
    return (await this.getSession(slotId)).getScopedModels();
  }

  async setScopedModels(slotId: string, models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>): Promise<void> {
    return (await this.getSession(slotId)).setScopedModels(models);
  }

  // ============================================================================
  // Extension UI
  // ============================================================================

  /**
   * Handle an extension UI response from the client.
   */
  async handleExtensionUIResponse(slotId: string, response: ExtensionUIResponse): Promise<void> {
    return (await this.getSession(slotId)).handleExtensionUIResponse(response);
  }

  /**
   * Update the stored editor text (for extension UI context).
   */
  async setEditorTextFromClient(slotId: string, text: string): Promise<void> {
    return (await this.getSession(slotId)).setEditorTextFromClient(text);
  }

  /**
   * Handle custom UI input from the client.
   */
  async handleCustomUIInput(slotId: string, input: import('@pi-deck/shared').CustomUIInputEvent): Promise<void> {
    return (await this.getSession(slotId)).handleCustomUIInput(input);
  }

  /**
   * Check if a questionnaire tool call is still pending for a slot.
   */
  async hasPendingQuestionnaire(slotId: string, toolCallId: string): Promise<boolean> {
    return (await this.getSession(slotId)).hasPendingQuestionnaire(toolCallId);
  }

  /**
   * Handle a questionnaire response from the client.
   */
  async handleQuestionnaireResponse(slotId: string, response: QuestionnaireResponse): Promise<void> {
    const slot = this.slots.get(slotId);
    if (slot) {
      // Clear pending questionnaire request
      delete slot.pendingQuestionnaireRequest;
    }
    return (await this.getSession(slotId)).handleQuestionnaireResponse(response);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private subscribeToSession(slotId: string, session: PiSession): () => void {
    const eventHandler = (event: SessionEvent) => {
      try {
        // Emit event with slotId attached (for backward compatibility)
        this.emit('event', { ...event, sessionSlotId: slotId });

        // Forward to sync system for durable state tracking
        if (this.workspaceId && this.syncIntegration) {
          this.syncIntegration.handleSessionEvent(this.workspaceId, slotId, event);
        }

        // When a user message starts, the SDK may have consumed a steering message
        // from the queue. Send updated queue state so the UI clears stale entries.
        if (event.type === 'messageStart' && event.message.role === 'user') {
          const queueState = session.getQueuedMessages();
          this.emit('event', {
            type: 'queuedMessages',
            sessionSlotId: slotId,
            steering: queueState.steering,
            followUp: queueState.followUp,
          });
        }
      } catch (error) {
        console.error(`[SessionOrchestrator] Error in event handler for slot ${slotId}:`, error);
      }
    };

    // Handler for extension UI requests
    const extensionUIHandler = (request: ExtensionUIRequest) => {
      this.emit('extensionUIRequest', { request, sessionSlotId: slotId });
    };

    // Handler for extension notifications
    const notificationHandler = (notification: { message: string; type: 'info' | 'warning' | 'error' }) => {
      this.emit('extensionNotification', { ...notification, sessionSlotId: slotId });
    };

    // Handler for editor text changes from extensions
    const editorTextHandler = (text: string) => {
      this.emit('extensionEditorText', { text, sessionSlotId: slotId });
    };

    // Handlers for custom UI events (ctx.ui.custom())
    const customUIStartHandler = (state: import('@pi-deck/shared').CustomUIState) => {
      this.emit('customUIStart', { state, sessionSlotId: slotId });
    };
    const customUIUpdateHandler = (update: { sessionId: string; root: import('@pi-deck/shared').CustomUINode }) => {
      this.emit('customUIUpdate', { ...update, sessionSlotId: slotId });
    };
    const customUICloseHandler = (close: { sessionId: string }) => {
      this.emit('customUIClose', { ...close, sessionSlotId: slotId });
    };

    // Handler for native questionnaire requests
    const questionnaireRequestHandler = (request: { toolCallId: string; questions: QuestionnaireQuestion[] }) => {
      // Store for reconnects
      const slot = this.slots.get(slotId);
      if (slot) {
        slot.pendingQuestionnaireRequest = request;
      }
      this.emit('questionnaireRequest', { ...request, sessionSlotId: slotId });
    };

    session.on('event', eventHandler);
    session.on('extensionUIRequest', extensionUIHandler);
    session.on('extensionNotification', notificationHandler);
    session.on('editorTextChange', editorTextHandler);
    session.on('customUIStart', customUIStartHandler);
    session.on('customUIUpdate', customUIUpdateHandler);
    session.on('customUIClose', customUICloseHandler);
    session.on('questionnaireRequest', questionnaireRequestHandler);

    return () => {
      session.off('event', eventHandler);
      session.off('extensionUIRequest', extensionUIHandler);
      session.off('extensionNotification', notificationHandler);
      session.off('editorTextChange', editorTextHandler);
      session.off('customUIStart', customUIStartHandler);
      session.off('customUIUpdate', customUIUpdateHandler);
      session.off('customUIClose', customUICloseHandler);
      session.off('questionnaireRequest', questionnaireRequestHandler);
    };
  }
}
