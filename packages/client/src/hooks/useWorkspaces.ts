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

interface WorkspaceState {
  id: string;
  path: string;
  name: string;
  state: SessionState | null;
  messages: ChatMessage[];
  sessions: SessionInfo[];
  models: ModelInfo[];
  commands: SlashCommand[];
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolExecutions: ToolExecution[];
}

interface UseWorkspacesReturn {
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

  // UI State (persisted to backend)
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  themeId: string | null;
  setThemeId: (themeId: string | null) => void;

  // Draft input persistence
  getDraftInput: (workspacePath: string) => string;
  setDraftInput: (workspacePath: string, value: string) => void;

  // Session actions (operate on active workspace)
  sendPrompt: (message: string, images?: ImageAttachment[]) => void;
  steer: (message: string) => void;
  followUp: (message: string) => void;
  abort: () => void;
  setModel: (provider: string, modelId: string) => void;
  setThinkingLevel: (level: ThinkingLevel) => void;
  newSession: () => void;
  switchSession: (sessionId: string) => void;
  compact: (customInstructions?: string) => void;
  refreshSessions: () => void;
  refreshModels: () => void;
  refreshCommands: () => void;
}

const DEFAULT_SIDEBAR_WIDTH = 224;

export function useWorkspaces(url: string): UseWorkspacesReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const hasRestoredWorkspacesRef = useRef(false);
  // Connection ID to track which connection session is current (handles React Strict Mode)
  const connectionIdRef = useRef(0);
  
  // Store the persisted UI state from the server
  const persistedUIStateRef = useRef<UIState | null>(null);
  // Track how many workspaces we're expecting to open (to avoid saving empty state during restoration)
  const pendingWorkspaceCountRef = useRef(0);
  // Track if initial restoration is fully complete (all workspaces opened)
  const [restorationComplete, setRestorationComplete] = useState(false);
  // Track which workspaces have had their sessions restored (to avoid restoring twice)
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
  
  // Refs to access latest state in event handlers (avoids stale closure issues)
  const workspacesRef = useRef<WorkspaceState[]>([]);
  const restorationCompleteRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);
  useEffect(() => { restorationCompleteRef.current = restorationComplete; }, [restorationComplete]);

  const [currentBrowsePath, setCurrentBrowsePath] = useState('/');
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([]);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Persist open workspaces to backend when they change
  // Only save after initial restoration is complete
  useEffect(() => {
    if (!restorationComplete || !isConnected) return;
    const paths = workspaces.map((ws) => ws.path);
    send({ type: 'saveUIState', state: { openWorkspaces: paths } });
  }, [workspaces, isConnected, restorationComplete, send]);

  // Persist active workspace to backend when it changes
  useEffect(() => {
    if (!restorationComplete || !isConnected) return;
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
    if (activeWs) {
      send({ type: 'saveUIState', state: { activeWorkspacePath: activeWs.path } });
    }
  }, [activeWorkspaceId, workspaces, isConnected, restorationComplete, send]);

  const updateWorkspace = useCallback(
    (workspaceId: string, updates: Partial<WorkspaceState>) => {
      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === workspaceId ? { ...ws, ...updates } : ws))
      );
    },
    []
  );

  const handleEvent = useCallback(
    (event: WsServerEvent) => {
      switch (event.type) {
        case 'connected': {
          setAllowedRoots(event.allowedRoots);
          
          // Store persisted UI state from server
          const uiState = event.uiState;
          persistedUIStateRef.current = uiState;
          
          // Apply UI state
          setDraftInputs(uiState?.draftInputs || {});
          setSidebarWidthState(uiState?.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState?.themeId ?? null);
          
          // Request directory listing for initial view
          send({ type: 'browseDirectory' });
          
          // Restore previously open workspaces (only once per session)
          if (!hasRestoredWorkspacesRef.current) {
            hasRestoredWorkspacesRef.current = true;
            const openWorkspaces = uiState?.openWorkspaces || [];
            // Track how many workspaces we're waiting for
            pendingWorkspaceCountRef.current = openWorkspaces.length;
            if (openWorkspaces.length > 0) {
              openWorkspaces.forEach((path) => {
                send({ type: 'openWorkspace', path });
              });
            } else {
              // No workspaces to restore, mark restoration complete immediately
              setRestorationComplete(true);
            }
          }
          break;
        }

        case 'uiState': {
          // Update local state when server confirms UI state changes
          const uiState = event.state;
          persistedUIStateRef.current = uiState;
          setDraftInputs(uiState.draftInputs || {});
          setSidebarWidthState(uiState.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState.themeId);
          break;
        }

        case 'workspaceOpened': {
          // Decrement pending count (for initial restoration tracking)
          if (pendingWorkspaceCountRef.current > 0) {
            pendingWorkspaceCountRef.current--;
            // Mark restoration complete when all workspaces are opened
            if (pendingWorkspaceCountRef.current === 0) {
              setRestorationComplete(true);
            }
          }
          
          const newWorkspace: WorkspaceState = {
            id: event.workspace.id,
            path: event.workspace.path,
            name: event.workspace.name,
            state: event.state,
            messages: event.messages,
            sessions: [],
            models: [],
            commands: [],
            isStreaming: false,
            streamingText: '',
            streamingThinking: '',
            activeToolExecutions: [],
          };
          setWorkspaces((prev) => {
            // Don't add if already exists
            if (prev.some((ws) => ws.id === newWorkspace.id)) {
              return prev.map((ws) =>
                ws.id === newWorkspace.id ? newWorkspace : ws
              );
            }
            return [...prev, newWorkspace];
          });
          
          // Set as active if it matches the persisted active workspace,
          // or if there's no active workspace yet
          const activeWorkspacePath = persistedUIStateRef.current?.activeWorkspacePath;
          setActiveWorkspaceId((current) => {
            if (current === null || event.workspace.path === activeWorkspacePath) {
              return event.workspace.id;
            }
            return current;
          });
          
          // Fetch sessions, models, and commands for this workspace
          send({ type: 'getSessions', workspaceId: event.workspace.id });
          send({ type: 'getModels', workspaceId: event.workspace.id });
          send({ type: 'getCommands', workspaceId: event.workspace.id });
          break;
        }

        case 'workspaceClosed':
          setWorkspaces((prev) =>
            prev.filter((ws) => ws.id !== event.workspaceId)
          );
          setActiveWorkspaceId((current) =>
            current === event.workspaceId ? null : current
          );
          break;

        case 'workspacesList':
          // Update workspace info (doesn't include full state)
          break;

        case 'directoryList':
          setCurrentBrowsePath(event.path);
          setDirectoryEntries(event.entries);
          if (event.allowedRoots) {
            setAllowedRoots(event.allowedRoots);
          }
          break;

        case 'state': {
          // Use ref to get latest workspaces (avoid stale closure)
          const workspace = workspacesRef.current.find((ws) => ws.id === event.workspaceId);
          const previousSessionFile = workspace?.state?.sessionFile;
          const newSessionFile = event.state.sessionFile;
          
          updateWorkspace(event.workspaceId, { state: event.state });
          
          // Persist session change (but only after initial restoration is complete)
          // We save sessionFile (path) because that's what switchSession expects
          if (restorationCompleteRef.current && workspace && newSessionFile && previousSessionFile !== newSessionFile) {
            send({ type: 'setActiveSession', workspacePath: workspace.path, sessionId: newSessionFile });
          }
          break;
        }

        case 'messages':
          updateWorkspace(event.workspaceId, { messages: event.messages });
          break;

        case 'sessions': {
          updateWorkspace(event.workspaceId, { sessions: event.sessions });
          
          // Restore saved active session for this workspace (only once per workspace)
          // Use refs to get latest state (avoid stale closure)
          if (persistedUIStateRef.current && !restoredSessionsRef.current.has(event.workspaceId)) {
            const workspace = workspacesRef.current.find((ws) => ws.id === event.workspaceId);
            if (workspace) {
              // Mark this workspace as having attempted session restore
              restoredSessionsRef.current.add(event.workspaceId);
              
              const activeSessions = persistedUIStateRef.current.activeSessions || {};
              const savedSessionPath = activeSessions[workspace.path];
              const currentSessionFile = workspace.state?.sessionFile;
              
              // If we have a saved session that's different from current, and it exists in the sessions list
              // Note: We save/restore by path since that's what switchSession expects
              if (savedSessionPath && savedSessionPath !== currentSessionFile) {
                const sessionExists = event.sessions.some((s) => s.path === savedSessionPath);
                if (sessionExists) {
                  send({ type: 'switchSession', workspaceId: event.workspaceId, sessionId: savedSessionPath });
                }
              }
            }
          }
          break;
        }

        case 'models': {
          updateWorkspace(event.workspaceId, { models: event.models });
          
          // Restore saved model and thinking level for this workspace (only once per workspace)
          // We use a simple check: only restore if we haven't restored sessions yet
          // (models event comes before or around the same time as sessions)
          if (persistedUIStateRef.current && !restoredSessionsRef.current.has(event.workspaceId)) {
            const workspace = workspacesRef.current.find((ws) => ws.id === event.workspaceId);
            if (workspace) {
              // Restore model
              const activeModels = persistedUIStateRef.current.activeModels || {};
              const savedModel = activeModels[workspace.path];
              if (savedModel) {
                const modelExists = event.models.some(
                  (m) => m.provider === savedModel.provider && m.id === savedModel.modelId
                );
                if (modelExists) {
                  const currentModel = workspace.state?.model;
                  if (!currentModel || currentModel.provider !== savedModel.provider || currentModel.id !== savedModel.modelId) {
                    send({ type: 'setModel', workspaceId: event.workspaceId, provider: savedModel.provider, modelId: savedModel.modelId });
                  }
                }
              }
              
              // Restore thinking level
              const thinkingLevels = persistedUIStateRef.current.thinkingLevels || {};
              const savedThinkingLevel = thinkingLevels[workspace.path];
              if (savedThinkingLevel && savedThinkingLevel !== workspace.state?.thinkingLevel) {
                send({ type: 'setThinkingLevel', workspaceId: event.workspaceId, level: savedThinkingLevel });
              }
            }
          }
          break;
        }

        case 'commands':
          updateWorkspace(event.workspaceId, { commands: event.commands });
          break;

        case 'agentStart':
          updateWorkspace(event.workspaceId, {
            isStreaming: true,
            streamingText: '',
            streamingThinking: '',
          });
          break;

        case 'agentEnd':
          updateWorkspace(event.workspaceId, {
            isStreaming: false,
            streamingText: '',
            streamingThinking: '',
            activeToolExecutions: [],
          });
          send({ type: 'getState', workspaceId: event.workspaceId });
          break;

        case 'messageStart':
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? { ...ws, messages: [...ws.messages, event.message] }
                : ws
            )
          );
          break;

        case 'messageUpdate':
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              if (event.update.type === 'textDelta' && event.update.delta) {
                return {
                  ...ws,
                  streamingText: ws.streamingText + event.update.delta,
                };
              } else if (
                event.update.type === 'thinkingDelta' &&
                event.update.delta
              ) {
                return {
                  ...ws,
                  streamingThinking: ws.streamingThinking + event.update.delta,
                };
              }
              return ws;
            })
          );
          break;

        case 'messageEnd':
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? {
                    ...ws,
                    messages: ws.messages.map((m) =>
                      m.id === event.message.id ? event.message : m
                    ),
                    streamingText: '',
                    streamingThinking: '',
                  }
                : ws
            )
          );
          break;

        case 'toolStart':
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? {
                    ...ws,
                    activeToolExecutions: [
                      ...ws.activeToolExecutions,
                      {
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        args: event.args,
                        status: 'running' as const,
                      },
                    ],
                  }
                : ws
            )
          );
          break;

        case 'toolUpdate':
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? {
                    ...ws,
                    activeToolExecutions: ws.activeToolExecutions.map((t) =>
                      t.toolCallId === event.toolCallId
                        ? { ...t, result: event.partialResult }
                        : t
                    ),
                  }
                : ws
            )
          );
          break;

        case 'toolEnd':
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === event.workspaceId
                ? {
                    ...ws,
                    activeToolExecutions: ws.activeToolExecutions.map((t) =>
                      t.toolCallId === event.toolCallId
                        ? {
                            ...t,
                            status: event.isError
                              ? ('error' as const)
                              : ('complete' as const),
                            result: event.result,
                            isError: event.isError,
                          }
                        : t
                    ),
                  }
                : ws
            )
          );
          break;

        case 'compactionStart':
          // Could show a loading indicator
          break;

        case 'compactionEnd':
          send({ type: 'getMessages', workspaceId: event.workspaceId });
          send({ type: 'getState', workspaceId: event.workspaceId });
          break;

        case 'error':
          setError(event.message);
          break;
      }
    },
    [send, updateWorkspace]
  );

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Increment connection ID to invalidate any pending events from old connections
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
      // Only handle if this is still the current WebSocket
      if (wsRef.current !== ws) {
        return;
      }
      
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // Clear workspaces since server-side sessions are gone
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      
      // Reset restoration flags for reconnect
      hasRestoredWorkspacesRef.current = false;
      restoredSessionsRef.current = new Set();
      setRestorationComplete(false);

      // Attempt to reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onmessage = (event) => {
      // Ignore events from stale connections (handles React Strict Mode)
      if (connectionIdRef.current !== thisConnectionId) {
        console.log('[useWorkspaces] Ignoring event from stale connection');
        return;
      }
      try {
        const data: WsServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }, [url, handleEvent]);

  useEffect(() => {
    // Use a flag to handle React Strict Mode double-mounting
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
      // Only close if we're actually connected
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Reset state for potential remount
      hasRestoredWorkspacesRef.current = false;
      restoredSessionsRef.current = new Set();
    };
  }, [connect]);

  const activeWorkspace =
    workspaces.find((ws) => ws.id === activeWorkspaceId) || null;

  // Helper to require active workspace for actions
  const withActiveWorkspace = useCallback(
    (action: (workspaceId: string) => void) => {
      if (!activeWorkspaceId) {
        setError('No active workspace');
        return;
      }
      action(activeWorkspaceId);
    },
    [activeWorkspaceId]
  );

  // Sidebar width setter with backend persistence
  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
    send({ type: 'setSidebarWidth', width });
  }, [send]);

  // Theme setter with backend persistence
  const setThemeId = useCallback((id: string | null) => {
    setThemeIdState(id);
    send({ type: 'setTheme', themeId: id });
  }, [send]);

  // Draft input setter with backend persistence
  const setDraftInput = useCallback((workspacePath: string, value: string) => {
    setDraftInputs((prev) => ({ ...prev, [workspacePath]: value }));
    send({ type: 'setDraftInput', workspacePath, value });
  }, [send]);

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
    closeWorkspace: (workspaceId: string) =>
      send({ type: 'closeWorkspace', workspaceId }),
    setActiveWorkspace: setActiveWorkspaceId,

    // UI State
    sidebarWidth,
    setSidebarWidth,
    themeId,
    setThemeId,

    getDraftInput: (workspacePath: string) => draftInputs[workspacePath] || '',
    setDraftInput,

    sendPrompt: (message: string, images?: ImageAttachment[]) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'prompt', workspaceId, message, images })
      ),
    steer: (message: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'steer', workspaceId, message })
      ),
    followUp: (message: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'followUp', workspaceId, message })
      ),
    abort: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'abort', workspaceId })
      ),
    setModel: (provider: string, modelId: string) =>
      withActiveWorkspace((workspaceId) => {
        send({ type: 'setModel', workspaceId, provider, modelId });
        // Persist the model selection for this workspace
        const workspace = workspaces.find((ws) => ws.id === workspaceId);
        if (workspace) {
          send({ type: 'setActiveModel', workspacePath: workspace.path, provider, modelId });
        }
      }),
    setThinkingLevel: (level: ThinkingLevel) =>
      withActiveWorkspace((workspaceId) => {
        send({ type: 'setThinkingLevel', workspaceId, level });
        // Persist the thinking level for this workspace
        const workspace = workspaces.find((ws) => ws.id === workspaceId);
        if (workspace) {
          send({ type: 'setThinkingLevelPref', workspacePath: workspace.path, level });
        }
      }),
    newSession: () =>
      withActiveWorkspace((workspaceId) => {
        send({ type: 'newSession', workspaceId });
        // Note: The new session ID will be persisted when we receive the state update
        // We'll handle that by tracking when a new session was just created
      }),
    switchSession: (sessionId: string) =>
      withActiveWorkspace((workspaceId) => {
        send({ type: 'switchSession', workspaceId, sessionId });
        // Persist the active session for this workspace
        const workspace = workspaces.find((ws) => ws.id === workspaceId);
        if (workspace) {
          send({ type: 'setActiveSession', workspacePath: workspace.path, sessionId });
        }
      }),
    compact: (customInstructions?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'compact', workspaceId, customInstructions })
      ),
    refreshSessions: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getSessions', workspaceId })
      ),
    refreshModels: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getModels', workspaceId })
      ),
    refreshCommands: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getCommands', workspaceId })
      ),
  };
}
