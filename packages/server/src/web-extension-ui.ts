/**
 * Web-based implementation of ExtensionUIContext.
 * 
 * Sends UI requests to the client via callbacks and waits for responses.
 * This enables extension commands like /review to show interactive UI
 * in the web client.
 */

import type { ExtensionUIContext, ExtensionUIDialogOptions, WidgetPlacement, ExtensionWidgetOptions } from '@mariozechner/pi-coding-agent';
import type { ExtensionUIRequest, ExtensionUIResponse, CustomUIState, CustomUINode, CustomUIInputEvent } from '@pi-web-ui/shared';
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

  constructor(options: WebExtensionUIContextOptions) {
    this.sendRequest = options.sendRequest;
    this.sendNotification = options.sendNotification;
    this._setEditorText = options.setEditorText;
    this._getEditorText = options.getEditorText;
    this._sendCustomUIStart = options.sendCustomUIStart;
    this._sendCustomUIUpdate = options.sendCustomUIUpdate;
    this._sendCustomUIClose = options.sendCustomUIClose;
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
   */
  async custom<T>(factory: any, options?: any): Promise<T> {
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
}
