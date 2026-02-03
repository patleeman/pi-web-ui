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
} from '@pi-web-ui/shared';

/**
 * Represents a session slot - a "pane" that can hold a session
 */
interface SessionSlot {
  id: string;
  session: PiSession;
  unsubscribe: () => void;
  /** The session file/ID currently loaded in this slot (if any) */
  loadedSessionId: string | null;
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

  constructor(cwd: string) {
    super();
    this.cwd = cwd;
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
      const state = await slot.session.getState();
      const messages = slot.session.getMessages();
      return { slotId: id, state, messages };
    }

    // Create a new PiSession for this slot
    const session = new PiSession(this.cwd);
    
    // Subscribe to session events, adding slotId
    const unsubscribe = this.subscribeToSession(id, session);

    const slot: SessionSlot = {
      id,
      session,
      unsubscribe,
      loadedSessionId: null,
    };

    this.slots.set(id, slot);

    // Initialize the session
    await session.initialize();

    const state = await session.getState();
    const messages = session.getMessages();

    return { slotId: id, state, messages };
  }

  /**
   * Get the default (first) slot, creating it if needed
   */
  async getDefaultSlot(): Promise<SessionSlot> {
    if (this.slots.size === 0) {
      await this.createSlot('default');
    }
    return this.slots.values().next().value!;
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
  getSession(slotId: string): PiSession {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
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
    return this.getSession(slotId).getState();
  }

  getMessages(slotId: string): ChatMessage[] {
    return this.getSession(slotId).getMessages();
  }

  async prompt(slotId: string, message: string, images?: ImageAttachment[]): Promise<void> {
    return this.getSession(slotId).prompt(message, images);
  }

  async steer(slotId: string, message: string, images?: ImageAttachment[]): Promise<void> {
    console.log(`[SessionOrchestrator.steer] slot: ${slotId}, message: "${message?.substring(0, 50)}"`);
    const session = this.getSession(slotId);
    console.log(`[SessionOrchestrator.steer] Got session, calling session.steer`);
    const result = await session.steer(message, images);
    console.log(`[SessionOrchestrator.steer] session.steer returned`);
    return result;
  }

  async followUp(slotId: string, message: string): Promise<void> {
    return this.getSession(slotId).followUp(message);
  }

  async abort(slotId: string): Promise<void> {
    return this.getSession(slotId).abort();
  }

  async setModel(slotId: string, provider: string, modelId: string): Promise<void> {
    return this.getSession(slotId).setModel(provider, modelId);
  }

  setThinkingLevel(slotId: string, level: ThinkingLevel): void {
    return this.getSession(slotId).setThinkingLevel(level);
  }

  async newSession(slotId: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
    }
    await slot.session.newSession();
    slot.loadedSessionId = null;
  }

  async switchSession(slotId: string, sessionPath: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Session slot not found: ${slotId}`);
    }
    await slot.session.switchSession(sessionPath);
    slot.loadedSessionId = sessionPath;
  }

  async compact(slotId: string, customInstructions?: string): Promise<void> {
    return this.getSession(slotId).compact(customInstructions);
  }

  async listSessions(): Promise<SessionInfo[]> {
    // Sessions list is shared across all slots (they can all load any session)
    const defaultSlot = await this.getDefaultSlot();
    return defaultSlot.session.listSessions();
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    // Models list is shared across all slots
    const defaultSlot = await this.getDefaultSlot();
    return defaultSlot.session.getAvailableModels();
  }

  getCommands(slotId: string): SlashCommand[] {
    return this.getSession(slotId).getCommands();
  }

  // Session operations
  async fork(slotId: string, entryId: string): Promise<{ text: string; cancelled: boolean }> {
    return this.getSession(slotId).fork(entryId);
  }

  getForkMessages(slotId: string): Array<{ entryId: string; text: string }> {
    return this.getSession(slotId).getForkMessages();
  }

  setSessionName(slotId: string, name: string): void {
    return this.getSession(slotId).setSessionName(name);
  }

  async exportHtml(slotId: string, outputPath?: string): Promise<string> {
    return this.getSession(slotId).exportHtml(outputPath);
  }

  // Model/Thinking cycling
  async cycleModel(slotId: string, direction?: 'forward' | 'backward') {
    return this.getSession(slotId).cycleModel(direction);
  }

  cycleThinkingLevel(slotId: string): ThinkingLevel | null {
    return this.getSession(slotId).cycleThinkingLevel();
  }

  // Mode settings
  setSteeringMode(slotId: string, mode: 'all' | 'one-at-a-time'): void {
    return this.getSession(slotId).setSteeringMode(mode);
  }

  setFollowUpMode(slotId: string, mode: 'all' | 'one-at-a-time'): void {
    return this.getSession(slotId).setFollowUpMode(mode);
  }

  setAutoCompaction(slotId: string, enabled: boolean): void {
    return this.getSession(slotId).setAutoCompaction(enabled);
  }

  setAutoRetry(slotId: string, enabled: boolean): void {
    return this.getSession(slotId).setAutoRetry(enabled);
  }

  abortRetry(slotId: string): void {
    return this.getSession(slotId).abortRetry();
  }

  // Bash execution
  async executeBash(slotId: string, command: string, onChunk?: (chunk: string) => void, excludeFromContext = false): Promise<BashResult> {
    return this.getSession(slotId).executeBash(command, onChunk, excludeFromContext);
  }

  abortBash(slotId: string): void {
    return this.getSession(slotId).abortBash();
  }

  // Stats
  getSessionStats(slotId: string): SessionStats {
    return this.getSession(slotId).getSessionStats();
  }

  getLastAssistantText(slotId: string): string | null {
    return this.getSession(slotId).getLastAssistantText();
  }

  // Startup info (shared across slots - uses default slot)
  async getStartupInfo(): Promise<StartupInfo> {
    const slot = await this.getDefaultSlot();
    return slot.session.getStartupInfo();
  }

  // ============================================================================
  // Session Tree Navigation
  // ============================================================================

  getSessionTree(slotId: string): { tree: SessionTreeNode[]; currentLeafId: string | null } {
    return this.getSession(slotId).getSessionTree();
  }

  async navigateTree(slotId: string, targetId: string, summarize?: boolean): Promise<{ success: boolean; editorText?: string; error?: string }> {
    return this.getSession(slotId).navigateTree(targetId, summarize);
  }

  // ============================================================================
  // Queued Messages
  // ============================================================================

  getQueuedMessages(slotId: string): { steering: string[]; followUp: string[] } {
    return this.getSession(slotId).getQueuedMessages();
  }

  clearQueue(slotId: string): { steering: string[]; followUp: string[] } {
    return this.getSession(slotId).clearQueue();
  }

  // ============================================================================
  // Scoped Models
  // ============================================================================

  async getScopedModels(slotId: string): Promise<ScopedModelInfo[]> {
    return this.getSession(slotId).getScopedModels();
  }

  async setScopedModels(slotId: string, models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>): Promise<void> {
    return this.getSession(slotId).setScopedModels(models);
  }

  // ============================================================================
  // Extension UI
  // ============================================================================

  /**
   * Handle an extension UI response from the client.
   */
  handleExtensionUIResponse(slotId: string, response: ExtensionUIResponse): void {
    return this.getSession(slotId).handleExtensionUIResponse(response);
  }

  /**
   * Update the stored editor text (for extension UI context).
   */
  setEditorTextFromClient(slotId: string, text: string): void {
    return this.getSession(slotId).setEditorTextFromClient(text);
  }

  /**
   * Handle custom UI input from the client.
   */
  handleCustomUIInput(slotId: string, input: import('@pi-web-ui/shared').CustomUIInputEvent): void {
    return this.getSession(slotId).handleCustomUIInput(input);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private subscribeToSession(slotId: string, session: PiSession): () => void {
    const eventHandler = (event: SessionEvent) => {
      // Emit event with slotId attached
      this.emit('event', { ...event, sessionSlotId: slotId });
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
    const customUIStartHandler = (state: import('@pi-web-ui/shared').CustomUIState) => {
      this.emit('customUIStart', { state, sessionSlotId: slotId });
    };
    const customUIUpdateHandler = (update: { sessionId: string; root: import('@pi-web-ui/shared').CustomUINode }) => {
      this.emit('customUIUpdate', { ...update, sessionSlotId: slotId });
    };
    const customUICloseHandler = (close: { sessionId: string }) => {
      this.emit('customUIClose', { ...close, sessionSlotId: slotId });
    };

    session.on('event', eventHandler);
    session.on('extensionUIRequest', extensionUIHandler);
    session.on('extensionNotification', notificationHandler);
    session.on('editorTextChange', editorTextHandler);
    session.on('customUIStart', customUIStartHandler);
    session.on('customUIUpdate', customUIUpdateHandler);
    session.on('customUIClose', customUICloseHandler);

    return () => {
      session.off('event', eventHandler);
      session.off('extensionUIRequest', extensionUIHandler);
      session.off('extensionNotification', notificationHandler);
      session.off('editorTextChange', editorTextHandler);
      session.off('customUIStart', customUIStartHandler);
      session.off('customUIUpdate', customUIUpdateHandler);
      session.off('customUIClose', customUICloseHandler);
    };
  }
}
