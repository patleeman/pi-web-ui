/**
 * Web-based implementation of ExtensionUIContext.
 * 
 * Sends UI requests to the client via callbacks and waits for responses.
 * This enables extension commands like /review to show interactive UI
 * in the web client.
 */

import type { ExtensionUIContext, ExtensionUIDialogOptions, WidgetPlacement, ExtensionWidgetOptions } from '@mariozechner/pi-coding-agent';
import type { ExtensionUIRequest, ExtensionUIResponse, CustomUIState, CustomUINode, CustomUIInputEvent, QuestionnaireQuestion, QuestionnaireResponse } from '@pi-deck/shared';
import { MockTUI, MockTheme, MockKeybindingsManager, buildComponentTree, type MockComponent } from './web-tui-components.js';

// Generate unique request IDs
let requestIdCounter = 0;
function generateRequestId(): string {
  return `ext-ui-${Date.now()}-${++requestIdCounter}`;
}

// Generate unique custom UI session IDs
let customUISessionCounter = 0;
function generateCustomUISessionId(): string {
  return `custom-ui-${Date.now()}-${++customUISessionCounter}`;
}

/** Callback to send UI request to client */
export type SendUIRequestCallback = (request: ExtensionUIRequest) => void;

/** Callback to send notification */
export type SendNotificationCallback = (message: string, type: 'info' | 'warning' | 'error') => void;

/** Callback to set editor text */
export type SetEditorTextCallback = (text: string) => void;

/** Callback to get editor text */
export type GetEditorTextCallback = () => string;

/** Callback to start a custom UI session */
export type SendCustomUIStartCallback = (state: CustomUIState) => void;

/** Callback to update custom UI state */
export type SendCustomUIUpdateCallback = (update: { sessionId: string; root: CustomUINode }) => void;

/** Callback to close a custom UI session */
export type SendCustomUICloseCallback = (close: { sessionId: string }) => void;

/** Callback to send a questionnaire request to the client */
export type SendQuestionnaireRequestCallback = (request: { toolCallId: string; questions: QuestionnaireQuestion[] }) => void;

export interface WebExtensionUIContextOptions {
  /** Callback to send UI requests to the client */
  sendRequest: SendUIRequestCallback;
  /** Callback to send notifications */
  sendNotification: SendNotificationCallback;
  /** Callback to set editor text */
  setEditorText?: SetEditorTextCallback;
  /** Callback to get editor text */
  getEditorText?: GetEditorTextCallback;
  /** Callback to start a custom UI session */
  sendCustomUIStart?: SendCustomUIStartCallback;
  /** Callback to update custom UI state */
  sendCustomUIUpdate?: SendCustomUIUpdateCallback;
  /** Callback to close a custom UI session */
  sendCustomUIClose?: SendCustomUICloseCallback;
  /** Callback to send a native questionnaire request (bypasses custom UI) */
  sendQuestionnaireRequest?: SendQuestionnaireRequestCallback;
}

/**
 * Web-based ExtensionUIContext implementation.
 * 
 * For interactive methods (select, confirm, input, editor), this sends
 * a request to the client and waits for a response via the pending
 * requests map.
 * 
 * For non-interactive methods (notify, setStatus, setWidget, etc.),
 * these are either forwarded to the client or are no-ops in web mode.
 */
/** Active custom UI session */
interface CustomUISession {
  sessionId: string;
  component: MockComponent & { handleInput?(data: string): void };
  resolve: (value: any) => void;
}

export class WebExtensionUIContext implements ExtensionUIContext {
  private sendRequest: SendUIRequestCallback;
  private sendNotification: SendNotificationCallback;
  private _setEditorText?: SetEditorTextCallback;
  private _getEditorText?: GetEditorTextCallback;
  private _sendCustomUIStart?: SendCustomUIStartCallback;
  private _sendCustomUIUpdate?: SendCustomUIUpdateCallback;
  private _sendCustomUIClose?: SendCustomUICloseCallback;
  private _sendQuestionnaireRequest?: SendQuestionnaireRequestCallback;
  
  /** Pending requests waiting for client responses */
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
  }>();

  /** Active custom UI sessions */
  private customUISessions = new Map<string, CustomUISession>();

  /** Status text values (stored locally, not sent to client yet) */
  private statusValues = new Map<string, string>();

  /** Tool output expansion state */
  private toolsExpanded = true;

  // Questionnaire interception state
  /** Set when a questionnaire tool starts; consumed by next custom() call */
  private _questionnaireToolCallId: string | null = null;
  private _questionnaireQuestions: QuestionnaireQuestion[] | null = null;
  private _questionnaireSetTime: number = 0;
  /** Pending questionnaire resolvers keyed by toolCallId */
  private pendingQuestionnaireResolvers = new Map<string, {
    resolve: (value: any) => void;
    questions: QuestionnaireQuestion[];
  }>();
  /** Queue of recent questionnaire tool calls (for race condition handling) */
  private recentQuestionnaireCalls: Array<{ toolCallId: string; questions: QuestionnaireQuestion[]; time: number }> = [];

  constructor(options: WebExtensionUIContextOptions) {
    this.sendRequest = options.sendRequest;
    this.sendNotification = options.sendNotification;
    this._setEditorText = options.setEditorText;
    this._getEditorText = options.getEditorText;
    this._sendCustomUIStart = options.sendCustomUIStart;
    this._sendCustomUIUpdate = options.sendCustomUIUpdate;
    this._sendCustomUIClose = options.sendCustomUIClose;
    this._sendQuestionnaireRequest = options.sendQuestionnaireRequest;
  }

  /**
   * Set questionnaire mode. Called when a questionnaire tool_execution_start
   * is detected. The next custom() call will use the native questionnaire UI
   * instead of mock TUI components.
   */
  setQuestionnaireMode(toolCallId: string, questions: QuestionnaireQuestion[]): void {
    this._questionnaireToolCallId = toolCallId;
    this._questionnaireQuestions = questions;
    this._questionnaireSetTime = Date.now();
    // Also add to queue for race condition handling
    this.recentQuestionnaireCalls.push({ toolCallId, questions, time: Date.now() });
    // Clean old entries (older than 5 seconds)
    this.recentQuestionnaireCalls = this.recentQuestionnaireCalls.filter(c => Date.now() - c.time < 5000);
  }

  /** Whether a questionnaire with this toolCallId is still pending resolution. */
  hasPendingQuestionnaire(toolCallId: string): boolean {
    return this.pendingQuestionnaireResolvers.has(toolCallId);
  }

  /**
   * Handle a questionnaire response from the client.
   * Resolves the pending custom() call with the converted result.
   */
  handleQuestionnaireResponse(response: QuestionnaireResponse): void {
    const pending = this.pendingQuestionnaireResolvers.get(response.toolCallId);
    if (!pending) {
      console.warn(`[WebExtensionUIContext] No pending questionnaire for toolCallId: ${response.toolCallId}`);
      return;
    }

    this.pendingQuestionnaireResolvers.delete(response.toolCallId);

    // Convert QuestionnaireResponse to QuestionnaireResult (the format the tool expects)
    const result = {
      questions: pending.questions,
      answers: response.answers,
      cancelled: response.cancelled,
    };
    pending.resolve(result);
  }

  /**
   * Handle a response from the client.
   * Call this when receiving a WsExtensionUIResponseMessage.
   */
  handleResponse(response: ExtensionUIResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      console.warn(`No pending request for response: ${response.requestId}`);
      return;
    }

    // Clear timeout if set
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    this.pendingRequests.delete(response.requestId);

    if (response.cancelled) {
      pending.resolve(undefined);
    } else {
      pending.resolve(response.value);
    }
  }

  /**
   * Cancel all pending requests (e.g., when session is disposed).
   */
  cancelAllPending(): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.resolve(undefined);
    }
    this.pendingRequests.clear();

    // Also cancel custom UI sessions
    for (const [sessionId, session] of this.customUISessions) {
      session.resolve(undefined);
      if (this._sendCustomUIClose) {
        this._sendCustomUIClose({ sessionId });
      }
    }
    this.customUISessions.clear();

    // Cancel pending questionnaire resolvers
    for (const [toolCallId, pending] of this.pendingQuestionnaireResolvers) {
      pending.resolve({ questions: pending.questions, answers: [], cancelled: true });
    }
    this.pendingQuestionnaireResolvers.clear();
    this._questionnaireToolCallId = null;
    this._questionnaireQuestions = null;
    this._questionnaireSetTime = 0;
    this.recentQuestionnaireCalls = [];
  }

  /**
   * Get the pending questionnaire request, if any.
   * Used for reconnects to restore UI state.
   */
  getPendingQuestionnaireRequest(): { toolCallId: string; questions: QuestionnaireQuestion[] } | undefined {
    // Check current active questionnaire
    if (this._questionnaireToolCallId && this._questionnaireQuestions) {
      return {
        toolCallId: this._questionnaireToolCallId,
        questions: this._questionnaireQuestions,
      };
    }
    // Check pending resolvers (questionnaire already sent to client, waiting for response)
    for (const [toolCallId, pending] of this.pendingQuestionnaireResolvers) {
      return { toolCallId, questions: pending.questions };
    }
    // Check recent calls queue
    if (this.recentQuestionnaireCalls.length > 0) {
      const recent = this.recentQuestionnaireCalls[this.recentQuestionnaireCalls.length - 1];
      return { toolCallId: recent.toolCallId, questions: recent.questions };
    }
    return undefined;
  }

  // ============================================================================
  // Interactive UI Methods (send request, wait for response)
  // ============================================================================

  async select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
    const requestId = generateRequestId();
    
    return new Promise((resolve, reject) => {
      // Set up timeout if specified
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (opts?.timeout) {
        timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          resolve(undefined);
        }, opts.timeout);
      }

      // Handle abort signal
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          if (timeoutId) clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          resolve(undefined);
        });
      }

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      this.sendRequest({
        method: 'select',
        requestId,
        title,
        options,
        timeout: opts?.timeout,
      });
    });
  }

  async confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean> {
    const requestId = generateRequestId();
    
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (opts?.timeout) {
        timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          resolve(false);
        }, opts.timeout);
      }

      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          if (timeoutId) clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          resolve(false);
        });
      }

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      this.sendRequest({
        method: 'confirm',
        requestId,
        title,
        message,
        timeout: opts?.timeout,
      });
    });
  }

  async input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
    const requestId = generateRequestId();
    
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (opts?.timeout) {
        timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          resolve(undefined);
        }, opts.timeout);
      }

      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          if (timeoutId) clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          resolve(undefined);
        });
      }

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      this.sendRequest({
        method: 'input',
        requestId,
        title,
        placeholder,
        timeout: opts?.timeout,
      });
    });
  }

  async editor(title: string, prefill?: string): Promise<string | undefined> {
    const requestId = generateRequestId();
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      this.sendRequest({
        method: 'editor',
        requestId,
        title,
        prefill,
      });
    });
  }

  // ============================================================================
  // Non-interactive methods
  // ============================================================================

  notify(message: string, type?: 'info' | 'warning' | 'error'): void {
    this.sendNotification(message, type || 'info');
  }

  setStatus(key: string, text: string | undefined): void {
    if (text === undefined) {
      this.statusValues.delete(key);
    } else {
      this.statusValues.set(key, text);
    }
    // TODO: Could send status updates to client if needed
  }

  setWorkingMessage(message?: string): void {
    // Not implemented for web UI - could show in status bar
  }

  setWidget(key: string, content: any, options?: ExtensionWidgetOptions): void {
    // Widgets are TUI-specific, not supported in web UI
    // Could potentially render simple text widgets in future
  }

  setFooter(factory: any): void {
    // Footer is TUI-specific
  }

  setHeader(factory: any): void {
    // Header is TUI-specific
  }

  setTitle(title: string): void {
    // Could potentially update browser tab title
  }

  /**
   * Handle custom UI with mock TUI components.
   * 
   * This creates mock versions of TUI, theme, etc. and calls the factory.
   * The resulting component tree is serialized and sent to the client for rendering.
   * 
   * If questionnaire mode is active (set via setQuestionnaireMode), this bypasses
   * mock TUI rendering and uses the native web QuestionnaireUI component instead.
   */
  async custom<T>(factory: any, options?: any): Promise<T> {
    // Race guard: tool execute may call custom() before tool_execution_start is observed.
    // Wait briefly for setQuestionnaireMode() to populate questionnaire metadata.
    if (!this._questionnaireToolCallId) {
      for (let i = 0; i < 12; i++) {
        if (this._questionnaireToolCallId) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // Fallback to recent queue if mode arrived slightly out of order
    if (!this._questionnaireToolCallId && this.recentQuestionnaireCalls.length > 0) {
      const recent = this.recentQuestionnaireCalls[this.recentQuestionnaireCalls.length - 1];
      this._questionnaireToolCallId = recent.toolCallId;
      this._questionnaireQuestions = recent.questions;
      this.recentQuestionnaireCalls = this.recentQuestionnaireCalls.filter(c => c.toolCallId !== recent.toolCallId);
    }

    // Intercept questionnaire tool: use native web UI instead of mock TUI
    if (this._questionnaireToolCallId && this._questionnaireQuestions && this._sendQuestionnaireRequest) {
      const toolCallId = this._questionnaireToolCallId;
      const questions = this._questionnaireQuestions;
      this._questionnaireToolCallId = null;
      this._questionnaireQuestions = null;
      return new Promise<T>((resolve) => {
        this.pendingQuestionnaireResolvers.set(toolCallId, { resolve, questions });
        this._sendQuestionnaireRequest!({ toolCallId, questions });
      });
    }

    // If no custom UI callbacks are set, fall back to returning undefined
    if (!this._sendCustomUIStart) {
      console.warn('[WebExtensionUIContext] custom() called but sendCustomUIStart not configured');
      return undefined as T;
    }

    return new Promise<T>((resolve) => {
      try {
        const sessionId = generateCustomUISessionId();
        
        // Create mock TUI and theme
        const mockTui = new MockTUI();
        const mockTheme = new MockTheme();
        const mockKeybindings = new MockKeybindingsManager();
        
        // The done callback that the factory will call when finished
        const done = (result: T) => {
          // Clean up session
          this.customUISessions.delete(sessionId);
          
          // Send close event
          if (this._sendCustomUIClose) {
            this._sendCustomUIClose({ sessionId });
          }
          
          resolve(result);
        };
        
        // Call the factory
        const component = factory(mockTui, mockTheme, mockKeybindings, done);
        
        // Handle null/undefined component
        if (!component) {
          resolve(undefined as T);
          return;
        }
        
        // Store the session
        this.customUISessions.set(sessionId, {
          sessionId,
          component,
          resolve,
        });
        
        // Build and send the initial component tree
        const root = buildComponentTree(component);
        
        this._sendCustomUIStart!({
          sessionId,
          root,
        });
      } catch (error) {
        console.error('[WebExtensionUIContext] custom() factory threw:', error);
        resolve(undefined as T);
      }
    });
  }

  /**
   * Handle input from the client for a custom UI session.
   */
  handleCustomUIInput(input: CustomUIInputEvent): void {
    const session = this.customUISessions.get(input.sessionId);
    if (!session) {
      console.warn(`[WebExtensionUIContext] No custom UI session for: ${input.sessionId}`);
      return;
    }

    // Route input to the component
    if (session.component.handleInput) {
      // Convert input event to key string
      let keyData = input.key || '';
      
      // Handle special keys
      if (input.inputType === 'key') {
        switch (input.key) {
          case 'ArrowDown':
            keyData = '\x1b[B';
            break;
          case 'ArrowUp':
            keyData = '\x1b[A';
            break;
          case 'ArrowLeft':
            keyData = '\x1b[D';
            break;
          case 'ArrowRight':
            keyData = '\x1b[C';
            break;
          case 'Enter':
            keyData = '\r';
            break;
          case 'Escape':
            keyData = '\x1b';
            break;
          case 'Backspace':
            keyData = '\x7f';
            break;
          default:
            // Use the key as-is for single characters
            keyData = input.key || '';
        }
      }
      
      session.component.handleInput(keyData);
      
      // Rebuild and send updated tree
      if (this._sendCustomUIUpdate) {
        const root = buildComponentTree(session.component);
        this._sendCustomUIUpdate({
          sessionId: input.sessionId,
          root,
        });
      }
    }
  }

  setEditorText(text: string): void {
    if (this._setEditorText) {
      this._setEditorText(text);
    }
  }

  getEditorText(): string {
    if (this._getEditorText) {
      return this._getEditorText();
    }
    return '';
  }

  setEditorComponent(factory: any): void {
    // Custom editor components are TUI-specific
  }

  // Theme-related methods
  get theme(): any {
    // Return a minimal theme object for web UI
    // Extensions shouldn't rely on theme in web mode
    return {
      fg: (color: string, text: string) => text,
      bold: (text: string) => text,
    };
  }

  getAllThemes(): { name: string; path: string | undefined }[] {
    return [];
  }

  getTheme(name: string): any {
    return undefined;
  }

  setTheme(theme: string | any): { success: boolean; error?: string } {
    return { success: false, error: 'Theme switching not supported in web UI' };
  }

  getToolsExpanded(): boolean {
    return this.toolsExpanded;
  }

  setToolsExpanded(expanded: boolean): void {
    this.toolsExpanded = expanded;
  }
}
