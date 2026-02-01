import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  DirectoryEntry,
  ModelInfo,
  SessionInfo,
  SessionState,
  ThinkingLevel,
  WsClientMessage,
  WsServerEvent,
  ImageAttachment,
} from '@pi-web-ui/shared';

// LocalStorage keys
const STORAGE_KEYS = {
  openWorkspaces: 'pi-open-workspaces',
  activeWorkspacePath: 'pi-active-workspace',
  draftInputs: 'pi-draft-inputs',
} as const;

// Load persisted state from localStorage
function loadPersistedState() {
  try {
    const openWorkspaces = JSON.parse(localStorage.getItem(STORAGE_KEYS.openWorkspaces) || '[]') as string[];
    const activeWorkspacePath = localStorage.getItem(STORAGE_KEYS.activeWorkspacePath) || null;
    const draftInputs = JSON.parse(localStorage.getItem(STORAGE_KEYS.draftInputs) || '{}') as Record<string, string>;
    return { openWorkspaces, activeWorkspacePath, draftInputs };
  } catch {
    return { openWorkspaces: [], activeWorkspacePath: null, draftInputs: {} };
  }
}

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
}

export function useWorkspaces(url: string): UseWorkspacesReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const persistedStateRef = useRef(loadPersistedState());
  const hasRestoredWorkspacesRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [allowedRoots, setAllowedRoots] = useState<string[]>([]);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>(
    persistedStateRef.current.draftInputs
  );

  const [currentBrowsePath, setCurrentBrowsePath] = useState('/');
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([]);

  // Persist draft inputs when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.draftInputs, JSON.stringify(draftInputs));
  }, [draftInputs]);

  // Persist open workspaces when they change
  useEffect(() => {
    const paths = workspaces.map((ws) => ws.path);
    localStorage.setItem(STORAGE_KEYS.openWorkspaces, JSON.stringify(paths));
  }, [workspaces]);

  // Persist active workspace when it changes
  useEffect(() => {
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
    if (activeWs) {
      localStorage.setItem(STORAGE_KEYS.activeWorkspacePath, activeWs.path);
    }
  }, [activeWorkspaceId, workspaces]);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

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
        case 'connected':
          setAllowedRoots(event.allowedRoots);
          // Request directory listing for initial view
          send({ type: 'browseDirectory' });
          
          // Restore previously open workspaces (only once per session)
          if (!hasRestoredWorkspacesRef.current) {
            hasRestoredWorkspacesRef.current = true;
            const { openWorkspaces } = persistedStateRef.current;
            if (openWorkspaces.length > 0) {
              openWorkspaces.forEach((path) => {
                send({ type: 'openWorkspace', path });
              });
            }
          }
          break;

        case 'workspaceOpened': {
          const newWorkspace: WorkspaceState = {
            id: event.workspace.id,
            path: event.workspace.path,
            name: event.workspace.name,
            state: event.state,
            messages: event.messages,
            sessions: [],
            models: [],
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
          const { activeWorkspacePath } = persistedStateRef.current;
          setActiveWorkspaceId((current) => {
            if (current === null || event.workspace.path === activeWorkspacePath) {
              return event.workspace.id;
            }
            return current;
          });
          
          // Fetch sessions and models for this workspace
          send({ type: 'getSessions', workspaceId: event.workspace.id });
          send({ type: 'getModels', workspaceId: event.workspace.id });
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

        case 'state':
          updateWorkspace(event.workspaceId, { state: event.state });
          break;

        case 'messages':
          updateWorkspace(event.workspaceId, { messages: event.messages });
          break;

        case 'sessions':
          updateWorkspace(event.workspaceId, { sessions: event.sessions });
          break;

        case 'models':
          updateWorkspace(event.workspaceId, { models: event.models });
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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

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
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // Attempt to reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onmessage = (event) => {
      try {
        const data: WsServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }, [url, handleEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
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

    getDraftInput: (workspacePath: string) => draftInputs[workspacePath] || '',
    setDraftInput: (workspacePath: string, value: string) => {
      setDraftInputs((prev) => ({ ...prev, [workspacePath]: value }));
    },

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
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setModel', workspaceId, provider, modelId })
      ),
    setThinkingLevel: (level: ThinkingLevel) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'setThinkingLevel', workspaceId, level })
      ),
    newSession: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'newSession', workspaceId })
      ),
    switchSession: (sessionId: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'switchSession', workspaceId, sessionId })
      ),
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
  };
}
