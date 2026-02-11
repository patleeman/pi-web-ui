import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from './useIsMobile';
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
  ActivePlanState,
  ActiveJobState,
  PlanInfo,
  JobInfo,
} from '@pi-deck/shared';

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
  /** Server-side queued steering/follow-up messages */
  queuedMessages: { steering: string[]; followUp: string[] };
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

  // Status message (dismissable non-critical errors/notifications)
  statusMessage: { text: string; type: 'error' | 'warning' | 'info' } | null;
  dismissStatusMessage: () => void;

  // Deploy state
  deployState: DeployState;

  // Update available
  updateAvailable: { current: string; latest: string } | null;

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
  sendCustomUIInput: (slotId: string, input: import('@pi-deck/shared').CustomUIInputEvent) => void;

  // Config
  updateAllowedRoots: (roots: string[]) => void;

  // Session management
  exportHtml: (slotId: string) => void;
  setSessionName: (slotId: string, name: string) => void;
  renameSession: (workspaceId: string, sessionId: string, sessionPath: string | undefined, name: string) => void;
  deleteSession: (workspaceId: string, sessionId: string, sessionPath?: string) => void;

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
  // Workspace directory watching (real-time updates)
  watchDirectory: (workspaceId: string, path: string) => void;
  unwatchDirectory: (workspaceId: string, path: string) => void;
  // Workspace file read (file preview)
  readWorkspaceFile: (workspaceId: string, path: string, requestId?: string) => void;
  getGitStatus: (workspaceId: string, requestId?: string) => void;
  getFileDiff: (workspaceId: string, path: string, requestId?: string) => void;
  
  // Bash execution
  executeBash: (slotId: string, command: string, excludeFromContext?: boolean) => void;
  
  // Plans
  activePlanByWorkspace: Record<string, import('@pi-deck/shared').ActivePlanState | null>;
  getPlans: () => void;
  getPlanContent: (planPath: string) => void;
  savePlan: (planPath: string, content: string) => void;
  activatePlan: (planPath: string) => void;
  deactivatePlan: () => void;
  updatePlanTask: (planPath: string, line: number, done: boolean) => void;
  deletePlan: (planPath: string) => void;
  renamePlan: (planPath: string, newTitle: string) => void;

  // Jobs
  activeJobsByWorkspace: Record<string, import('@pi-deck/shared').ActiveJobState[]>;
  getJobs: (workspaceId?: string) => void;
  getJobContent: (jobPath: string, workspaceId?: string) => void;
  getJobLocations: () => void;
  createJob: (title: string, description: string, tags?: string[], location?: string) => void;
  saveJob: (jobPath: string, content: string) => void;
  promoteJob: (jobPath: string, toPhase?: import('@pi-deck/shared').JobPhase) => void;
  demoteJob: (jobPath: string, toPhase?: import('@pi-deck/shared').JobPhase) => void;
  updateJobTask: (jobPath: string, line: number, done: boolean) => void;
  deleteJob: (jobPath: string) => void;
  renameJob: (jobPath: string, newTitle: string) => void;
  archiveJob: (jobPath: string) => void;
  unarchiveJob: (jobPath: string) => void;
  getArchivedJobs: () => void;
  startJobConversation: (jobPath: string, message?: string) => void;
  // Job attachments
  addJobAttachment: (jobPath: string, file: File, onProgress?: (loaded: number, total: number) => void) => Promise<void>;
  removeJobAttachment: (jobPath: string, attachmentId: string) => void;
  readJobAttachment: (jobPath: string, attachmentId: string) => Promise<{ base64Data: string; mediaType: string } | null>;
  // Job configuration
  browseJobDirectory: (path?: string) => void;
  addJobLocation: (path: string) => void;
  updateJobConfig: (config: { locations?: string[]; defaultLocation?: string; addLocation?: string; removeLocation?: string }) => void;
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
    queuedMessages: { steering: [], followUp: [] },
  };
}

type SyncMutation = {
  type: string;
  workspaceId: string;
  [key: string]: unknown;
};

interface SyncSnapshotMessage {
  type: 'snapshot';
  version?: number;
  state?: {
    id: string;
    path?: string;
    sessions?: SessionInfo[];
    plans?: PlanInfo[];
    jobs?: JobInfo[];
    activePlan?: ActivePlanState | null;
    activeJobs?: ActiveJobState[];
    rightPaneOpen?: boolean;
    paneTabs?: PaneTabPageState[];
    activePaneTab?: string | null;
    slots?: Record<string, {
      messages?: ChatMessage[];
      isStreaming?: boolean;
      isCompacting?: boolean;
      queuedMessages?: { steering?: string[]; followUp?: string[] };
      activeTools?: Array<{
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        status: 'running' | 'completed' | 'error';
        result?: unknown;
      }>;
    }>;
    directoryEntries?: Record<string, DirectoryEntry[]>;
  } | null;
}

interface SyncDeltaMessage {
  type: 'delta';
  version?: number;
  deltas?: SyncMutation[];
}

export function useWorkspaces(url: string): UseWorkspacesReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const hasRestoredWorkspacesRef = useRef(false);
  const connectionIdRef = useRef(0);
  const pendingStreamingUpdatesRef = useRef<Record<string, { textDelta: string; thinkingDelta: string }>>({});
  const streamingFlushScheduledRef = useRef(false);
  const lastStreamingFlushTimeRef = useRef(0);
  const isMobile = useIsMobile();
  // Throttle streaming updates - use lower frame rate on mobile to save battery
  const STREAMING_THROTTLE_MS = isMobile ? 150 : 50; // 6.6fps on mobile, 20fps on desktop
  
  const persistedUIStateRef = useRef<UIState | null>(null);
  const pendingWorkspaceCountRef = useRef(0);
  const [restorationComplete, setRestorationComplete] = useState(false);
  const restoredSessionsRef = useRef<Set<string>>(new Set());

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'error' | 'warning' | 'info' } | null>(null);

  const [updateAvailable, setUpdateAvailable] = useState<{ current: string; latest: string } | null>(null);
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
  const [activePlanByWorkspace, setActivePlanByWorkspace] = useState<Record<string, import('@pi-deck/shared').ActivePlanState | null>>({});
  const [activeJobsByWorkspace, setActiveJobsByWorkspace] = useState<Record<string, import('@pi-deck/shared').ActiveJobState[]>>({});
  
  const workspacesRef = useRef<WorkspaceState[]>([]);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const restorationCompleteRef = useRef(false);
  const paneTabsByWorkspaceRef = useRef<Record<string, PaneTabPageState[]>>({});
  const activePaneTabByWorkspaceRef = useRef<Record<string, string>>({});
  const sessionSlotRequestsRef = useRef<Record<string, Set<string>>>({});
  // Prevent duplicate questionnaire responses for the same toolCallId
  const respondedQuestionnairesRef = useRef<Record<string, Set<string>>>({});
  // Workspaces that have received sync snapshot/delta and should use sync as source of truth
  const syncAuthoritativeWorkspacesRef = useRef<Set<string>>(new Set());
  
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

    const now = Date.now();
    const timeSinceLastFlush = now - lastStreamingFlushTimeRef.current;
    const remainingThrottle = Math.max(0, STREAMING_THROTTLE_MS - timeSinceLastFlush);

    const flush = () => {
      lastStreamingFlushTimeRef.current = Date.now();
      flushStreamingUpdates();
    };

    if (remainingThrottle === 0) {
      // Throttle period has passed, use rAF for smooth timing
      const schedule = typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame
        : (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16);
      schedule(flush);
    } else {
      // Still within throttle period, schedule for later
      window.setTimeout(flush, remainingThrottle);
    }
  }, [flushStreamingUpdates]);

  const sendSyncAck = useCallback((version: number | undefined) => {
    if (version === undefined) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'ack', version }));
  }, []);

  const applySyncMutation = useCallback((mutation: SyncMutation) => {
    if (!mutation.workspaceId) return;
    const workspaceId = mutation.workspaceId;
    syncAuthoritativeWorkspacesRef.current.add(workspaceId);

    switch (mutation.type) {
      case 'workspaceClose': {
        setWorkspaces((prev) => prev.filter((ws) => ws.id !== workspaceId));
        setActiveWorkspaceId((current) => (current === workspaceId ? null : current));
        setActivePlanByWorkspace((prev) => {
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        });
        setActiveJobsByWorkspace((prev) => {
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        });
        syncAuthoritativeWorkspacesRef.current.delete(workspaceId);
        break;
      }
      case 'slotCreate': {
        const slotId = (mutation.slotId as string) || 'default';
        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (ws.id !== workspaceId) return ws;
            if (ws.slots[slotId]) return ws;
            return {
              ...ws,
              slots: {
                ...ws.slots,
                [slotId]: createEmptySlot(slotId),
              },
            };
          })
        );
        break;
      }
      case 'slotDelete': {
        const slotId = (mutation.slotId as string) || 'default';
        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (ws.id !== workspaceId) return ws;
            if (!ws.slots[slotId]) return ws;
            const { [slotId]: _removed, ...remaining } = ws.slots;
            return { ...ws, slots: remaining };
          })
        );
        break;
      }
      case 'sessionsUpdate': {
        const sessions = (mutation.sessions as SessionInfo[]) || [];
        updateWorkspace(workspaceId, { sessions });
        break;
      }
      case 'plansUpdate': {
        const plans = (mutation.plans as PlanInfo[]) || [];
        window.dispatchEvent(new CustomEvent('pi:plansList', {
          detail: { workspaceId, plans },
        }));
        break;
      }
      case 'jobsUpdate': {
        const jobs = (mutation.jobs as JobInfo[]) || [];
        window.dispatchEvent(new CustomEvent('pi:jobsList', {
          detail: { workspaceId, jobs },
        }));
        break;
      }
      case 'activePlanUpdate': {
        const activePlan = (mutation.activePlan as ActivePlanState | null) ?? null;
        setActivePlanByWorkspace((prev) => ({
          ...prev,
          [workspaceId]: activePlan,
        }));
        window.dispatchEvent(new CustomEvent('pi:activePlan', {
          detail: { workspaceId, activePlan },
        }));
        if (!activePlan) {
          window.dispatchEvent(new CustomEvent('pi:planDeactivated', { detail: { workspaceId } }));
        }
        break;
      }
      case 'activeJobsUpdate': {
        const activeJobs = (mutation.activeJobs as ActiveJobState[]) || [];
        setActiveJobsByWorkspace((prev) => ({
          ...prev,
          [workspaceId]: activeJobs,
        }));
        window.dispatchEvent(new CustomEvent('pi:activeJob', {
          detail: { workspaceId, activeJobs },
        }));
        break;
      }
      case 'workspaceUIUpdate': {
        const workspacePath = (mutation.workspacePath as string) || workspacesRef.current.find((ws) => ws.id === workspaceId)?.path;
        if (!workspacePath) break;

        const rightPaneOpen = Boolean(mutation.rightPaneOpen);
        const paneTabs = (mutation.paneTabs as PaneTabPageState[]) || [];
        const activePaneTab = (mutation.activePaneTab as string | null) ?? null;

        setRightPaneByWorkspace((prev) => {
          const next = { ...prev };
          if (rightPaneOpen) {
            next[workspacePath] = true;
          } else {
            delete next[workspacePath];
          }
          return next;
        });

        setPaneTabsByWorkspace((prev) => ({ ...prev, [workspacePath]: paneTabs }));
        setActivePaneTabByWorkspace((prev) => {
          const next = { ...prev };
          if (activePaneTab) {
            next[workspacePath] = activePaneTab;
          } else {
            delete next[workspacePath];
          }
          return next;
        });
        break;
      }
      case 'queuedMessagesUpdate': {
        const slotId = (mutation.slotId as string) || 'default';
        const queued = (mutation.queuedMessages as { steering?: string[]; followUp?: string[] }) || {};
        updateSlot(workspaceId, slotId, {
          queuedMessages: {
            steering: queued.steering || [],
            followUp: queued.followUp || [],
          },
        });
        break;
      }
      case 'directoryEntriesUpdate': {
        const dirPath = (mutation.directoryPath as string) || '';
        const entries = (mutation.entries as DirectoryEntry[]) || [];
        // Dispatch custom event for App.tsx to handle
        window.dispatchEvent(new CustomEvent('pi:directoryEntries', {
          detail: { workspaceId, directoryPath: dirPath, entries },
        }));
        break;
      }
      case 'fileWatcherStatsUpdate': {
        const stats = mutation.stats as { watchedCount: number; maxWatched: number; isAtLimit: boolean } | undefined;
        if (stats) {
          window.dispatchEvent(new CustomEvent('pi:fileWatcherStats', {
            detail: { workspaceId, stats },
          }));
        }
        break;
      }
      case 'watchedDirectoryRemove': {
        const dirPath = (mutation.directoryPath as string) || '';
        // Clear entries for unwatched directory
        window.dispatchEvent(new CustomEvent('pi:directoryEntries', {
          detail: { workspaceId, directoryPath: dirPath, entries: [] },
        }));
        break;
      }
      default:
        break;
    }
  }, [updateSlot, updateWorkspace]);

  const handleSyncSnapshot = useCallback((snapshot: SyncSnapshotMessage) => {
    if (!snapshot.state) {
      sendSyncAck(snapshot.version);
      return;
    }

    const state = snapshot.state;
    const workspaceId = state.id;
    if (!workspaceId) {
      sendSyncAck(snapshot.version);
      return;
    }

    syncAuthoritativeWorkspacesRef.current.add(workspaceId);

    const workspacePath = state.path || workspacesRef.current.find((ws) => ws.id === workspaceId)?.path || '';
    if (!workspacesRef.current.some((ws) => ws.id === workspaceId)) {
      const placeholderSlots: Record<string, SessionSlotState> = {};
      for (const slotId of Object.keys(state.slots || {})) {
        placeholderSlots[slotId] = createEmptySlot(slotId);
      }
      if (!placeholderSlots.default) {
        placeholderSlots.default = createEmptySlot('default');
      }

      setWorkspaces((prev) => [
        ...prev,
        {
          id: workspaceId,
          path: workspacePath,
          name: workspacePath ? workspacePath.split('/').pop() || workspaceId : workspaceId,
          slots: placeholderSlots,
          sessions: state.sessions || [],
          models: [],
          startupInfo: null,
        },
      ]);

      // If this workspace matches the persisted active workspace, activate it
      // (handles race condition where sync snapshot arrives before workspaceOpened)
      const activeWorkspacePath = persistedUIStateRef.current?.activeWorkspacePath;
      if (activeWorkspacePath && workspacePath === activeWorkspacePath) {
        setActiveWorkspaceId(workspaceId);
      }
    }

    if (state.sessions) {
      updateWorkspace(workspaceId, { sessions: state.sessions });
    }

    if (state.plans) {
      window.dispatchEvent(new CustomEvent('pi:plansList', {
        detail: { workspaceId, plans: state.plans },
      }));
    }

    if (state.jobs) {
      window.dispatchEvent(new CustomEvent('pi:jobsList', {
        detail: { workspaceId, jobs: state.jobs },
      }));
    }

    // Load directory entries from snapshot
    if (state.directoryEntries) {
      for (const [dirPath, entries] of Object.entries(state.directoryEntries)) {
        window.dispatchEvent(new CustomEvent('pi:directoryEntries', {
          detail: { workspaceId, directoryPath: dirPath, entries: entries as DirectoryEntry[] },
        }));
      }
    }

    if (workspacePath) {
      const rightPaneOpen = Boolean(state.rightPaneOpen);
      const paneTabs = state.paneTabs || [];
      const activePaneTab = state.activePaneTab ?? null;

      setRightPaneByWorkspace((prev) => {
        const next = { ...prev };
        if (rightPaneOpen) {
          next[workspacePath] = true;
        } else {
          delete next[workspacePath];
        }
        return next;
      });
      setPaneTabsByWorkspace((prev) => ({ ...prev, [workspacePath]: paneTabs }));
      setActivePaneTabByWorkspace((prev) => {
        const next = { ...prev };
        if (activePaneTab) {
          next[workspacePath] = activePaneTab;
        } else {
          delete next[workspacePath];
        }
        return next;
      });
    }

    if (state.slots) {
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== workspaceId) return ws;

          const nextSlots: Record<string, SessionSlotState> = {};
          for (const [slotId, slotSnapshot] of Object.entries(state.slots || {})) {
            const existing = ws.slots[slotId] || createEmptySlot(slotId);
            
            // Only restore messages from sync if sync actually has messages.
            // Sync state starts empty and only tracks new mutations, so if the slot
            // was created before sync started tracking, it will have empty messages.
            // In that case, preserve the existing messages from workspaceOpened.
            const syncHasMessages = slotSnapshot.messages && slotSnapshot.messages.length > 0;
            
            nextSlots[slotId] = {
              ...existing,
              messages: syncHasMessages ? slotSnapshot.messages! : existing.messages,
              isStreaming: slotSnapshot.isStreaming ?? existing.isStreaming ?? false,
              queuedMessages: {
                steering: slotSnapshot.queuedMessages?.steering || [],
                followUp: slotSnapshot.queuedMessages?.followUp || [],
              },
              activeToolExecutions: slotSnapshot.activeTools?.map((t: { toolCallId: string; toolName: string; args: Record<string, unknown>; status: string; result?: unknown }) => ({
                toolCallId: t.toolCallId,
                toolName: t.toolName,
                args: t.args,
                status: t.status === 'completed' ? 'complete' : (t.status as 'running' | 'error'),
                result: typeof t.result === 'string' ? t.result : JSON.stringify(t.result),
                isError: t.status === 'error',
              })) || existing.activeToolExecutions || [],
            };
          }

          return { ...ws, slots: nextSlots };
        })
      );
    }

    setActivePlanByWorkspace((prev) => ({
      ...prev,
      [workspaceId]: state.activePlan ?? null,
    }));
    window.dispatchEvent(new CustomEvent('pi:activePlan', {
      detail: { workspaceId, activePlan: state.activePlan ?? null },
    }));
    if (!state.activePlan) {
      window.dispatchEvent(new CustomEvent('pi:planDeactivated', { detail: { workspaceId } }));
    }

    setActiveJobsByWorkspace((prev) => ({
      ...prev,
      [workspaceId]: state.activeJobs ?? [],
    }));
    window.dispatchEvent(new CustomEvent('pi:activeJob', {
      detail: { workspaceId, activeJobs: state.activeJobs ?? [] },
    }));

    sendSyncAck(snapshot.version);
  }, [sendSyncAck, updateWorkspace]);

  const handleSyncDelta = useCallback((delta: SyncDeltaMessage) => {
    if (delta.deltas) {
      for (const mutation of delta.deltas) {
        applySyncMutation(mutation);
      }
    }
    sendSyncAck(delta.version);
  }, [applySyncMutation, sendSyncAck]);

  const handleEvent = useCallback(
    (event: WsServerEvent) => {
      // Helper to get slotId from event, defaulting to 'default'
      const getSlotId = (e: { sessionSlotId?: string }) => e.sessionSlotId || 'default';

      switch (event.type) {
        case 'connected': {
          setHomeDirectory(event.homeDirectory);
          setAllowedRoots(event.allowedRoots || []);
          if (event.updateAvailable) {
            setUpdateAvailable(event.updateAvailable);
          }
          const uiState = event.uiState;
          persistedUIStateRef.current = uiState;
          setDraftInputs(uiState?.draftInputs || {});
          setSidebarWidthState(uiState?.sidebarWidth || DEFAULT_SIDEBAR_WIDTH);
          setThemeIdState(uiState?.themeId ?? null);
          setRightPaneByWorkspace(uiState?.rightPaneByWorkspace || {});
          // Don't restore tabs from UI state - show welcome state instead
          // This allows users to start fresh without auto-created tabs
          setPaneTabsByWorkspace({});
          setActivePaneTabByWorkspace({});
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
          // NOTE: paneTabsByWorkspace and activePaneTabByWorkspace are NOT
          // applied here. This event is an echo from saveUIState, and stale
          // echoes can race with the client's optimistic updates (e.g., when
          // a new tab is added, a previous saveUIState echo may arrive with
          // the old tab list and overwrite the newly added tab).
          // Tabs are managed by:
          //   - setPaneTabsForWorkspace (local, ref-based, authoritative)
          //   - 'connected' event (initial load)
          //   - sync snapshots/deltas (workspaceUIUpdate)
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

          // When reconnecting to an existing workspace, we need to fully reset the slot state
          // to ensure we don't have stale streamingText or other transient state from before
          // the reconnect. The server will replay buffered events if any.
          const isReconnect = event.isExisting;
          const defaultSlot = createEmptySlot('default');
          defaultSlot.state = event.state;
          defaultSlot.messages = event.messages;
          // Sync slot-level isStreaming from server state (critical for page refresh)
          // Force isStreaming to true if the server says the conversation is streaming
          const serverIsStreaming = event.state?.isStreaming ?? false;
          defaultSlot.isStreaming = serverIsStreaming;

          // Debug logging for reconnect issues
          if (isReconnect && serverIsStreaming) {
            console.log('[workspaceOpened] Reconnecting to streaming conversation:', {
              workspaceId: event.workspace.id,
              isStreaming: serverIsStreaming,
              messageCount: event.messages.length,
              bufferedEvents: event.bufferedEventCount,
            });
          }

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
            const existing = prev.find((ws) => ws.id === newWorkspace.id);
            if (existing) {
              // On reconnect, completely replace the slot state to avoid stale transient state
              // (streamingText, activeToolExecutions, etc.). The server provides the authoritative
              // messages and state, and will replay any buffered events.
              const mergedSlots: Record<string, SessionSlotState> = {
                ...existing.slots,
                default: isReconnect
                  ? defaultSlot // Use fresh slot state on reconnect
                  : {
                      ...(existing.slots.default || createEmptySlot('default')),
                      state: event.state,
                      messages: event.messages,
                      // Sync slot-level isStreaming from server state (critical for page refresh)
                      isStreaming: event.state?.isStreaming || false,
                    },
              };

              // Debug: log the isStreaming value being set
              if (isReconnect && serverIsStreaming) {
                console.log('[setWorkspaces] Updating workspace with isStreaming:', {
                  workspaceId: event.workspace.id,
                  slotIsStreaming: mergedSlots.default.isStreaming,
                });
              }

              return prev.map((ws) =>
                ws.id === newWorkspace.id
                  ? {
                      ...ws,
                      ...newWorkspace,
                      slots: mergedSlots,
                      sessions: ws.sessions,
                      models: ws.models,
                    }
                  : ws
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

          // Reset workspace-scoped banner state only for non-sync-authoritative workspaces.
          if (!syncAuthoritativeWorkspacesRef.current.has(event.workspace.id)) {
            setActivePlanByWorkspace((prev) => ({ ...prev, [event.workspace.id]: null }));
            setActiveJobsByWorkspace((prev) => ({ ...prev, [event.workspace.id]: [] }));
          }
          
          send({ type: 'getSessions', workspaceId: event.workspace.id });
          send({ type: 'getModels', workspaceId: event.workspace.id });
          send({ type: 'getCommands', workspaceId: event.workspace.id, sessionSlotId: 'default' });
          // Request slot list to restore any sessions that were loaded in slots
          send({ type: 'listSessionSlots', workspaceId: event.workspace.id });
          break;
        }

        case 'workspaceClosed':
          setWorkspaces((prev) => prev.filter((ws) => ws.id !== event.workspaceId));
          setActiveWorkspaceId((current) =>
            current === event.workspaceId ? null : current
          );
          setActivePlanByWorkspace((prev) => {
            const next = { ...prev };
            delete next[event.workspaceId];
            return next;
          });
          setActiveJobsByWorkspace((prev) => {
            const next = { ...prev };
            delete next[event.workspaceId];
            return next;
          });
          syncAuthoritativeWorkspacesRef.current.delete(event.workspaceId);
          break;

        case 'directoryList':
          setCurrentBrowsePath(event.path);
          setDirectoryEntries(event.entries);
          break;

        // Session slot events
        case 'sessionSlotCreated': {
          const newSlot = createEmptySlot(event.sessionSlotId);
          newSlot.state = event.state;
          newSlot.messages = event.messages;
          // Sync slot-level isStreaming from server state (critical for page refresh)
          newSlot.isStreaming = event.state?.isStreaming || false;
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
          // If this is a plan slot, dispatch event for tab creation
          if (event.sessionSlotId.startsWith('plan-')) {
            window.dispatchEvent(new CustomEvent('pi:planSlotCreated', {
              detail: { workspaceId: event.workspaceId, sessionSlotId: event.sessionSlotId },
            }));
          }
          // If this is a job slot, dispatch event for tab creation
          if (event.sessionSlotId.startsWith('job-')) {
            window.dispatchEvent(new CustomEvent('pi:jobSlotCreated', {
              detail: { workspaceId: event.workspaceId, sessionSlotId: event.sessionSlotId },
            }));
          }
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
            if (workspace.slots[slotInfo.slotId]) {
              // Slot exists - if it has a loaded session but no messages, load the session
              const existingSlot = workspace.slots[slotInfo.slotId];
              const hasMessages = existingSlot?.messages && existingSlot.messages.length > 0;
              if (slotInfo.loadedSessionId && !hasMessages) {
                send({ type: 'switchSession', workspaceId: event.workspaceId, sessionSlotId: slotInfo.slotId, sessionId: slotInfo.loadedSessionId });
              }
              return;
            }
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
          // Clear any pending streaming deltas so a late flush doesn't overwrite
          const endKey = `${event.workspaceId}:${slotId}`;
          delete pendingStreamingUpdatesRef.current[endKey];
          updateSlot(event.workspaceId, slotId, {
            isStreaming: false,
            streamingText: '',
            streamingThinking: '',
            activeToolExecutions: [],
          });
          // Reconcile with authoritative server state/message ordering after each run.
          send({ type: 'getState', workspaceId: event.workspaceId, sessionSlotId: slotId });
          send({ type: 'getMessages', workspaceId: event.workspaceId, sessionSlotId: slotId });
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
                    messages: (() => {
                      const existingIndex = slot.messages.findIndex((m) => m.id === event.message.id);
                      if (existingIndex === -1) {
                        return [...slot.messages, event.message];
                      }
                      return slot.messages.map((m) =>
                        m.id === event.message.id ? event.message : m
                      );
                    })(),
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

              const existingIndex = slot.activeToolExecutions.findIndex(
                (t) => t.toolCallId === event.toolCallId
              );

              let nextTools = slot.activeToolExecutions;
              if (existingIndex === -1) {
                nextTools = [
                  ...slot.activeToolExecutions,
                  {
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    args: event.args,
                    status: 'running' as const,
                  },
                ];
              } else {
                nextTools = slot.activeToolExecutions.map((t, i) =>
                  i === existingIndex
                    ? { ...t, toolName: event.toolName, args: event.args, status: 'running' as const }
                    : t
                );
              }

              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    activeToolExecutions: nextTools,
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

          // De-dupe duplicate questionnaire events for the same tool call
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== event.workspaceId) return ws;
              const slot = ws.slots[slotId] || createEmptySlot(slotId);
              const existing = slot.questionnaireRequest;
              if (existing && existing.toolCallId === event.toolCallId) {
                return ws;
              }

              // New questionnaire tool call for this slot: allow one response for this id.
              const responseKey = `${event.workspaceId}:${slotId}`;
              if (!respondedQuestionnairesRef.current[responseKey]) {
                respondedQuestionnairesRef.current[responseKey] = new Set<string>();
              }
              respondedQuestionnairesRef.current[responseKey].delete(event.toolCallId);

              return {
                ...ws,
                slots: {
                  ...ws.slots,
                  [slotId]: {
                    ...slot,
                    questionnaireRequest: {
                      toolCallId: event.toolCallId,
                      questions: event.questions,
                    },
                  },
                },
              };
            })
          );
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
          if (syncAuthoritativeWorkspacesRef.current.has(event.workspaceId)) {
            break;
          }
          const slotId = getSlotId(event);
          updateSlot(event.workspaceId, slotId, {
            queuedMessages: {
              steering: event.steering,
              followUp: event.followUp,
            },
          });
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
              branch: event.branch,
              worktree: event.worktree,
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

        // Plan events
        case 'plansList': {
          if (syncAuthoritativeWorkspacesRef.current.has(event.workspaceId)) {
            break;
          }
          window.dispatchEvent(new CustomEvent('pi:plansList', { detail: event }));
          break;
        }
        case 'planContent': {
          window.dispatchEvent(new CustomEvent('pi:planContent', { detail: event }));
          break;
        }
        case 'planSaved': {
          window.dispatchEvent(new CustomEvent('pi:planSaved', { detail: event }));
          break;
        }
        case 'activePlan': {
          if (syncAuthoritativeWorkspacesRef.current.has(event.workspaceId)) {
            break;
          }
          setActivePlanByWorkspace((prev) => ({
            ...prev,
            [event.workspaceId]: event.activePlan,
          }));
          window.dispatchEvent(new CustomEvent('pi:activePlan', { detail: event }));
          // If plan was just cleared (deactivated), clean up
          if (!event.activePlan) {
            // Dispatch event so UI knows to update
            window.dispatchEvent(new CustomEvent('pi:planDeactivated', { detail: { workspaceId: event.workspaceId } }));
          }
          break;
        }
        case 'planTaskUpdated': {
          window.dispatchEvent(new CustomEvent('pi:planTaskUpdated', { detail: event }));
          break;
        }

        // Job events
        case 'jobsList': {
          if (syncAuthoritativeWorkspacesRef.current.has(event.workspaceId)) {
            break;
          }
          window.dispatchEvent(new CustomEvent('pi:jobsList', { detail: event }));
          break;
        }
        case 'jobContent': {
          window.dispatchEvent(new CustomEvent('pi:jobContent', { detail: event }));
          break;
        }
        case 'jobSaved': {
          window.dispatchEvent(new CustomEvent('pi:jobSaved', { detail: event }));
          break;
        }
        case 'jobPromoted': {
          window.dispatchEvent(new CustomEvent('pi:jobPromoted', { detail: event }));
          break;
        }
        case 'jobTaskUpdated': {
          window.dispatchEvent(new CustomEvent('pi:jobTaskUpdated', { detail: event }));
          break;
        }
        case 'jobConversationStarted': {
          window.dispatchEvent(new CustomEvent('pi:jobConversationStarted', { detail: event }));
          break;
        }
        case 'archivedJobsList': {
          window.dispatchEvent(new CustomEvent('pi:archivedJobsList', { detail: event }));
          break;
        }
        case 'jobAttachmentAdded': {
          window.dispatchEvent(new CustomEvent('pi:jobAttachmentAdded', { detail: event }));
          break;
        }
        case 'jobAttachmentRemoved': {
          window.dispatchEvent(new CustomEvent('pi:jobAttachmentRemoved', { detail: event }));
          break;
        }
        case 'jobLocations': {
          window.dispatchEvent(new CustomEvent('pi:jobLocations', { detail: event }));
          break;
        }
        case 'activeJob': {
          if (syncAuthoritativeWorkspacesRef.current.has(event.workspaceId)) {
            break;
          }
          setActiveJobsByWorkspace((prev) => ({
            ...prev,
            [event.workspaceId]: event.activeJobs,
          }));
          window.dispatchEvent(new CustomEvent('pi:activeJob', { detail: event }));
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
      setStatusMessage(null); // Clear any reconnection message
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;

      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // DON'T clear workspace state on disconnect - preserve it for reconnection
      // The server keeps sessions running and will replay events on reconnect
      // This prevents UI flicker and lost state during network issues/device switching

      hasRestoredWorkspacesRef.current = false;
      restoredSessionsRef.current = new Set();
      syncAuthoritativeWorkspacesRef.current = new Set();
      setRestorationComplete(false);

      // Show a subtle reconnection message (non-dismissable info message)
      setStatusMessage({ text: 'Connection lost. Reconnecting...', type: 'info' });

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
        const data = JSON.parse(event.data) as { type?: string };

        if (data.type === 'snapshot') {
          handleSyncSnapshot(data as SyncSnapshotMessage);
          return;
        }

        if (data.type === 'delta') {
          handleSyncDelta(data as SyncDeltaMessage);
          return;
        }

        handleEvent(data as WsServerEvent);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }, [url, handleEvent, handleSyncSnapshot, handleSyncDelta]);

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
      syncAuthoritativeWorkspacesRef.current = new Set();
    };
  }, [connect]);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) || null;

  const withActiveWorkspace = useCallback(
    (action: (workspaceId: string) => void) => {
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) {
        setStatusMessage({ text: 'No active workspace', type: 'warning' });
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

    updateAvailable,

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
    sendQuestionnaireResponse: (slotId: string, toolCallId: string, response: string) => {
      // Prefer active workspace, but fall back to searching by slotId so close/cancel
      // still works during reconnect / workspace switching races.
      let workspaceId = activeWorkspaceIdRef.current;
      if (!workspaceId) {
        const match = workspacesRef.current.find((ws) => ws.slots[slotId]);
        workspaceId = match?.id ?? null;
      }
      if (!workspaceId) {
        return;
      }

      try {
        const responseKey = `${workspaceId}:${slotId}`;
        if (!respondedQuestionnairesRef.current[responseKey]) {
          respondedQuestionnairesRef.current[responseKey] = new Set<string>();
        }

        // Always close locally to avoid stuck UI states.
        updateSlot(workspaceId, slotId, { questionnaireRequest: null });

        // Guard: send each questionnaire response only once per toolCallId.
        if (respondedQuestionnairesRef.current[responseKey].has(toolCallId)) {
          return;
        }
        respondedQuestionnairesRef.current[responseKey].add(toolCallId);

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
    },

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
    sendCustomUIInput: (slotId: string, input: import('@pi-deck/shared').CustomUIInputEvent) =>
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
    renameSession: (workspaceId: string, sessionId: string, sessionPath: string | undefined, name: string) =>
      send({ type: 'renameSession', workspaceId, sessionId, sessionPath, name }),
    deleteSession: (workspaceId: string, sessionId: string, sessionPath?: string) => {
      send({ type: 'deleteSession', workspaceId, sessionId, sessionPath });
      send({ type: 'getSessions', workspaceId });
    },

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

    // Workspace directory watching (real-time updates)
    watchDirectory: (workspaceId: string, path: string) =>
      send({ type: 'watchDirectory', workspaceId, path }),
    unwatchDirectory: (workspaceId: string, path: string) =>
      send({ type: 'unwatchDirectory', workspaceId, path }),

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
    
    // Plans
    activePlanByWorkspace,
    getPlans: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getPlans', workspaceId })
      ),
    getPlanContent: (planPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getPlanContent', workspaceId, planPath })
      ),
    savePlan: (planPath: string, content: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'savePlan', workspaceId, planPath, content })
      ),
    activatePlan: (planPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'activatePlan', workspaceId, planPath })
      ),
    deactivatePlan: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'deactivatePlan', workspaceId })
      ),
    updatePlanTask: (planPath: string, line: number, done: boolean) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'updatePlanTask', workspaceId, planPath, line, done })
      ),
    deletePlan: (planPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'deletePlan', workspaceId, planPath })
      ),
    renamePlan: (planPath: string, newTitle: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'renamePlan', workspaceId, planPath, newTitle })
      ),

    // Jobs
    activeJobsByWorkspace,
    getJobs: (wsId?: string) => {
      const id = wsId ?? activeWorkspaceIdRef.current;
      if (!id) return;
      send({ type: 'getJobs', workspaceId: id });
    },
    getJobContent: (jobPath: string, wsId?: string) => {
      const id = wsId ?? activeWorkspaceIdRef.current;
      if (!id) return;
      send({ type: 'getJobContent', workspaceId: id, jobPath });
    },
    createJob: (title: string, description: string, tags?: string[], location?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'createJob', workspaceId, title, description, tags, location })
      ),
    getJobLocations: () =>
      withActiveWorkspace((id) => send({ type: 'getJobLocations', workspaceId: id })),
    saveJob: (jobPath: string, content: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'saveJob', workspaceId, jobPath, content })
      ),
    promoteJob: (jobPath: string, toPhase?: import('@pi-deck/shared').JobPhase) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'promoteJob', workspaceId, jobPath, toPhase })
      ),
    demoteJob: (jobPath: string, toPhase?: import('@pi-deck/shared').JobPhase) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'demoteJob', workspaceId, jobPath, toPhase })
      ),
    updateJobTask: (jobPath: string, line: number, done: boolean) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'updateJobTask', workspaceId, jobPath, line, done })
      ),
    deleteJob: (jobPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'deleteJob', workspaceId, jobPath })
      ),
    renameJob: (jobPath: string, newTitle: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'renameJob', workspaceId, jobPath, newTitle })
      ),
    archiveJob: (jobPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'archiveJob', workspaceId, jobPath })
      ),
    unarchiveJob: (jobPath: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'unarchiveJob', workspaceId, jobPath })
      ),
    getArchivedJobs: () =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'getArchivedJobs', workspaceId })
      ),

    startJobConversation: (jobPath: string, message?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'startJobConversation', workspaceId, jobPath, message })
      ),

    // Job attachments
    addJobAttachment: async (jobPath: string, file: File, onProgress?: (loaded: number, total: number) => void): Promise<void> => {
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) {
        throw new Error('No active workspace');
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const base64Data = reader.result as string;
          send({ type: 'addJobAttachment', workspaceId: wsId, jobPath, fileName: file.name, mediaType: file.type, base64Data });
          resolve();
        };

        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };

        if (onProgress) {
          reader.onprogress = (event) => {
            if (event.lengthComputable) {
              onProgress(event.loaded, event.total);
            }
          };
        }

        reader.readAsDataURL(file);
      });
    },
    removeJobAttachment: (jobPath: string, attachmentId: string) => {
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) return;
      send({ type: 'removeJobAttachment', workspaceId: wsId, jobPath, attachmentId });
    },
    readJobAttachment: (jobPath: string, attachmentId: string): Promise<{ base64Data: string; mediaType: string } | null> => {
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) return Promise.resolve(null);

      return new Promise((resolve) => {
        let cleanup: (() => void) | null = null;

        const handleMessage = (event: MessageEvent) => {
          const data = JSON.parse(event.data) as WsServerEvent;

          if (data.type === 'jobAttachmentRead' && data.jobPath === jobPath && data.attachmentId === attachmentId) {
            cleanup?.();
            resolve({ base64Data: data.base64Data, mediaType: data.mediaType });
          }

          if (data.type === 'error' && data.workspaceId === activeWorkspaceIdRef.current) {
            cleanup?.();
            resolve(null);
          }
        };

        wsRef.current?.addEventListener('message', handleMessage);
        cleanup = () => {
          wsRef.current?.removeEventListener('message', handleMessage);
        };

        send({ type: 'readJobAttachment', workspaceId: wsId, jobPath, attachmentId });

        // Timeout after 30 seconds
        setTimeout(() => {
          cleanup?.();
          resolve(null);
        }, 30000);
      });
    },

    // Job configuration
    browseJobDirectory: (path?: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'browseJobDirectory', workspaceId, path })
      ),
    addJobLocation: (path: string) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'updateJobConfig', workspaceId, addLocation: path })
      ),
    updateJobConfig: (config: { locations?: string[]; defaultLocation?: string; addLocation?: string; removeLocation?: string }) =>
      withActiveWorkspace((workspaceId) =>
        send({ type: 'updateJobConfig', workspaceId, ...config })
      ),

    // Status message (dismissable)
    statusMessage,
    dismissStatusMessage: () => setStatusMessage(null),
  };
}
