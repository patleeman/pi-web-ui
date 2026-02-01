import { EventEmitter } from 'events';
import { PiSession } from './pi-session.js';
import type {
  ChatMessage,
  SessionState,
  SessionEvent,
  SessionInfo,
  ModelInfo,
  SlashCommand,
  ThinkingLevel,
  ImageAttachment,
  SessionStats,
  BashResult,
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

  async steer(slotId: string, message: string): Promise<void> {
    return this.getSession(slotId).steer(message);
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
  async executeBash(slotId: string, command: string, onChunk?: (chunk: string) => void): Promise<BashResult> {
    return this.getSession(slotId).executeBash(command, onChunk);
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

  // ============================================================================
  // Private
  // ============================================================================

  private subscribeToSession(slotId: string, session: PiSession): () => void {
    const handler = (event: SessionEvent) => {
      // Emit event with slotId attached
      this.emit('event', { ...event, sessionSlotId: slotId });
    };

    session.on('event', handler);
    return () => session.off('event', handler);
  }
}
