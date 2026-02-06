import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  DirectoryEntry,
  ModelInfo,
  SessionInfo,
  SessionState,
  SlashCommand,
  StartupInfo,
  ThinkingLevel,
  UIState,
  WsClientMessage,
  WsServerEvent,
  ImageAttachment,
  ExtensionUIRequest,
  CustomUIState,
  QuestionnaireRequest,
  PaneTabPageState,
} from '@pi-web-ui/shared';

interface ToolExecution {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
}

/** State for a bash execution */
export interface BashExecution {
  messageId: string;
  command: string;
  output: string;
  isRunning: boolean;
  exitCode?: number | null;
  isError?: boolean;
  excludeFromContext: boolean;
}

/** State for a single session slot (pane) */
export interface SessionSlotState {
  slotId: string;
  state: SessionState | null;
  messages: ChatMessage[];
  commands: SlashCommand[];
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolExecutions: ToolExecution[];
  /** Active or recent bash execution (from ! or !! commands) */
  bashExecution: BashExecution | null;
  /** Active questionnaire request */
  questionnaireRequest: QuestionnaireRequest | null;
  /** Active extension UI request (select/confirm/input/editor) */
  extensionUIRequest: ExtensionUIRequest | null;
  /** Active custom UI state (ctx.ui.custom()) */
  customUIState: CustomUIState | null;
}

/** State for a workspace (contains multiple session slots) */
export interface WorkspaceState {
  id: string;
  path: string;
  name: string;
  /** Session slots keyed by slotId */
  slots: Record<string, SessionSlotState>;
  /** Sessions list (shared across slots) */
  sessions: SessionInfo[];
  /** Models list (shared across slots) */
  models: ModelInfo[];
  /** Startup info (version, context, skills, extensions, themes) */
  startupInfo: StartupInfo | null;
}

export interface DeployState {
  status: 'idle' | 'building' | 'restarting' | 'error';
  message: string | null;
}

export interface UseWorkspacesReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Deploy state
  deployState: DeployState;

  // Workspace management
  workspaces: WorkspaceState[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceState | null;
  allowedRoots: string[];
  homeDirectory: string;
  recentWorkspaces: string[];

  // Directory browsing
  currentBrowsePath: string;
  directoryEntries: DirectoryEntry[];
  browseDirectory: (path?: string) => void;

  // Workspace actions
  openWorkspace: (path: string) => void;
  closeWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;

  // Session slot actions
  createSessionSlot: (slotId: string) => void;
  createSessionSlotForWorkspace: (workspaceId: string, slotId: string) => void;
  closeSessionSlot: (slotId: string) => void;
  closeSessionSlotForWorkspace: (workspaceId: string, slotId: string) => void;
  listSessionSlots: (workspaceId: string) => void;
  getSlot: (slotId: string) => SessionSlotState | null;

  // UI State (persisted to backend)
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  themeId: string | null;
  setThemeId: (themeId: string | null) => void;
  rightPaneByWorkspace: Record<string, boolean>;
  setWorkspaceRightPaneOpen: (workspacePath: string, isOpen: boolean) => void;
  paneTabsByWorkspace: Record<string, PaneTabPageState[]>;
  activePaneTabByWorkspace: Record<string, string>;
  setPaneTabsForWorkspace: (workspacePath: string, tabs: PaneTabPageState[], activeTabId: string) => void;

  // Draft input persistence
  getDraftInput: (workspacePath: string) => string;
  setDraftInput: (workspacePath: string, value: string) => void;

  // Session actions (operate on active workspace, specific slot)
  sendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  steer: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  followUp: (slotId: string, message: string) => void;
  abort: (slotId: string) => void;
  setModel: (slotId: string, provider: string, modelId: string) => void;
  setThinkingLevel: (slotId: string, level: ThinkingLevel) => void;
  newSession: (slotId: string) => void;
  switchSession: (slotId: string, sessionId: string) => void;
  compact: (slotId: string, customInstructions?: string) => void;
  refreshSessions: () => void;
  refreshModels: () => void;
  refreshCommands: (slotId: string) => void;
  deploy: () => void;

  // Fork actions
  fork: (slotId: string, entryId: string) => void;
  getForkMessages: (slotId: string) => void;

  // Questionnaire
  sendQuestionnaireResponse: (slotId: string, toolCallId: string, response: string) => void;

  // Extension UI
  sendExtensionUIResponse: (slotId: string, response: { requestId: string; cancelled: boolean; value?: string | boolean }) => void;

  // Custom UI (for ctx.ui.custom())
  sendCustomUIInput: (slotId: string, input: import('@pi-web-ui/shared').CustomUIInputEvent) => void;

  // Config
  updateAllowedRoots: (roots: string[]) => void;

  // Session management
  exportHtml: (slotId: string) => void;
  setSessionName: (slotId: string, name: string) => void;

  // New features
  // Session tree navigation
  getSessionTree: (slotId: string) => void;
  navigateTree: (slotId: string, targetId: string, summarize?: boolean) => void;
  
  // Copy last assistant text
  copyLastAssistant: (slotId: string) => void;
  
  // Queued messages
  getQueuedMessages: (slotId: string) => void;
  clearQueue: (slotId: string) => void;
  
  // Scoped models
  getScopedModels: (slotId: string) => void;
  setScopedModels: (slotId: string, models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) => void;
  
  // File listing for @ reference
  listFiles: (query?: string, limit?: number, requestId?: string) => void;
  // Workspace directory listing (file tree)
  listWorkspaceEntries: (workspaceId: string, path?: string, requestId?: string) => void;
  // Workspace file read (file preview)
  readWorkspaceFile: (workspaceId: string, path: string, requestId?: string) => void;
  getGitStatus: (workspaceId: string, requestId?: string) => void;
  getFileDiff: (workspaceId: string, path: string, requestId?: string) => void;
  
  // Bash execution
  executeBash: (slotId: string, command: string, excludeFromContext?: boolean) => void;
}

const DEFAULT_SIDEBAR_WIDTH = 52; // Narrow sidebar per mockup

function createEmptySlot(slotId: string): SessionSlotState {
  return {
    slotId,
    state: null,
    messages: [],
    commands: [],
    isStreaming: false,
    streamingText: '',
    streamingThinking: '',
    activeToolExecutions: [],
    bashExecution: null,
    questionnaireRequest: null,
    extensionUIRequest: null,
    customUIState: null,
  };
}

export function useWorkspaces(url: string): UseWorkspacesReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const hasRestoredWorkspacesRef = useRef(false);
  const connectionIdRef = useRef(0);
  const pendingStreamingUpdatesRef = useRef<Record<string, { textDelta: string; thinkingDelta: string }>>({});
  const streamingFlushScheduledRef = useRef(false);
  
  const persistedUIStateRef = useRef<UIState | null>(null);
  const pendingWorkspaceCountRef = useRef(0);
  const [restorationComplete, setRestorationComplete] = useState(false);
  const restoredSessionsRef = useRef<Set<string>>(new Set());

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [allowedRoots, setAllowedRoots] = useState<string[]>([]);
  const [homeDirectory, setHomeDirectory] = useState<string>('');
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('pi-recent-workspaces');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [themeId, setThemeIdState] = useState<string | null>(null);
  const [rightPaneByWorkspace, setRightPaneByWorkspace] = useState<Record<string, boolean>>({});
  const [paneTabsByWorkspace, setPaneTabsByWorkspace] = useState<Record<string, PaneTabPageState[]>>({});
  const [activePaneTabByWorkspace, setActivePaneTabByWorkspace] = useState<Record<string, string>>({});
  const [deployState, setDeployState] = useState<DeployState>({ status: 'idle', message: null });
  
  const workspacesRef = useRef<WorkspaceState[]>([]);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const restorationCompleteRef = useRef(false);
  const paneTabsByWorkspaceRef = useRef<Record<string, PaneTabPageState[]>>({});
  const activePaneTabByWorkspaceRef = useRef<Record<string, string>>({});
  const sessionSlotRequestsRef = useRef<Record<string, Set<string>>>({});
  
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);
  useEffect(() => { restorationCompleteRef.current = restorationComplete; }, [restorationComplete]);
  useEffect(() => { paneTabsByWorkspaceRef.current = paneTabsByWorkspace; }, [paneTabsByWorkspace]);
  useEffect(() => { activePaneTabByWorkspaceRef.current = activePaneTabByWorkspace; }, [activePaneTabByWorkspace]);

  const [currentBrowsePath, setCurrentBrowsePath] = useState('/');
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([]);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Persist open workspaces
  useEffect(() => {
    if (!restorationComplete || !isConnected) return;
    const paths = workspaces.map((ws) => ws.path);
    send({ type: 'saveUIState', state: { openWorkspaces: paths } });
  }, [workspaces, isConnected, restorationComplete, send]);

  // Persist active workspace
  useEffect(() => {
    if (!restorationComplete || !isConnected) return;
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
    if (activeWs) {
      send({ type: 'saveUIState', state: { activeWorkspacePath: activeWs.path } });
    }
  }, [activeWorkspaceId, workspaces, isConnected, restorationComplete, send]);

  /** Update a specific slot within a workspace */
  const updateSlot = useCallback(
    (workspaceId: string, slotId: string, updates: Partial<SessionSlotState>) => {
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== workspaceId) return ws;
          const slot = ws.slots[slotId] || createEmptySlot(slotId);
          return {
            ...ws,
            slots: {
              ...ws.slots,
              [slotId]: { ...slot, ...updates },
            },
          };
        })
      );
    },
    []
  );

  /** Update workspace-level data (sessions, models) */
  const updateWorkspace = useCallback(
    (workspaceId: string, updates: Partial<Omit<WorkspaceState, 'slots'>>) => {
      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === workspaceId ? { ...ws, ...updates } : ws))
      );
    },
    []
  );

  const flushStreamingUpdates = useCallback(() => {
    streamingFlushScheduledRef.current = false;
    const pending = pendingStreamingUpdatesRef.current;
    pendingStreamingUpdatesRef.current = {};

    if (Object.keys(pending).length === 0) return;

    setWorkspaces((prev) =>
      prev.map((ws) => {
        let hasUpdates = false;
        let updatedSlots = ws.slots;

        for (const [key, deltas] of Object.entries(pending)) {
          const [workspaceId, slotId] = key.split(':');
          if (workspaceId !== ws.id) continue;
          const slot = ws.slots[slotId];
          if (!slot) continue;

          if (deltas.textDelta || deltas.thinkingDelta) {
            if (!hasUpdates) {
              updatedSlots = { ...ws.slots };
              hasUpdates = true;
            }
            updatedSlots[slotId] = {
              ...slot,
              streamingText: slot.streamingText + deltas.textDelta,
              streamingThinking: slot.streamingThinking + deltas.thinkingDelta,
            };
          }
        }

        return hasUpdates ? { ...ws, slots: updatedSlots } : ws;
      })
    );
  }, []);

  const scheduleStreamingFlush = useCallback(() => {
    if (streamingFlushScheduledRef.current) return;
    streamingFlushScheduledRef.current = true;

    const schedule = typeof window !== 'undefined' && window.requestAnimationFrame
      ? window.requestAnimationFrame
      : (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16);

    schedule(() => flushStreamingUpdates());
  }, [flushStreamingUpdates]);

  const handleEvent = useCallback(
    (event: WsServerEvent) => {
      // Helper to get slotId from event, defaulting to 'default'
      const getSlotId = (e: { sessionSlotId?: string }) => e.sessionSlotId || 'default';

      switch (event.type) {
        case 'connected': {
          setAllowedRoots(event.allowedRoots);
          setHomeDirectory(event.homeDirectory);
          const uiState = event.uiState;
          persistedUIStateRef.current = uiState;
          setDraftInputs(uiState?.draftInputs || {});
          setSidebarWidthState(uiState?.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState?.themeId ?? null);
          setRightPaneByWorkspace(uiState?.rightPaneByWorkspace || {});
          setPaneTabsByWorkspace(uiState?.paneTabsByWorkspace || {});
          setActivePaneTabByWorkspace(uiState?.activePaneTabByWorkspace || {});
          send({ type: 'browseDirectory' });
          
          if (!hasRestoredWorkspacesRef.current) {
            hasRestoredWorkspacesRef.current = true;
            const openWorkspaces = uiState?.openWorkspaces || [];
            pendingWorkspaceCountRef.current = openWorkspaces.length;
            if (openWorkspaces.length > 0) {
              openWorkspaces.forEach((path) => {
                send({ type: 'openWorkspace', path });
              });
            } else {
              setRestorationComplete(true);
            }
          }
          break;
        }

        case 'uiState': {
          const uiState = event.state;
          persistedUIStateRef.current = uiState;
          setDraftInputs(uiState.draftInputs || {});
          setSidebarWidthState(uiState.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState.themeId);
          setRightPaneByWorkspace(uiState.rightPaneByWorkspace || {});
          setPaneTabsByWorkspace(uiState.paneTabsByWorkspace || {});
          setActivePaneTabByWorkspace(uiState.activePaneTabByWorkspace || {});
          break;
        }

        case 'workspaceOpened': {
          if (pendingWorkspaceCountRef.current > 0) {
            pendingWorkspaceCountRef.current--;
            if (pendingWorkspaceCountRef.current === 0) {
              setRestorationComplete(true);
            }
          }
          
          // Update recent workspaces
          setRecentWorkspaces((prev) => {
            const filtered = prev.filter((p) => p !== event.workspace.path);
            const updated = [event.workspace.path, ...filtered].slice(0, 10);
            try {
              localStorage.setItem('pi-recent-workspaces', JSON.stringify(updated));
            } catch { /* ignore */ }
            return updated;
          });
          
          const defaultSlot = createEmptySlot('default');
          defaultSlot.state = event.state;
          defaultSlot.messages = event.messages;
          
          const newWorkspace: WorkspaceState = {
            id: event.workspace.id,
            path: event.workspace.path,
            name: event.workspace.name,
            slots: { default: defaultSlot },
            sessions: [],
            models: [],
            startupInfo: event.startupInfo,
          };
          
          setWorkspaces((prev) => {
            if (prev.some((ws) => ws.id === newWorkspace.id)) {
              return prev.map((ws) =>
                ws.id === newWorkspace.id ? newWorkspace : ws
              );
            }
            return [...prev, newWorkspace];
          });
          
          const activeWorkspacePath = persistedUIStateRef.current?.activeWorkspacePath;
          setActiveWorkspaceId((current) => {
            if (current === null || event.workspace.path === activeWorkspacePath) {
              return event.workspace.id;
            }
            return current;
          });
          
          send({ type: 'getSessions', workspaceId: event.workspace.id });
          send({ type: 'getModels', workspaceId: event.workspace.id });
          send({ type: 'getCommands', workspaceId: event.workspace.id, sessionSlotId: 'default' });
          break;
        }

        case 'workspaceClosed':
          setWorkspaces((prev) => prev.filter((ws) => ws.id !== event.workspaceId));
          setActiveWorkspaceId((current) =>
            current === event.workspaceId ? null : current
          );
          break;

        case 'directoryList':
          setCurrentBrowsePath(event.path);
          setDirectoryEntries(event.entries);
          if (event.allowedRoots) {
            setAllowedRoots(event.allowedRoots);
          }
          break;

        // Session slot events
        case 'sessionSlotCreated': {
          const newSlot = createEmptySlot(event.sessionSlotId);
          newSlot.state = event.state;
          newSlot.messages = event.messages;
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              
              // Copy commands from an existing slot if available (faster than waiting for server)
              const existingSlot = Object.values(ws.slots)[0];
              if (existingSlot?.commands?.length > 0) {
                newSlot.commands = existingSlot.commands;
              }
              
              return { ...ws, slots: { ...ws.slots, [event.sessionSlotId]: newSlot } };
            })
          );
          const requested = sessionSlotRequestsRef.current[event.workspaceId];
          if (requested) {
            requested.delete(event.sessionSlotId);
          }
          // Also fetch commands for the new slot (in case they've changed)
          send({ type: 'getCommands', workspaceId: event.workspaceId, sessionSlotId: event.sessionSlotId });
          break;
        }

        case 'sessionSlotClosed': {
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const { [event.sessionSlotId]: _, ...remainingSlots } = ws.slots;
              return { ...ws, slots: remainingSlots };
            })
          );
          const requested = sessionSlotRequestsRef.current[event.workspaceId];
          if (requested) {
            requested.delete(event.sessionSlotId);
          }
          break;
        }

        case 'sessionSlotsList': {
          const workspace = workspacesRef.current.find((ws) => ws.id === event.workspaceId);
          if (!workspace) break;
          const requested = sessionSlotRequestsRef.current[event.workspaceId] || new Set<string>();
          sessionSlotRequestsRef.current[event.workspaceId] = requested;
          event.slots.forEach((slotInfo) => {
            if (workspace.slots[slotInfo.slotId]) return;
            if (requested.has(slotInfo.slotId)) return;
            requested.add(slotInfo.slotId);
            send({ type: 'createSessionSlot', workspaceId: event.workspaceId, slotId: slotInfo.slotId });
          });
          break;
        }

        // Slot-scoped state events
        case 'state': {
          const slotId = getSlotId(event);
          // Sync isStreaming from server state - this is the authoritative source for streaming status
          const updates: Partial<SessionSlotState> = { state: event.state };
          if (event.state.isStreaming) {
            // Server says streaming - set isStreaming but keep any existing streaming content
            updates.isStreaming = true;
          } else {
            // Server says not streaming - clear streaming state completely
            updates.isStreaming = false;
            updates.streamingText = '';
            updates.streamingThinking = '';
          }
          updateSlot(event.workspaceId, slotId, updates);
          break;
        }

        case 'messages': {
          const slotId = getSlotId(event);
          // When messages are replaced (e.g., newSession, switchSession), clear stale streaming content
          // but DO NOT override isStreaming - that's controlled by the 'state' event which has the
          // authoritative value from the server. This fixes the bug where reloading a running session
          // would incorrectly show the input as idle.
          updateSlot(event.workspaceId, slotId, { 
            messages: event.messages,
            // isStreaming: NOT set here - let 'state' event control this
            streamingText: '',
            streamingThinking: '',
            activeToolExecutions: [],
            bashExecution: null,
          });
          break;
        }

        case 'commands': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, { commands: event.commands });
          break;
        }

        // Workspace-level events
        case 'sessions':
          updateWorkspace(event.workspaceId, { sessions: event.sessions });
          break;

        case 'models':
          updateWorkspace(event.workspaceId, { models: event.models });
          break;

        // Streaming events (slot-scoped)
        case 'agentStart': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, {
            isStreaming: true,
            streamingText: '',
            streamingThinking: '',
          });
          break;
        }

        case 'agentEnd': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, {
            isStreaming: false,
            streamingText: '',
            streamingThinking: '',
            activeToolExecutions: [],
          });
          send({ type: 'getState', workspaceId: event.workspaceId, sessionSlotId: slotId });
          break;
        }

        case 'messageStart': {
          const slotId = getSlotId(event);
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    messages: [...slot.messages, event.message],
                  },
                },
              };
            })
          );
          break;
        }

        case 'messageUpdate': {
          const slotId = getSlotId(event);
          const key = `${event.workspaceId}:${slotId}`;
          const pending = pendingStreamingUpdatesRef.current[key] || { textDelta: '', thinkingDelta: '' };

          if (event.update.type === 'textDelta' && event.update.delta) {
            pending.textDelta += event.update.delta;
          } else if (event.update.type === 'thinkingDelta' && event.update.delta) {
            pending.thinkingDelta += event.update.delta;
          }

          pendingStreamingUpdatesRef.current[key] = pending;
          scheduleStreamingFlush();
          break;
        }

        case 'messageEnd': {
          const slotId = getSlotId(event);
          const key = `${event.workspaceId}:${slotId}`;
          delete pendingStreamingUpdatesRef.current[key];
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              
              // Extract tool call IDs from the completed message to remove from activeToolExecutions
              const completedToolIds = new Set(
                event.message.content
                  .filter((c) => c.type === 'toolCall')
                  .map((c) => (c as { id: string }).id)
              );
              
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    messages: slot.messages.map((m) =>
                      m.id === event.message.id ? event.message : m
                    ),
                    streamingText: '',
                    streamingThinking: '',
                    // Remove completed tool calls from active executions
                    activeToolExecutions: slot.activeToolExecutions.filter(
                      (t) => !completedToolIds.has(t.toolCallId)
                    ),
                  },
                },
              };
            })
          );
          break;
        }

        case 'toolStart': {
          const slotId = getSlotId(event);
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    activeToolExecutions: [
                      ...slot.activeToolExecutions,
                      {
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        args: event.args,
                        status: 'running' as const,
                      },
                    ],
                  },
                },
              };
            })
          );
          break;
        }

        case 'toolUpdate': {
          const slotId = getSlotId(event);
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    activeToolExecutions: slot.activeToolExecutions.map((t) =>
                      t.toolCallId === event.toolCallId
                        ? { ...t, result: event.partialResult }
                        : t
                    ),
                  },
                },
              };
            })
          );
          break;
        }

        case 'toolEnd': {
          const slotId = getSlotId(event);
          // Remove completed tool from activeToolExecutions - it's now in the message content
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    activeToolExecutions: slot.activeToolExecutions.filter(
                      (t) => t.toolCallId !== event.toolCallId
                    ),
                  },
                },
              };
            })
          );
          break;
        }

        case 'compactionEnd': {
          const slotId = getSlotId(event);
          send({ type: 'getMessages', workspaceId: event.workspaceId, sessionSlotId: slotId });
          send({ type: 'getState', workspaceId: event.workspaceId, sessionSlotId: slotId });
          break;
        }

        case 'forkResult': {
          // Fork completed - refresh state and messages
          if (event.success) {
            const slotId = event.sessionSlotId || 'default';
            send({ type: 'getState', workspaceId: event.workspaceId, sessionSlotId: slotId });
            send({ type: 'getMessages', workspaceId: event.workspaceId, sessionSlotId: slotId });
            send({ type: 'getSessions', workspaceId: event.workspaceId });
          }
          break;
        }

        case 'forkMessages': {
          // Fork messages received - emit via custom event for dialog to handle
          const customEvent = new CustomEvent('pi:forkMessages', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              messages: event.messages,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'questionnaireRequest': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, {
            questionnaireRequest: {
              toolCallId: event.toolCallId,
              questions: event.questions,
            },
          });
          break;
        }

        // New feature events
        case 'sessionTree': {
          const customEvent = new CustomEvent('pi:sessionTree', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              tree: event.tree,
              currentLeafId: event.currentLeafId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'navigateTreeResult': {
          const customEvent = new CustomEvent('pi:navigateTreeResult', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              success: event.success,
              editorText: event.editorText,
              error: event.error,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'copyResult': {
          const customEvent = new CustomEvent('pi:copyResult', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              success: event.success,
              text: event.text,
              error: event.error,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'queuedMessages': {
          console.log(`[useWorkspaces] Received queuedMessages - workspaceId: ${event.workspaceId}, slotId: ${event.sessionSlotId}`);
          console.log(`[useWorkspaces] steering: ${JSON.stringify(event.steering)}, followUp: ${JSON.stringify(event.followUp)}`);
          const customEvent = new CustomEvent('pi:queuedMessages', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              steering: event.steering,
              followUp: event.followUp,
            },
          });
          window.dispatchEvent(customEvent);
          console.log(`[useWorkspaces] Dispatched pi:queuedMessages event`);
          break;
        }

        case 'scopedModels': {
          const customEvent = new CustomEvent('pi:scopedModels', {
            detail: {
              workspaceId: event.workspaceId,
              sessionSlotId: event.sessionSlotId,
              models: event.models,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'fileList': {
          const customEvent = new CustomEvent('pi:fileList', {
            detail: {
              workspaceId: event.workspaceId,
              files: event.files,
              requestId: event.requestId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'workspaceEntries': {
          const customEvent = new CustomEvent('pi:workspaceEntries', {
            detail: {
              workspaceId: event.workspaceId,
              path: event.path,
              entries: event.entries,
              requestId: event.requestId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'gitStatus': {
          const customEvent = new CustomEvent('pi:gitStatus', {
            detail: {
              workspaceId: event.workspaceId,
              files: event.files,
              requestId: event.requestId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'fileDiff': {
          const customEvent = new CustomEvent('pi:fileDiff', {
            detail: {
              workspaceId: event.workspaceId,
              path: event.path,
              diff: event.diff,
              requestId: event.requestId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'workspaceFile': {
          const customEvent = new CustomEvent('pi:workspaceFile', {
            detail: {
              workspaceId: event.workspaceId,
              path: event.path,
              content: event.content,
              truncated: event.truncated,
              requestId: event.requestId,
            },
          });
          window.dispatchEvent(customEvent);
          break;
        }

        case 'extensionUIRequest': {
          const slotId = getSlotId(event);
          const request = event.request.method === 'notify' ? null : event.request;
          updateSlot(event.workspaceId, slotId, { extensionUIRequest: request });
          break;
        }

        // Custom UI events (for ctx.ui.custom())
        case 'customUIStart': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, { customUIState: event.state });
          break;
        }

        case 'customUIUpdate': {
          const slotId = getSlotId(event);
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot?.customUIState || slot.customUIState.sessionId !== event.sessionId) {
                return ws;
              }
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    customUIState: {
                      ...slot.customUIState,
                      root: event.root,
                    },
                  },
                },
              };
            })
          );
          break;
        }

        case 'customUIClose': {
          const slotId = getSlotId(event);
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot?.customUIState || slot.customUIState.sessionId !== event.sessionId) {
                return ws;
              }
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    customUIState: null,
                  },
                },
              };
            })
          );
          break;
        }

        // Bash execution events (! and !! commands)
        case 'bashStart': {
          const slotId = event.sessionSlotId || 'default';
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId] || createEmptySlot(slotId);
              const exclude = event.excludeFromContext ?? false;
              let messageId = slot.bashExecution?.messageId;
              let messages = slot.messages;
              let output = '';

              if (messageId) {
                const existingIndex = messages.findIndex((msg) => msg.id === messageId);
                if (existingIndex >= 0) {
                  const existing = messages[existingIndex];
                  output = typeof existing.output === 'string' ? existing.output : '';
                  const updatedMessage: ChatMessage = {
                    ...existing,
                    role: 'bashExecution',
                    command: event.command,
                    output,
                    exitCode: null,
                    cancelled: false,
                    truncated: false,
                    excludeFromContext: exclude,
                    isError: false,
                  };
                  messages = [...messages];
                  messages[existingIndex] = updatedMessage;
                } else {
                  output = '';
                  const bashMessage: ChatMessage = {
                    id: messageId,
                    role: 'bashExecution',
                    timestamp: Date.now(),
                    content: [],
                    command: event.command,
                    output,
                    exitCode: null,
                    cancelled: false,
                    truncated: false,
                    excludeFromContext: exclude,
                    isError: false,
                  };
                  messages = [...messages, bashMessage];
                }
              } else {
                messageId = `bash-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                const bashMessage: ChatMessage = {
                  id: messageId,
                  role: 'bashExecution',
                  timestamp: Date.now(),
                  content: [],
                  command: event.command,
                  output: '',
                  exitCode: null,
                  cancelled: false,
                  truncated: false,
                  excludeFromContext: exclude,
                  isError: false,
                };
                messages = [...messages, bashMessage];
              }

              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    messages,
                    bashExecution: {
                      messageId,
                      command: event.command,
                      output,
                      isRunning: true,
                      excludeFromContext: exclude,
                    },
                  },
                },
              };
            })
          );
          break;
        }

        case 'bashOutput': {
          const slotId = event.sessionSlotId || 'default';
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot || !slot.bashExecution) return ws;
              const messageId = slot.bashExecution.messageId;

              const messages: ChatMessage[] = slot.messages.map((msg) => {
                if (msg.id !== messageId) return msg;
                const currentOutput = typeof msg.output === 'string' ? msg.output : '';
                return { ...msg, output: currentOutput + event.chunk } as ChatMessage;
              });

              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    messages,
                    bashExecution: {
                      ...slot.bashExecution,
                      output: slot.bashExecution.output + event.chunk,
                    },
                  },
                },
              };
            })
          );
          break;
        }

        case 'bashEnd': {
          const slotId = event.sessionSlotId || 'default';
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot || !slot.bashExecution) return ws;

              const bashExecution = slot.bashExecution;
              const output = bashExecution.output.length > 0
                ? bashExecution.output
                : [event.result.stdout, event.result.stderr].filter(Boolean).join('');
              const exitCode = event.result.exitCode;
              const isError = (exitCode !== null && exitCode !== 0) || Boolean(event.result.stderr);
              const cancelled = event.result.signal !== null || event.result.timedOut;
              const messageId = bashExecution.messageId;

              let messages: ChatMessage[] = slot.messages.map((msg) => {
                if (msg.id !== messageId) return msg;
                return {
                  ...msg,
                  role: 'bashExecution' as const,
                  command: bashExecution.command,
                  output,
                  exitCode,
                  cancelled,
                  truncated: event.result.truncated,
                  excludeFromContext: bashExecution.excludeFromContext,
                  isError,
                } as ChatMessage;
              });

              if (!messages.some((msg) => msg.id === messageId)) {
                const bashMessage: ChatMessage = {
                  id: messageId,
                  role: 'bashExecution',
                  timestamp: Date.now(),
                  content: [],
                  command: bashExecution.command,
                  output,
                  exitCode,
                  cancelled,
                  truncated: event.result.truncated,
                  excludeFromContext: bashExecution.excludeFromContext,
                  isError,
                };
                messages = [...messages, bashMessage];
              }

              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    messages,
                    bashExecution: null,
                  },
                },
              };
            })
          );
          break;
        }

        case 'error':
          setError(event.message);
          break;

        case 'deployStatus':
          setDeployState({
            status: event.status,
            message: event.message || null,
          });
          break;
      }
    },
    [send, updateSlot, updateWorkspace]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    connectionIdRef.current++;
    const thisConnectionId = connectionIdRef.current;
    
    setIsConnecting(true);
    setError(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      setDeployState({ status: 'idle', message: null });
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      hasRestoredWorkspacesRef.current = false;
      restoredSessionsRef.current = new Set();
      setRestorationComplete(false);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onmessage = (event) => {
      if (connectionIdRef.current !== thisConnectionId) return;
      try {
        const data: WsServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }, [url, handleEvent]);

  useEffect(() => {
    let mounted = true;
    const doConnect = () => {
      if (!mounted) return;
      connect();
    };
    doConnect();

    return () => {
      mounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      hasRestoredWorkspacesRef.current = false;
      restoredSessionsRef.current = new Set();
    };
  }, [connect]);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) || null;

  const withActiveWorkspace = useCallback(
    (action: (workspaceId: string) => void) => {
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) {
        setError('No active workspace');
        return;
      }
      action(wsId);
    },
    []
  );

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
    send({ type: 'setSidebarWidth', width });
  }, [send]);

  const setThemeId = useCallback((id: string | null) => {
    setThemeIdState(id);
    send({ type: 'setTheme', themeId: id });
  }, [send]);

  const setWorkspaceRightPaneOpen = useCallback((workspacePath: string, isOpen: boolean) => {
    setRightPaneByWorkspace((prev) => {
      const next = { ...prev };
      if (isOpen) {
        next[workspacePath] = true;
      } else {
        delete next[workspacePath];
      }
      send({ type: 'saveUIState', state: { rightPaneByWorkspace: next } });
      return next;
    });
  }, [send]);

  const setPaneTabsForWorkspace = useCallback((workspacePath: string, tabs: PaneTabPageState[], activeTabId: string) => {
    const nextTabs = { ...paneTabsByWorkspaceRef.current, [workspacePath]: tabs };
    const nextActive = { ...activePaneTabByWorkspaceRef.current, [workspacePath]: activeTabId };
    paneTabsByWorkspaceRef.current = nextTabs;
    activePaneTabByWorkspaceRef.current = nextActive;
    setPaneTabsByWorkspace(nextTabs);
    setActivePaneTabByWorkspace(nextActive);
    send({ type: 'saveUIState', state: { paneTabsByWorkspace: nextTabs, activePaneTabByWorkspace: nextActive } });
  }, [send]);

  const setDraftInput = useCallback((workspacePath: string, value: string) => {
    setDraftInputs((prev) => ({ ...prev, [workspacePath]: value }));
    send({ type: 'setDraftInput', workspacePath, value });
  }, [send]);

  const getSlot = useCallback((slotId: string): SessionSlotState | null => {
    const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceIdRef.current);
    return ws?.slots[slotId] || null;
  }, []);

  return {
    isConnected,
    isConnecting,
    error,

    deployState,

    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    allowedRoots,
    homeDirectory,
    recentWorkspaces,

    currentBrowsePath,
    directoryEntries,
    browseDirectory: (path?: string) => send({ type: 'browseDirectory', path }),

    openWorkspace: (path: string) => send({ type: 'openWorkspace', path }),
    closeWorkspace: (workspaceId: string) => send({ type: 'closeWorkspace', workspaceId }),
    setActiveWorkspace: setActiveWorkspaceId,

    // Session slot management
    createSessionSlot: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'createSessionSlot', workspaceId, slotId })
      ),
    createSessionSlotForWorkspace: (workspaceId: string, slotId: string) =>
      send({ type: 'createSessionSlot', workspaceId, slotId }),
    closeSessionSlot: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'closeSessionSlot', workspaceId, sessionSlotId: slotId })
      ),
    closeSessionSlotForWorkspace: (workspaceId: string, slotId: string) =>
      send({ type: 'closeSessionSlot', workspaceId, sessionSlotId: slotId }),
    listSessionSlots: (workspaceId: string) =>
      send({ type: 'listSessionSlots', workspaceId }),
    getSlot,

    sidebarWidth,
    setSidebarWidth,
    themeId,
    setThemeId,
    rightPaneByWorkspace,
    setWorkspaceRightPaneOpen,
    paneTabsByWorkspace,
    activePaneTabByWorkspace,
    setPaneTabsForWorkspace,

    getDraftInput: (workspacePath: string) => draftInputs[workspacePath] || '',
    setDraftInput,

    // Slot-scoped actions
    sendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'prompt', workspaceId, sessionSlotId: slotId, message, images })
      ),
    steer: (slotId: string, message: string, images?: ImageAttachment[]) =>
      withActiveWorkspace((workspaceId) => {
        console.log(`[useWorkspaces.steer] Sending steer - workspaceId: ${workspaceId}, slotId: ${slotId}, message: "${message?.substring(0, 50)}"`);
        send({ type: 'steer', workspaceId, sessionSlotId: slotId, message, images });
      }),
    followUp: (slotId: string, message: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'followUp', workspaceId, sessionSlotId: slotId, message })
      ),
    abort: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'abort', workspaceId, sessionSlotId: slotId })
      ),
    setModel: (slotId: string, provider: string, modelId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setModel', workspaceId, sessionSlotId: slotId, provider, modelId })
      ),
    setThinkingLevel: (slotId: string, level: ThinkingLevel) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setThinkingLevel', workspaceId, sessionSlotId: slotId, level })
      ),
    newSession: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'newSession', workspaceId, sessionSlotId: slotId })
      ),
    switchSession: (slotId: string, sessionId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'switchSession', workspaceId, sessionSlotId: slotId, sessionId })
      ),
    compact: (slotId: string, customInstructions?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'compact', workspaceId, sessionSlotId: slotId, customInstructions })
      ),
    refreshSessions: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getSessions', workspaceId })
      ),
    refreshModels: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getModels', workspaceId })
      ),
    refreshCommands: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getCommands', workspaceId, sessionSlotId: slotId })
      ),
    deploy: () => {
      setDeployState({ status: 'building', message: 'Starting rebuild...' });
      send({ type: 'deploy' });
    },

    // Fork actions
    fork: (slotId: string, entryId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'fork', workspaceId, sessionSlotId: slotId, entryId })
      ),
    getForkMessages: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getForkMessages', workspaceId, sessionSlotId: slotId })
      ),

    // Questionnaire
    sendQuestionnaireResponse: (slotId: string, toolCallId: string, response: string) =>
      withActiveWorkspace((workspaceId) => {
        try {
          const parsed = JSON.parse(response);
          updateSlot(workspaceId, slotId, { questionnaireRequest: null });
          send({ 
            type: 'questionnaireResponse', 
            workspaceId, 
            sessionSlotId: slotId, 
            toolCallId,
            answers: parsed.answers || [],
            cancelled: parsed.cancelled || false,
          });
        } catch {
          console.error('Failed to parse questionnaire response');
        }
      }),

    // Extension UI
    sendExtensionUIResponse: (slotId: string, response: { requestId: string; cancelled: boolean; value?: string | boolean }) =>
      withActiveWorkspace((workspaceId) => {
        updateSlot(workspaceId, slotId, { extensionUIRequest: null });
        send({ 
          type: 'extensionUIResponse', 
          workspaceId, 
          sessionSlotId: slotId,
          response,
        });
      }),

    // Custom UI (for ctx.ui.custom())
    sendCustomUIInput: (slotId: string, input: import('@pi-web-ui/shared').CustomUIInputEvent) =>
      withActiveWorkspace((workspaceId) =>
        send({
          type: 'customUIInput',
          workspaceId,
          sessionSlotId: slotId,
          input,
        })
      ),

    // Config
    updateAllowedRoots: (roots: string[]) => {
      send({ type: 'updateAllowedRoots', roots });
      setAllowedRoots(roots);
    },

    // Session management
    exportHtml: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'exportHtml', workspaceId, sessionSlotId: slotId })
      ),
    setSessionName: (slotId: string, name: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setSessionName', workspaceId, sessionSlotId: slotId, name })
      ),

    // New features
    // Session tree navigation
    getSessionTree: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getSessionTree', workspaceId, sessionSlotId: slotId })
      ),
    navigateTree: (slotId: string, targetId: string, summarize?: boolean) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'navigateTree', workspaceId, sessionSlotId: slotId, targetId, summarize })
      ),
    
    // Copy last assistant text
    copyLastAssistant: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'copyLastAssistant', workspaceId, sessionSlotId: slotId })
      ),
    
    // Queued messages
    getQueuedMessages: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getQueuedMessages', workspaceId, sessionSlotId: slotId })
      ),
    clearQueue: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'clearQueue', workspaceId, sessionSlotId: slotId })
      ),
    
    // Scoped models
    getScopedModels: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getScopedModels', workspaceId, sessionSlotId: slotId })
      ),
    setScopedModels: (slotId: string, models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setScopedModels', workspaceId, sessionSlotId: slotId, models })
      ),
    
    // File listing for @ reference
    listFiles: (query?: string, limit?: number, requestId?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'listFiles', workspaceId, query, limit, requestId })
      ),

    // Workspace directory listing (file tree)
    listWorkspaceEntries: (workspaceId: string, path?: string, requestId?: string) =>
      send({ type: 'listWorkspaceEntries', workspaceId, path, requestId }),

    // Workspace file read (file preview)
    readWorkspaceFile: (workspaceId: string, path: string, requestId?: string) =>
      send({ type: 'readWorkspaceFile', workspaceId, path, requestId }),
    getGitStatus: (workspaceId: string, requestId?: string) =>
      send({ type: 'getGitStatus', workspaceId, requestId }),
    getFileDiff: (workspaceId: string, path: string, requestId?: string) =>
      send({ type: 'getFileDiff', workspaceId, path, requestId }),
    
    // Bash execution
    executeBash: (slotId: string, command: string, excludeFromContext?: boolean) =>
      withActiveWorkspace((workspaceId) => {
        const exclude = excludeFromContext ?? false;
        const messageId = `bash-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timestamp = Date.now();
        const bashMessage: ChatMessage = {
          id: messageId,
          role: 'bashExecution',
          timestamp,
          content: [],
          command,
          output: '',
          exitCode: null,
          cancelled: false,
          truncated: false,
          excludeFromContext: exclude,
          isError: false,
        };

        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (ws.id !== workspaceId) return ws;
            const slot = ws.slots[slotId] || createEmptySlot(slotId);
            return {
              ...ws,
              slots: {
                ...ws.slots,
                [slotId]: {
                  ...slot,
                  messages: [...slot.messages, bashMessage],
                  bashExecution: {
                    messageId,
                    command,
                    output: '',
                    isRunning: true,
                    excludeFromContext: exclude,
                  },
                },
              },
            };
          })
        );
        // Pi SDK handles the context inclusion - just pass the flag
        send({ type: 'bash', workspaceId, sessionSlotId: slotId, command, excludeFromContext: exclude });
      }),
  };
}
