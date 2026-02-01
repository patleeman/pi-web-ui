import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  DirectoryEntry,
  ModelInfo,
  SessionInfo,
  SessionState,
  SlashCommand,
  ThinkingLevel,
  UIState,
  WsClientMessage,
  WsServerEvent,
  ImageAttachment,
} from '@pi-web-ui/shared';

interface ToolExecution {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
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
}

export interface UseWorkspacesReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Workspace management
  workspaces: WorkspaceState[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceState | null;
  allowedRoots: string[];

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
  closeSessionSlot: (slotId: string) => void;
  getSlot: (slotId: string) => SessionSlotState | null;

  // UI State (persisted to backend)
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  themeId: string | null;
  setThemeId: (themeId: string | null) => void;

  // Draft input persistence
  getDraftInput: (workspacePath: string) => string;
  setDraftInput: (workspacePath: string, value: string) => void;

  // Session actions (operate on active workspace, specific slot)
  sendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  steer: (slotId: string, message: string) => void;
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
  };
}

export function useWorkspaces(url: string): UseWorkspacesReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const hasRestoredWorkspacesRef = useRef(false);
  const connectionIdRef = useRef(0);
  
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
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [themeId, setThemeIdState] = useState<string | null>(null);
  
  const workspacesRef = useRef<WorkspaceState[]>([]);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const restorationCompleteRef = useRef(false);
  
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);
  useEffect(() => { restorationCompleteRef.current = restorationComplete; }, [restorationComplete]);

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

  const handleEvent = useCallback(
    (event: WsServerEvent) => {
      // Helper to get slotId from event, defaulting to 'default'
      const getSlotId = (e: { sessionSlotId?: string }) => e.sessionSlotId || 'default';

      switch (event.type) {
        case 'connected': {
          setAllowedRoots(event.allowedRoots);
          const uiState = event.uiState;
          persistedUIStateRef.current = uiState;
          setDraftInputs(uiState?.draftInputs || {});
          setSidebarWidthState(uiState?.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState?.themeId ?? null);
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
          break;
        }

        case 'workspaceOpened': {
          if (pendingWorkspaceCountRef.current > 0) {
            pendingWorkspaceCountRef.current--;
            if (pendingWorkspaceCountRef.current === 0) {
              setRestorationComplete(true);
            }
          }
          
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
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? { ...ws, slots: { ...ws.slots, [event.sessionSlotId]: newSlot } }
                : ws
            )
          );
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
          break;
        }

        // Slot-scoped state events
        case 'state': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, { state: event.state });
          break;
        }

        case 'messages': {
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, { messages: event.messages });
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
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot) return ws;
              
              let updates: Partial<SessionSlotState> = {};
              if (event.update.type === 'textDelta' && event.update.delta) {
                updates.streamingText = slot.streamingText + event.update.delta;
              } else if (event.update.type === 'thinkingDelta' && event.update.delta) {
                updates.streamingThinking = slot.streamingThinking + event.update.delta;
              }
              
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: { ...slot, ...updates },
                },
              };
            })
          );
          break;
        }

        case 'messageEnd': {
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
                    messages: slot.messages.map((m) =>
                      m.id === event.message.id ? event.message : m
                    ),
                    streamingText: '',
                    streamingThinking: '',
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
                        ? {
                            ...t,
                            status: event.isError ? ('error' as const) : ('complete' as const),
                            result: event.result,
                            isError: event.isError,
                          }
                        : t
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
          // Store questionnaire request in slot state
          const slotId = event.sessionSlotId || 'default';
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId];
              if (!slot || !slot.state) return ws;
              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    state: {
                      ...slot.state,
                      questionnaireRequest: {
                        toolCallId: event.toolCallId,
                        questions: event.questions,
                      },
                    },
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

    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    allowedRoots,

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
    closeSessionSlot: (slotId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'closeSessionSlot', workspaceId, sessionSlotId: slotId })
      ),
    getSlot,

    sidebarWidth,
    setSidebarWidth,
    themeId,
    setThemeId,

    getDraftInput: (workspacePath: string) => draftInputs[workspacePath] || '',
    setDraftInput,

    // Slot-scoped actions
    sendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'prompt', workspaceId, sessionSlotId: slotId, message, images })
      ),
    steer: (slotId: string, message: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'steer', workspaceId, sessionSlotId: slotId, message })
      ),
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
    deploy: () => send({ type: 'deploy' }),

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
  };
}
