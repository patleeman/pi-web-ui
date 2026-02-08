/**
 * Pi-Deck
 * 
 * Multi-pane interface - TUI-style web experience.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Menu, FileText, ChevronLeft } from 'lucide-react';
import { useWorkspaces } from './hooks/useWorkspaces';
import { usePanes } from './hooks/usePanes';
import { useNotifications } from './hooks/useNotifications';
import { useIsMobile } from './hooks/useIsMobile';
import { useKeyboardVisible } from './hooks/useKeyboardVisible';
import { PaneManager } from './components/PaneManager';

import { ConnectionStatus } from './components/ConnectionStatus';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { Settings } from './components/Settings';
// HotkeysDialog merged into Settings
import { PaneTabsBar } from './components/PaneTabsBar';
import { WorkspaceRail } from './components/WorkspaceRail';
import { ConversationSidebar } from './components/ConversationSidebar';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceFilesPane } from './components/WorkspaceFilesPane';
import { useSettings } from './contexts/SettingsContext';
import type { FileInfo, PaneLayoutNode, PaneTabPageState, ScopedModelInfo } from '@pi-deck/shared';
import { matchesHotkey } from './hotkeys';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:9741/ws'
  : `ws://${window.location.host}/ws`;

const WORKSPACE_RAIL_WIDTH = 56;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const RIGHT_PANE_MIN_RATIO = 0.2;
const RIGHT_PANE_MAX_RATIO = 0.8;
const RIGHT_PANE_HANDLE_WIDTH = 32;

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createTabId = () => createId('tab');
const createPaneId = () => createId('pane');
const createSlotId = () => createId('slot');

const createSinglePaneLayout = (slotId: string, paneId = createPaneId()): PaneLayoutNode => ({
  type: 'pane',
  id: paneId,
  slotId,
});

const TAB_LABEL_PATTERN = /^Tab\s+(\d+)$/i;

const getNextTabNumber = (tabs: PaneTabPageState[]): number => {
  const numbers = tabs
    .map((tab) => {
      const match = TAB_LABEL_PATTERN.exec(tab.label.trim());
      if (!match) return null;
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);

  if (numbers.length === 0) return tabs.length + 1;
  return Math.max(...numbers) + 1;
};

const collectPaneNodes = (node: PaneLayoutNode): Array<{ id: string; slotId: string }> => {
  if (node.type === 'pane') return [node];
  return node.children.flatMap(collectPaneNodes);
};

const findSlotIdByPaneId = (node: PaneLayoutNode, paneId: string): string | null => {
  const pane = collectPaneNodes(node).find((item) => item.id === paneId);
  return pane?.slotId || null;
};

const areFileInfosEqual = (left?: FileInfo[], right?: FileInfo[]): boolean => {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return entry.name === other.name
      && entry.path === other.path
      && entry.isDirectory === other.isDirectory
      && entry.gitStatus === other.gitStatus
      && entry.hasChanges === other.hasChanges;
  });
};

const areGitStatusEqual = (
  left?: Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>,
  right?: Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>
): boolean => {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return entry.path === other.path && entry.status === other.status;
  });
};

function App() {
  const ws = useWorkspaces(WS_URL);
  const notifications = useNotifications({ titlePrefix: 'Pi' });
  const isMobile = useIsMobile();
  const isKeyboardVisible = useKeyboardVisible();
  const { settings, openSettings, closeSettings, isSettingsOpen } = useSettings();
  const hk = settings.hotkeyOverrides;
  
  const [showBrowser, setShowBrowser] = useState(false);
  
  // Scoped models for Settings (requested from focused slot)
  const [settingsScopedModels, setSettingsScopedModels] = useState<ScopedModelInfo[]>([]);
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set());

  // New feature state - collapse toggles (not fully implemented yet)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_allToolsCollapsed, setAllToolsCollapsed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_allThinkingCollapsed, setAllThinkingCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [pendingPaneFocus, setPendingPaneFocus] = useState<{ workspaceId: string; tabId: string; paneId: string } | null>(null);
  const [pendingSlotAttach, setPendingSlotAttach] = useState<{ workspaceId: string; tabId: string; paneId: string; slotId: string } | null>(null);
  const [pendingSessionLoad, setPendingSessionLoad] = useState<{
    workspaceId: string;
    tabId: string;
    slotId: string;
    sessionId: string;
    sessionPath?: string;
  } | null>(null);
  const [workspaceEntries, setWorkspaceEntries] = useState<Record<string, Record<string, FileInfo[]>>>({});
  const [workspaceFileContents, setWorkspaceFileContents] = useState<Record<string, Record<string, { content: string; truncated: boolean }>>>({});
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<Record<string, Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>>>({});
  const [workspaceGitBranch, setWorkspaceGitBranch] = useState<Record<string, string | null>>({});
  const [workspaceGitWorktree, setWorkspaceGitWorktree] = useState<Record<string, string | null>>({});
  const [workspaceFileDiffs, setWorkspaceFileDiffs] = useState<Record<string, Record<string, string>>>({});
  const [openFilePathByWorkspace, setOpenFilePathByWorkspace] = useState<Record<string, string>>({});
  const [selectedFilePathByWorkspace, setSelectedFilePathByWorkspace] = useState<Record<string, string>>({});
  const [viewModeByWorkspace, setViewModeByWorkspace] = useState<Record<string, 'file' | 'diff'>>({});
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(Math.max(ws.sidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
  const [rightPaneRatio, setRightPaneRatio] = useState(0.5);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isRightPaneResizing, setIsRightPaneResizing] = useState(false);
  
  const layoutRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  
  // Ref for ws to stabilize callbacks that only need send/isConnected
  const wsRef = useRef(ws);
  wsRef.current = ws;
  
  const workspaceEntriesRequestedRef = useRef<Record<string, Set<string>>>({});
  const workspaceFileRequestsRef = useRef<Record<string, Set<string>>>({});
  const sessionSlotRequestsRef = useRef<Record<string, Set<string>>>({});
  const sessionSlotListRequestedRef = useRef<Set<string>>(new Set());
  
  // Mobile pane index - tracks which pane is shown on mobile (separate from focusedPaneId)
  const [mobilePaneIndex, setMobilePaneIndex] = useState(0);
  
  // Keep mobile pane index in bounds when panes are added/removed
  const prevPaneCountRef = useRef(0);
  
  const prevStreamingRef = useRef<Record<string, boolean>>({});
  // Track which slots have had the default model applied (to avoid re-applying)
  const defaultModelAppliedRef = useRef<Set<string>>(new Set());

  const activeWorkspacePath = ws.activeWorkspace?.path ?? null;
  const activeWorkspaceTabs = useMemo(() => {
    if (!activeWorkspacePath) return [];
    return ws.paneTabsByWorkspace[activeWorkspacePath] || [];
  }, [activeWorkspacePath, ws.paneTabsByWorkspace]);

  const activeTabId = useMemo(() => {
    if (!activeWorkspacePath) return null;
    const stored = ws.activePaneTabByWorkspace[activeWorkspacePath];
    if (stored && activeWorkspaceTabs.some((tab) => tab.id === stored)) {
      return stored;
    }
    return activeWorkspaceTabs[0]?.id ?? null;
  }, [activeWorkspacePath, activeWorkspaceTabs, ws.activePaneTabByWorkspace]);

  const activeTab = useMemo(() => {
    if (!activeTabId) return null;
    return activeWorkspaceTabs.find((tab) => tab.id === activeTabId) || null;
  }, [activeTabId, activeWorkspaceTabs]);

  const tabIdsByWorkspace = useMemo(() => {
    const next: Record<string, string[]> = {};
    ws.workspaces.forEach((workspace) => {
      const tabs = ws.paneTabsByWorkspace[workspace.path] || [];
      next[workspace.id] = tabs.map((tab) => tab.id);
    });
    return next;
  }, [ws.workspaces, ws.paneTabsByWorkspace]);

  // Pane management - connected to workspace session slots
  const panes = usePanes({
    workspace: ws.activeWorkspace,
    workspaceIds: ws.workspaces.map(w => w.id),
    tabId: activeTabId,
    tabIdsByWorkspace,
    initialLayout: activeTab?.layout ?? null,
    initialFocusedPaneId: activeTab?.focusedPaneId ?? null,
    onCreateSlot: ws.createSessionSlotForWorkspace,
    onCloseSlot: ws.closeSessionSlotForWorkspace,
  });

  useEffect(() => {
    if (!isSidebarResizing) {
      const clampedWidth = Math.min(Math.max(ws.sidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      setSidebarWidth(clampedWidth);
    }
  }, [isSidebarResizing, ws.sidebarWidth]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Keep mobile pane index in bounds and sync with focused pane
  useEffect(() => {
    const paneCount = panes.panes.length;
    
    // Clamp index if out of bounds
    if (mobilePaneIndex >= paneCount && paneCount > 0) {
      setMobilePaneIndex(paneCount - 1);
    }
    
    // If a pane was added (count increased), switch to the new pane
    if (paneCount > prevPaneCountRef.current && paneCount > 1) {
      setMobilePaneIndex(paneCount - 1);
    }
    
    prevPaneCountRef.current = paneCount;
  }, [panes.panes.length, mobilePaneIndex]);
  
  // Sync focus when mobile pane changes
  useEffect(() => {
    if (isMobile && panes.panes[mobilePaneIndex]) {
      panes.focusPane(panes.panes[mobilePaneIndex].id);
    }
  }, [isMobile, mobilePaneIndex, panes]);

  const focusPaneById = useCallback((paneId: string) => {
    panes.focusPane(paneId);
    if (isMobile) {
      const idx = panes.panes.findIndex((pane) => pane.id === paneId);
      if (idx >= 0) {
        setMobilePaneIndex(idx);
      }
    }
  }, [panes, isMobile]);

  useEffect(() => {
    if (!pendingPaneFocus) return;
    if (pendingPaneFocus.workspaceId !== ws.activeWorkspaceId) return;
    if (pendingPaneFocus.tabId !== activeTabId) return;
    focusPaneById(pendingPaneFocus.paneId);
    setPendingPaneFocus(null);
  }, [pendingPaneFocus, ws.activeWorkspaceId, activeTabId, focusPaneById]);

  useEffect(() => {
    if (!pendingSlotAttach) return;
    if (pendingSlotAttach.workspaceId !== ws.activeWorkspaceId) return;
    if (pendingSlotAttach.tabId !== activeTabId) return;
    panes.updatePaneSlot(pendingSlotAttach.paneId, pendingSlotAttach.slotId);
    focusPaneById(pendingSlotAttach.paneId);
    setPendingSlotAttach(null);
  }, [pendingSlotAttach, ws.activeWorkspaceId, activeTabId, panes.updatePaneSlot, focusPaneById]);

  const resolveSessionPath = useCallback((workspaceId: string, sessionId: string, sessionPath?: string) => {
    if (sessionPath) return sessionPath;
    const workspace = ws.workspaces.find((wsItem) => wsItem.id === workspaceId);
    const fromList = workspace?.sessions.find((session) => session.id === sessionId)?.path;
    if (fromList) return fromList;
    const fromSlot = Object.values(workspace?.slots || {})
      .find((slot) => slot.state?.sessionId === sessionId)?.state?.sessionFile;
    if (fromSlot) return fromSlot;
    if (sessionId.includes('/') || sessionId.endsWith('.jsonl')) return sessionId;
    return null;
  }, [ws.workspaces]);

  useEffect(() => {
    if (!pendingSessionLoad) return;
    if (pendingSessionLoad.workspaceId !== ws.activeWorkspaceId) return;
    if (pendingSessionLoad.tabId !== activeTabId) return;
    const targetSession = resolveSessionPath(
      pendingSessionLoad.workspaceId,
      pendingSessionLoad.sessionId,
      pendingSessionLoad.sessionPath
    );
    if (!targetSession) {
      console.warn('[App] Missing session path for switchSession', pendingSessionLoad);
      setPendingSessionLoad(null);
      return;
    }
    ws.switchSession(pendingSessionLoad.slotId, targetSession);
    setPendingSessionLoad(null);
  }, [pendingSessionLoad, resolveSessionPath, ws.activeWorkspaceId, activeTabId, ws.switchSession]);

  // Track when agent finishes for notifications
  useEffect(() => {
    for (const workspace of ws.workspaces) {
      for (const [slotId, slot] of Object.entries(workspace.slots)) {
        const key = `${workspace.id}:${slotId}`;
        const wasStreaming = prevStreamingRef.current[key];
        const isStreaming = slot.isStreaming;
        
        if (wasStreaming && !isStreaming) {
          if (workspace.id !== ws.activeWorkspaceId) {
            setNeedsAttention(prev => new Set(prev).add(workspace.id));
          }
          notifications.notify('Task complete', {
            body: `Agent finished in ${workspace.name}`,
          });
        }
        prevStreamingRef.current[key] = isStreaming;
      }
    }
  }, [ws.workspaces, ws.activeWorkspaceId, notifications]);

  // Apply default model to newly initialized sessions
  useEffect(() => {
    const { defaultModelKey, defaultThinkingLevel } = settings;
    if (!defaultModelKey) return;

    const [provider, modelId] = defaultModelKey.split(':');
    if (!provider || !modelId) return;

    for (const workspace of ws.workspaces) {
      for (const [slotId, slot] of Object.entries(workspace.slots)) {
        const key = `${workspace.id}:${slotId}`;
        // Only apply once per slot, and only when the session first appears
        // with 0 messages (fresh session, not a resumed one)
        if (defaultModelAppliedRef.current.has(key)) continue;
        if (!slot.state?.sessionId) continue;
        // Mark as applied immediately to avoid duplicate sends
        defaultModelAppliedRef.current.add(key);
        // Only apply to fresh sessions (no messages yet)
        if (slot.messages.length > 0 || (slot.state.messageCount ?? 0) > 0) continue;
        // Don't override if the slot already has the correct model
        if (slot.state.model?.provider === provider && slot.state.model?.id === modelId) continue;
        ws.setModel(slotId, provider, modelId);
        if (defaultThinkingLevel && defaultThinkingLevel !== 'off') {
          ws.setThinkingLevel(slotId, defaultThinkingLevel as import('@pi-deck/shared').ThinkingLevel);
        }
      }
    }
  }, [ws.workspaces, settings.defaultModelKey, settings.defaultThinkingLevel, ws.setModel, ws.setThinkingLevel]);

  // Notify on job phase changes (auto-promote)
  useEffect(() => {
    const handleJobPromoted = (e: CustomEvent<{ workspaceId: string; job: { title: string; phase: string } }>) => {
      const { job } = e.detail;
      const phaseLabels: Record<string, string> = {
        planning: 'Planning',
        ready: 'Ready',
        executing: 'Executing',
        review: 'Review',
        complete: 'Complete ✓',
      };
      const phaseLabel = phaseLabels[job.phase] || job.phase;
      notifications.notify(`Job → ${phaseLabel}`, {
        body: job.title,
      });
    };

    window.addEventListener('pi:jobPromoted', handleJobPromoted as EventListener);
    return () => window.removeEventListener('pi:jobPromoted', handleJobPromoted as EventListener);
  }, [notifications]);

  // Clear attention when switching workspace
  useEffect(() => {
    if (ws.activeWorkspaceId) {
      setNeedsAttention(prev => {
        const next = new Set(prev);
        next.delete(ws.activeWorkspaceId!);
        return next;
      });
    }
  }, [ws.activeWorkspaceId]);

  // Listen for plan activation — create a new tab for the plan's session slot
  useEffect(() => {
    const handlePlanSlotCreated = (e: CustomEvent<{ workspaceId: string; sessionSlotId: string; planTitle?: string }>) => {
      const { workspaceId, sessionSlotId, planTitle } = e.detail;
      const workspace = ws.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return;
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
      const newTabId = createTabId();
      const newPaneId = createPaneId();
      const newTab: PaneTabPageState = {
        id: newTabId,
        label: planTitle || 'Plan',
        layout: createSinglePaneLayout(sessionSlotId, newPaneId),
        focusedPaneId: newPaneId,
      };
      ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    };

    window.addEventListener('pi:planSlotCreated', handlePlanSlotCreated as EventListener);
    return () => window.removeEventListener('pi:planSlotCreated', handlePlanSlotCreated as EventListener);
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  // Listen for job promotion — create a new tab for the job's session slot
  useEffect(() => {
    const handleJobSlotCreated = (e: CustomEvent<{ workspaceId: string; sessionSlotId: string }>) => {
      const { workspaceId, sessionSlotId } = e.detail;
      const workspace = ws.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return;
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];

      // Check if a tab for this slot already exists (re-promotion)
      const existingTab = tabs.find(t =>
        t.layout.type === 'pane' && t.layout.slotId === sessionSlotId
      );
      if (existingTab) {
        // Just switch to the existing tab
        ws.setPaneTabsForWorkspace(workspacePath, tabs, existingTab.id);
        return;
      }

      const newTabId = createTabId();
      const newPaneId = createPaneId();
      // Derive label from slot ID: "job-planning-..." → "Job: Planning", "job-executing-..." → "Job: Executing", "job-review-..." → "Job: Review"
      const phaseMatch = sessionSlotId.match(/^job-(planning|executing|review)/);
      const label = phaseMatch ? `Job: ${phaseMatch[1].charAt(0).toUpperCase() + phaseMatch[1].slice(1)}` : 'Job';
      const newTab: PaneTabPageState = {
        id: newTabId,
        label,
        layout: createSinglePaneLayout(sessionSlotId, newPaneId),
        focusedPaneId: newPaneId,
      };
      ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    };

    window.addEventListener('pi:jobSlotCreated', handleJobSlotCreated as EventListener);
    return () => window.removeEventListener('pi:jobSlotCreated', handleJobSlotCreated as EventListener);
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  // Listen for /jobs slash command — open right pane to jobs tab
  useEffect(() => {
    const handleOpenJobs = (e: CustomEvent<{ mode?: 'list' | 'create' }>) => {
      if (ws.activeWorkspace?.path) {
        const isOpen = ws.rightPaneByWorkspace[ws.activeWorkspace.path] ?? false;
        if (!isOpen) {
          ws.setWorkspaceRightPaneOpen(ws.activeWorkspace.path, true);
        }
        window.dispatchEvent(new CustomEvent('pi:switchRightPaneTab', { detail: { tab: 'jobs', mode: e.detail?.mode } }));
      }
    };

    window.addEventListener('pi:openJobs', handleOpenJobs as EventListener);
    return () => window.removeEventListener('pi:openJobs', handleOpenJobs as EventListener);
  }, [ws.activeWorkspace, ws.rightPaneByWorkspace, ws.setWorkspaceRightPaneOpen]);

  useEffect(() => {
    const handleWorkspaceEntries = (e: CustomEvent<{ workspaceId: string; path: string; entries: FileInfo[]; requestId?: string }>) => {
      if (e.detail.requestId && !e.detail.requestId.startsWith('workspace-entries:')) return;
      setWorkspaceEntries(prev => {
        const existing = prev[e.detail.workspaceId]?.[e.detail.path];
        if (areFileInfosEqual(existing, e.detail.entries)) {
          return prev;
        }
        return {
          ...prev,
          [e.detail.workspaceId]: {
            ...(prev[e.detail.workspaceId] || {}),
            [e.detail.path]: e.detail.entries,
          },
        };
      });
      const requested = workspaceEntriesRequestedRef.current[e.detail.workspaceId];
      if (requested) {
        requested.delete(e.detail.path);
      }
    };

    window.addEventListener('pi:workspaceEntries', handleWorkspaceEntries as EventListener);
    return () => window.removeEventListener('pi:workspaceEntries', handleWorkspaceEntries as EventListener);
  }, []);

  // Handle directory entries updates from file watcher sync
  useEffect(() => {
    const handleDirectoryEntries = (e: CustomEvent<{ workspaceId: string; directoryPath: string; entries: FileInfo[] }>) => {
      setWorkspaceEntries(prev => {
        const existing = prev[e.detail.workspaceId]?.[e.detail.directoryPath];
        if (areFileInfosEqual(existing, e.detail.entries)) {
          return prev;
        }
        return {
          ...prev,
          [e.detail.workspaceId]: {
            ...(prev[e.detail.workspaceId] || {}),
            [e.detail.directoryPath]: e.detail.entries,
          },
        };
      });
    };

    window.addEventListener('pi:directoryEntries', handleDirectoryEntries as EventListener);
    return () => window.removeEventListener('pi:directoryEntries', handleDirectoryEntries as EventListener);
  }, []);

  useEffect(() => {
    const handleWorkspaceFile = (e: CustomEvent<{ workspaceId: string; path: string; content: string; truncated?: boolean; requestId?: string }>) => {
      if (e.detail.requestId && !e.detail.requestId.startsWith('workspace-file:')) return;
      setWorkspaceFileContents(prev => {
        const existing = prev[e.detail.workspaceId]?.[e.detail.path];
        const nextEntry = { content: e.detail.content, truncated: Boolean(e.detail.truncated) };
        if (existing && existing.content === nextEntry.content && existing.truncated === nextEntry.truncated) {
          return prev;
        }
        return {
          ...prev,
          [e.detail.workspaceId]: {
            ...(prev[e.detail.workspaceId] || {}),
            [e.detail.path]: nextEntry,
          },
        };
      });
      const requested = workspaceFileRequestsRef.current[e.detail.workspaceId];
      if (requested) {
        requested.delete(e.detail.path);
      }
    };

    window.addEventListener('pi:workspaceFile', handleWorkspaceFile as EventListener);
    return () => window.removeEventListener('pi:workspaceFile', handleWorkspaceFile as EventListener);
  }, []);

  useEffect(() => {
    const handleGitStatus = (e: CustomEvent<{ workspaceId: string; files: Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>; branch?: string | null; worktree?: string | null; requestId?: string }>) => {
      setWorkspaceGitStatus(prev => {
        const existing = prev[e.detail.workspaceId];
        if (areGitStatusEqual(existing, e.detail.files)) {
          return prev;
        }
        return {
          ...prev,
          [e.detail.workspaceId]: e.detail.files,
        };
      });
      if (e.detail.branch !== undefined) {
        setWorkspaceGitBranch(prev => {
          if (prev[e.detail.workspaceId] === e.detail.branch) return prev;
          return { ...prev, [e.detail.workspaceId]: e.detail.branch ?? null };
        });
      }
      if (e.detail.worktree !== undefined) {
        setWorkspaceGitWorktree(prev => {
          if (prev[e.detail.workspaceId] === e.detail.worktree) return prev;
          return { ...prev, [e.detail.workspaceId]: e.detail.worktree ?? null };
        });
      }
    };

    window.addEventListener('pi:gitStatus', handleGitStatus as EventListener);
    return () => window.removeEventListener('pi:gitStatus', handleGitStatus as EventListener);
  }, []);

  useEffect(() => {
    const handleFileDiff = (e: CustomEvent<{ workspaceId: string; path: string; diff: string; requestId?: string }>) => {
      setWorkspaceFileDiffs(prev => {
        const existing = prev[e.detail.workspaceId]?.[e.detail.path];
        if (existing === e.detail.diff) {
          return prev;
        }
        return {
          ...prev,
          [e.detail.workspaceId]: {
            ...(prev[e.detail.workspaceId] || {}),
            [e.detail.path]: e.detail.diff,
          },
        };
      });
    };

    window.addEventListener('pi:fileDiff', handleFileDiff as EventListener);
    return () => window.removeEventListener('pi:fileDiff', handleFileDiff as EventListener);
  }, []);

  const requestWorkspaceEntries = useCallback((workspaceId: string, path: string) => {
    if (!wsRef.current.isConnected) return;
    const normalizedPath = path.replace(/^\/+/, '');
    const requested = workspaceEntriesRequestedRef.current[workspaceId] || new Set<string>();
    if (requested.has(normalizedPath)) return;
    requested.add(normalizedPath);
    workspaceEntriesRequestedRef.current[workspaceId] = requested;
    const requestId = `workspace-entries:${workspaceId}:${normalizedPath}:${Date.now()}`;
    wsRef.current.listWorkspaceEntries(workspaceId, normalizedPath, requestId);
  }, []);

  // File watching for expanded directories
  // Use wsRef to keep callbacks stable (avoids SidebarFileTree useEffect re-triggering)
  const watchDirectory = useCallback((workspaceId: string, path: string) => {
    if (!wsRef.current.isConnected) return;
    wsRef.current.watchDirectory(workspaceId, path);
  }, []);

  const unwatchDirectory = useCallback((workspaceId: string, path: string) => {
    if (!wsRef.current.isConnected) return;
    wsRef.current.unwatchDirectory(workspaceId, path);
  }, []);

  const requestWorkspaceFile = useCallback((workspaceId: string, path: string) => {
    if (!ws.isConnected) return;
    // Preserve absolute and ~/ paths; strip stray leading slashes from relative paths
    const normalizedPath = (path.startsWith('/') || path.startsWith('~/')) ? path : path.replace(/^\/+/, '');
    if (!normalizedPath) return;
    const requested = workspaceFileRequestsRef.current[workspaceId] || new Set<string>();
    if (requested.has(normalizedPath)) return;
    requested.add(normalizedPath);
    workspaceFileRequestsRef.current[workspaceId] = requested;
    const requestId = `workspace-file:${workspaceId}:${normalizedPath}:${Date.now()}`;
    ws.readWorkspaceFile(workspaceId, normalizedPath, requestId);
  }, [ws]);

  const requestGitStatus = useCallback((workspaceId: string) => {
    if (!wsRef.current.isConnected) return;
    wsRef.current.getGitStatus(workspaceId);
  }, []);

  const requestFileDiff = useCallback((workspaceId: string, path: string) => {
    if (!ws.isConnected) return;
    ws.getFileDiff(workspaceId, path);
  }, [ws]);

  const normalizeFileLink = useCallback((path: string) => {
    const trimmed = path.replace(/^file:\/\//i, '');
    // Expand ~/ to home directory so paths are comparable with workspace paths
    if (trimmed.startsWith('~/') && ws.homeDirectory) {
      return ws.homeDirectory.replace(/\/+$/, '') + '/' + trimmed.slice(2);
    }
    // Preserve absolute paths
    if (trimmed.startsWith('/')) return trimmed;
    // Relative paths: strip ./ prefix
    return trimmed.replace(/^\.\//, '');
  }, [ws.homeDirectory]);

  // Handle file selection from sidebar tree
  const handleSelectFile = useCallback((path: string) => {
    if (!ws.activeWorkspace) return;
    const workspaceId = ws.activeWorkspace.id;
    setSelectedFilePathByWorkspace(prev => ({ ...prev, [workspaceId]: path }));
    setViewModeByWorkspace(prev => ({ ...prev, [workspaceId]: 'file' }));
    requestWorkspaceFile(workspaceId, path);
    // Open right pane if closed, switch to preview tab
    const isOpen = ws.rightPaneByWorkspace[ws.activeWorkspace.path] ?? false;
    if (!isOpen) ws.setWorkspaceRightPaneOpen(ws.activeWorkspace.path, true);
    window.dispatchEvent(new CustomEvent('pi:switchRightPaneTab', { detail: { tab: 'preview' } }));
  }, [ws.activeWorkspace, ws.rightPaneByWorkspace, ws.setWorkspaceRightPaneOpen, requestWorkspaceFile]);

  const handleSelectGitFile = useCallback((path: string) => {
    if (!ws.activeWorkspace) return;
    const workspaceId = ws.activeWorkspace.id;
    setSelectedFilePathByWorkspace(prev => ({ ...prev, [workspaceId]: path }));
    setViewModeByWorkspace(prev => ({ ...prev, [workspaceId]: 'diff' }));
    requestFileDiff(workspaceId, path);
    const isOpen = ws.rightPaneByWorkspace[ws.activeWorkspace.path] ?? false;
    if (!isOpen) ws.setWorkspaceRightPaneOpen(ws.activeWorkspace.path, true);
    window.dispatchEvent(new CustomEvent('pi:switchRightPaneTab', { detail: { tab: 'preview' } }));
  }, [ws.activeWorkspace, ws.rightPaneByWorkspace, ws.setWorkspaceRightPaneOpen, requestFileDiff]);

  useEffect(() => {
    const handleOpenFile = (e: CustomEvent<{ path: string }>) => {
      if (!ws.activeWorkspace) return;
      const normalizedPath = normalizeFileLink(e.detail.path || '');
      if (!normalizedPath) return;

      const workspaceId = ws.activeWorkspace.id;
      const workspacePath = ws.activeWorkspace.path;
      // Compute relative path for tree highlighting
      const wsPrefix = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/';
      const relativePath = normalizedPath.startsWith(wsPrefix)
        ? normalizedPath.slice(wsPrefix.length)
        : normalizedPath;
      setOpenFilePathByWorkspace((prev) => ({ ...prev, [workspaceId]: normalizedPath }));
      setSelectedFilePathByWorkspace(prev => ({ ...prev, [workspaceId]: relativePath }));
      setViewModeByWorkspace(prev => ({ ...prev, [workspaceId]: 'file' }));
      requestWorkspaceFile(workspaceId, normalizedPath);

      const isOpen = ws.rightPaneByWorkspace[workspacePath] ?? false;
      if (!isOpen) {
        ws.setWorkspaceRightPaneOpen(workspacePath, true);
      }
    };

    window.addEventListener('pi:openFile', handleOpenFile as EventListener);
    return () => window.removeEventListener('pi:openFile', handleOpenFile as EventListener);
  }, [normalizeFileLink, requestWorkspaceFile, ws.activeWorkspace, ws.rightPaneByWorkspace, ws.setWorkspaceRightPaneOpen]);

  const toggleRightPane = useCallback(() => {
    if (!ws.activeWorkspace?.path) return;
    const current = ws.rightPaneByWorkspace[ws.activeWorkspace.path] ?? false;
    ws.setWorkspaceRightPaneOpen(ws.activeWorkspace.path, !current);
  }, [ws]);

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    sidebarResizeRef.current = { startX: event.clientX, startWidth: sidebarWidthRef.current };
    setIsSidebarResizing(true);
  }, []);

  const handleRightPaneResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsRightPaneResizing(true);
  }, []);

  useEffect(() => {
    if (!isSidebarResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!sidebarResizeRef.current) return;
      const delta = event.clientX - sidebarResizeRef.current.startX;
      const nextWidth = sidebarResizeRef.current.startWidth + delta;
      const clampedWidth = Math.min(Math.max(nextWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      sidebarWidthRef.current = clampedWidth;
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsSidebarResizing(false);
      sidebarResizeRef.current = null;
      ws.setSidebarWidth(Math.round(sidebarWidthRef.current));
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarResizing, ws.setSidebarWidth]);

  useEffect(() => {
    if (!isRightPaneResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = layoutRef.current?.getBoundingClientRect();
      if (!container) return;
      const leftWidth = WORKSPACE_RAIL_WIDTH + sidebarWidthRef.current;
      const availableWidth = container.width - leftWidth;
      if (availableWidth <= 0) return;
      const ratio = (container.right - event.clientX) / availableWidth;
      const clampedRatio = Math.min(Math.max(ratio, RIGHT_PANE_MIN_RATIO), RIGHT_PANE_MAX_RATIO);
      setRightPaneRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      setIsRightPaneResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRightPaneResizing]);

  const handleClosePane = useCallback((paneId: string) => {
    const pane = panes.panes.find((item) => item.id === paneId);
    if (!pane) return;
    if (panes.panes.length <= 1) {
      ws.newSession(pane.sessionSlotId);
      return;
    }
    panes.closePane(paneId);
  }, [panes.panes, panes.closePane, ws]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement | null;
    const isTypingTarget = target ? (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) : false;

    // Escape closes modals/settings
    if (e.key === 'Escape') {
      if (isSettingsOpen) {
        closeSettings();
        return;
      }
      if (showBrowser) {
        setShowBrowser(false);
        return;
      }
    }

    if (isTypingTarget && !isMod) {
      return;
    }

    // Configurable hotkeys (checked via matchesHotkey)
    if (matchesHotkey(e, 'showHotkeys', hk)) {
      e.preventDefault();
      openSettings('keyboard');
      return;
    }
    if (matchesHotkey(e, 'openDirectory', hk)) {
      e.preventDefault();
      setShowBrowser(true);
      return;
    }
    if (matchesHotkey(e, 'openSettings', hk)) {
      e.preventDefault();
      openSettings();
      return;
    }
    if (matchesHotkey(e, 'toggleFilePane', hk)) {
      e.preventDefault();
      toggleRightPane();
      return;
    }
    if (matchesHotkey(e, 'toggleJobs', hk)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('pi:openJobs', { detail: { mode: 'list' } }));
      return;
    }
    if (matchesHotkey(e, 'splitVertical', hk) && !isMobile) {
      e.preventDefault();
      panes.split('vertical');
      return;
    }
    if (matchesHotkey(e, 'splitHorizontal', hk) && !isMobile) {
      e.preventDefault();
      panes.split('horizontal');
      return;
    }
    if (matchesHotkey(e, 'closePane', hk)) {
      e.preventDefault();
      if (panes.focusedPaneId) {
        handleClosePane(panes.focusedPaneId);
      }
      return;
    }

    // ⌘1-9 - Switch tab by number (not configurable — positional)
    if (isMod && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < activeWorkspaceTabs.length && ws.activeWorkspace) {
        e.preventDefault();
        const workspacePath = ws.activeWorkspace.path;
        const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
        ws.setPaneTabsForWorkspace(workspacePath, tabs, activeWorkspaceTabs[idx].id);
      }
      return;
    }

    if (matchesHotkey(e, 'stopAgent', hk) && panes.focusedSlotId) {
      e.preventDefault();
      ws.abort(panes.focusedSlotId);
      return;
    }
  }, [showBrowser, isSettingsOpen, closeSettings, openSettings, toggleRightPane, isMobile, panes, handleClosePane, ws, activeWorkspaceTabs, hk]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [handleKeyDown]);

  // Request scoped models when settings opens, listen for response
  useEffect(() => {
    if (!isSettingsOpen) return;
    const slotId = panes.focusedSlotId || 'default';
    ws.getScopedModels(slotId);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSettingsScopedModels(detail.models || []);
    };
    window.addEventListener('pi:scopedModels', handler);
    return () => window.removeEventListener('pi:scopedModels', handler);
  }, [isSettingsOpen, panes.focusedSlotId, ws]);

  // Handle deploy
  const handleDeploy = useCallback(() => {
    ws.deploy();
  }, [ws]);

  // Handle questionnaire response
  const handleQuestionnaireResponse = useCallback((slotId: string, toolCallId: string, response: string) => {
    ws.sendQuestionnaireResponse(slotId, toolCallId, response);
  }, [ws]);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    ws.setActiveWorkspace(workspaceId);
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  }, [ws, isMobile]);

  const slotToTabByWorkspace = useMemo(() => {
    const result: Record<string, Map<string, { tabId: string; paneId: string }>> = {};
    ws.workspaces.forEach((workspace) => {
      const tabs = ws.paneTabsByWorkspace[workspace.path] || [];
      const slotMap = new Map<string, { tabId: string; paneId: string }>();
      tabs.forEach((tab) => {
        collectPaneNodes(tab.layout).forEach((pane) => {
          if (!slotMap.has(pane.slotId)) {
            slotMap.set(pane.slotId, { tabId: tab.id, paneId: pane.id });
          }
        });
      });
      result[workspace.id] = slotMap;
    });
    return result;
  }, [ws.workspaces, ws.paneTabsByWorkspace]);

  const handleSelectConversation = useCallback((workspaceId: string, sessionId: string, sessionPath?: string, slotId?: string) => {
    const workspace = ws.workspaces.find((wsItem) => wsItem.id === workspaceId);
    if (!workspace) return;
    const workspacePath = workspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    if (tabs.length === 0) return;

    const storedActiveTabId = ws.activePaneTabByWorkspace[workspacePath];
    const activeTabForWorkspace = storedActiveTabId && tabs.some((tab) => tab.id === storedActiveTabId)
      ? storedActiveTabId
      : tabs[0].id;
    const slotMap = slotToTabByWorkspace[workspaceId];
    const tabInfo = slotId ? slotMap?.get(slotId) : null;
    const targetTabId = tabInfo?.tabId || activeTabForWorkspace;
    const targetTab = tabs.find((tab) => tab.id === targetTabId) || tabs[0];
    if (!targetTab) return;

    const currentActiveTabId = workspaceId === ws.activeWorkspaceId ? activeTabId : activeTabForWorkspace;
    // When targeting the active workspace/tab, use the live focused pane ID from
    // the usePanes hook. The persisted targetTab.focusedPaneId may be stale because
    // it's synced asynchronously via useEffect, so clicking a sidebar chat right
    // after focusing a different pane could read the old value.
    const isActiveTabTarget = workspaceId === ws.activeWorkspaceId && targetTabId === currentActiveTabId;
    const liveFocusedPaneId = isActiveTabTarget ? panes.focusedPaneId : null;
    const targetPaneId = tabInfo?.paneId || liveFocusedPaneId || targetTab.focusedPaneId || collectPaneNodes(targetTab.layout)[0]?.id;
    if (!targetPaneId) return;

    const activateWorkspaceAndTab = () => {
      if (workspaceId !== ws.activeWorkspaceId) {
        ws.setActiveWorkspace(workspaceId);
      }
      if (targetTabId && targetTabId !== activeTabForWorkspace) {
        ws.setPaneTabsForWorkspace(workspacePath, tabs, targetTabId);
      }
    };

    if (tabInfo) {
      activateWorkspaceAndTab();
      if (workspaceId === ws.activeWorkspaceId && targetTabId === currentActiveTabId) {
        focusPaneById(tabInfo.paneId);
      } else {
        setPendingPaneFocus({ workspaceId, tabId: targetTabId, paneId: tabInfo.paneId });
      }
      if (isMobile) {
        setIsMobileSidebarOpen(false);
      }
      return;
    }

    activateWorkspaceAndTab();

    if (slotId) {
      if (workspaceId === ws.activeWorkspaceId && targetTabId === currentActiveTabId) {
        panes.updatePaneSlot(targetPaneId, slotId);
        focusPaneById(targetPaneId);
      } else {
        setPendingSlotAttach({ workspaceId, tabId: targetTabId, paneId: targetPaneId, slotId });
        setPendingPaneFocus({ workspaceId, tabId: targetTabId, paneId: targetPaneId });
      }
      if (isMobile) {
        setIsMobileSidebarOpen(false);
      }
      return;
    }

    const targetSession = resolveSessionPath(workspaceId, sessionId, sessionPath);
    if (!targetSession) {
      console.warn('[App] Missing session path for switchSession', { workspaceId, sessionId, sessionPath });
      return;
    }
    const targetPaneSlotId = findSlotIdByPaneId(targetTab.layout, targetPaneId);
    if (!targetPaneSlotId) return;

    if (workspaceId === ws.activeWorkspaceId && targetTabId === currentActiveTabId) {
      ws.switchSession(targetPaneSlotId, targetSession);
      focusPaneById(targetPaneId);
    } else {
      setPendingSessionLoad({
        workspaceId,
        tabId: targetTabId,
        slotId: targetPaneSlotId,
        sessionId,
        sessionPath: targetSession,
      });
      setPendingPaneFocus({ workspaceId, tabId: targetTabId, paneId: targetPaneId });
    }
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  }, [activeTabId, focusPaneById, isMobile, panes.focusedPaneId, panes.updatePaneSlot, resolveSessionPath, slotToTabByWorkspace, ws, ws.activeWorkspaceId, ws.activePaneTabByWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace, ws.setActiveWorkspace, ws.switchSession, ws.workspaces]);

  const handleRenameConversation = useCallback((workspaceId: string, sessionId: string, sessionPath: string | undefined, label: string) => {
    const trimmedLabel = label?.trim() || 'Conversation';
    const newName = window.prompt('Rename conversation:', trimmedLabel);
    if (!newName) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    ws.renameSession(workspaceId, sessionId, sessionPath, trimmedName);
  }, [ws]);

  const handleDeleteConversation = useCallback((workspaceId: string, sessionId: string, sessionPath: string | undefined, label: string) => {
    const trimmedLabel = label?.trim() || 'this conversation';
    const confirmed = window.confirm(`Delete "${trimmedLabel}"? This cannot be undone.`);
    if (!confirmed) return;
    ws.deleteSession(workspaceId, sessionId, sessionPath);
  }, [ws]);

  const handleRenameActiveConversation = useCallback((sessionId: string, sessionPath: string | undefined, label: string) => {
    if (!ws.activeWorkspaceId) return;
    handleRenameConversation(ws.activeWorkspaceId, sessionId, sessionPath, label);
  }, [handleRenameConversation, ws.activeWorkspaceId]);

  const handleDeleteActiveConversation = useCallback((sessionId: string, sessionPath: string | undefined, label: string) => {
    if (!ws.activeWorkspaceId) return;
    handleDeleteConversation(ws.activeWorkspaceId, sessionId, sessionPath, label);
  }, [handleDeleteConversation, ws.activeWorkspaceId]);

  // Extract conversation data separately to avoid recalculation during streaming
  // This extracts only the stable data (not streamingText/streamingThinking)
  const workspaceConversationData = useMemo(() => {
    const result: Record<string, {
      sessions: typeof ws.workspaces[0]['sessions'];
      slots: Record<string, {
        sessionId: string | undefined;
        sessionFile: string | undefined;
        sessionName: string | undefined;
        isStreaming: boolean;
        hasMessages: boolean;
        firstUserMessage: string | undefined;
        latestTimestamp: number;
      }>;
    }> = {};

    ws.workspaces.forEach((workspace) => {
      const slotData: Record<string, {
        sessionId: string | undefined;
        sessionFile: string | undefined;
        sessionName: string | undefined;
        isStreaming: boolean;
        hasMessages: boolean;
        firstUserMessage: string | undefined;
        latestTimestamp: number;
      }> = {};

      Object.entries(workspace.slots).forEach(([slotId, slot]) => {
        const firstUserMessage = slot.messages.find((message) => message.role === 'user')?.content
          ?.find((content) => content.type === 'text')?.text;
        
        const latestTimestamp = slot.messages.length > 0
          ? slot.messages.reduce((latest, message) => Math.max(latest, message.timestamp ?? 0), 0)
          : 0;

        slotData[slotId] = {
          sessionId: slot.state?.sessionId,
          sessionFile: slot.state?.sessionFile,
          sessionName: slot.state?.sessionName,
          isStreaming: slot.isStreaming,
          hasMessages: slot.messages.length > 0 || (slot.state?.messageCount ?? 0) > 0,
          firstUserMessage,
          latestTimestamp,
        };
      });

      result[workspace.id] = {
        sessions: workspace.sessions,
        slots: slotData,
      };
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only depend on workspace/slot identity, not streaming content
    // We use JSON.stringify of key identifiers to detect real changes
    ws.workspaces.map(w => `${w.id}:${w.sessions.length}:${Object.keys(w.slots).join(',')}`).join('|')
  ]);

  // Build sidebar data using the extracted conversation data
  const sidebarWorkspaces = useMemo(() => {
    return ws.workspaces.map((workspace) => {
      const isActive = workspace.id === ws.activeWorkspaceId;
      const isStreaming = Object.values(workspace.slots).some((slot) => slot.isStreaming);
      const tabs = ws.paneTabsByWorkspace[workspace.path] || [];
      const activeTabForWorkspace = ws.activePaneTabByWorkspace[workspace.path] || tabs[0]?.id || null;
      const slotMap = slotToTabByWorkspace[workspace.id] || new Map();

      const convData = workspaceConversationData[workspace.id];
      if (!convData) {
        return {
          id: workspace.id,
          name: workspace.name,
          path: workspace.path,
          isActive,
          isStreaming,
          needsAttention: needsAttention.has(workspace.id),
          panes: [],
          conversations: [],
        };
      }

      // Build session slot info from extracted data
      const sessionSlotInfo = new Map<string, { slotIds: string[]; isStreaming: boolean }>();
      Object.entries(convData.slots).forEach(([slotId, slot]) => {
        if (!slot.sessionId) return;
        const entry = sessionSlotInfo.get(slot.sessionId) || { slotIds: [], isStreaming: false };
        entry.slotIds.push(slotId);
        if (slot.isStreaming) entry.isStreaming = true;
        sessionSlotInfo.set(slot.sessionId, entry);
      });

      // Build session map from extracted data
      const sessionMap = new Map<string, { sessionId: string; sessionPath?: string; label: string; updatedAt: number }>();
      
      convData.sessions.forEach((session) => {
        if (session.messageCount <= 0) return;
        const label = session.name
          || (session.firstMessage && session.firstMessage !== '(no messages)' ? session.firstMessage : null)
          || 'Conversation';
        sessionMap.set(session.id, {
          sessionId: session.id,
          sessionPath: session.path,
          label,
          updatedAt: session.updatedAt,
        });
      });

      // Add sessions from slots (only those with content)
      Object.entries(convData.slots).forEach(([, slot]) => {
        if (!slot.sessionId) return;
        if (!slot.hasMessages && !slot.isStreaming) return;

        const existing = sessionMap.get(slot.sessionId);
        if (existing) {
          if (!existing.sessionPath && slot.sessionFile) {
            existing.sessionPath = slot.sessionFile;
          }
          return;
        }

        const label = slot.sessionName || slot.firstUserMessage || 'Conversation';
        sessionMap.set(slot.sessionId, {
          sessionId: slot.sessionId,
          sessionPath: slot.sessionFile,
          label,
          updatedAt: slot.latestTimestamp || Date.now(),
        });
      });

      const conversations = [...sessionMap.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((session) => {
          const slotInfo = sessionSlotInfo.get(session.sessionId);
          // Get fresh slot data for isStreaming check (this is fast, just a property access)
          const slotId = slotInfo?.slotIds.find((id) => workspace.slots[id]?.isStreaming) || slotInfo?.slotIds[0];
          const tabInfo = slotId ? slotMap.get(slotId) : null;
          const isFocused = Boolean(
            isActive
            && tabInfo
            && activeTabForWorkspace
            && tabInfo.tabId === activeTabForWorkspace
            && tabInfo.paneId === panes.focusedPaneId
          );
          return {
            sessionId: session.sessionId,
            sessionPath: session.sessionPath,
            label: session.label,
            slotId,
            isFocused,
            isStreaming: slotInfo?.isStreaming ?? false,
          };
        });

      return {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        isActive,
        isStreaming,
        needsAttention: needsAttention.has(workspace.id),
        panes: [],
        conversations,
      };
    });
  }, [ws.workspaces, ws.activeWorkspaceId, ws.paneTabsByWorkspace, ws.activePaneTabByWorkspace, needsAttention, panes.focusedPaneId, slotToTabByWorkspace, workspaceConversationData]);

  const workspaceRailItems = useMemo(() => ws.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    isActive: workspace.id === ws.activeWorkspaceId,
    isStreaming: Object.values(workspace.slots).some((slot) => slot.isStreaming),
    needsAttention: needsAttention.has(workspace.id),
  })), [ws.workspaces, ws.activeWorkspaceId, needsAttention]);

  const activeSidebarWorkspace = sidebarWorkspaces.find((workspace) => workspace.id === ws.activeWorkspaceId);
  const activeConversations = activeSidebarWorkspace?.conversations ?? [];
  const activeWorkspaceName = activeSidebarWorkspace?.name;

  const SETTINGS_TAB_ID = '__settings__';

  // Not memoized — needs to react to isSettingsOpen changes immediately
  const baseTabs = activeWorkspaceTabs.map((tab) => {
    if (!ws.activeWorkspace) return { id: tab.id, label: tab.label, isActive: false, isStreaming: false };
    const tabPanes = collectPaneNodes(tab.layout);
    const isStreaming = tabPanes.some((pane) => ws.activeWorkspace?.slots[pane.slotId]?.isStreaming);
    return {
      id: tab.id,
      label: tab.label,
      isActive: !isSettingsOpen && tab.id === activeTabId,
      isStreaming,
    };
  });
  const tabBarTabs = isSettingsOpen
    ? [...baseTabs, { id: SETTINGS_TAB_ID, label: '⚙ Settings', isActive: true, isStreaming: false }]
    : baseTabs;

  const handleSelectTab = useCallback((tabId: string) => {
    if (tabId === SETTINGS_TAB_ID) return; // already on settings
    // Clicking a real tab closes settings if open
    if (isSettingsOpen) closeSettings();
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    if (!tabs.length) return;
    ws.setPaneTabsForWorkspace(workspacePath, tabs, tabId);
  }, [ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace, isSettingsOpen, closeSettings]);

  const handleAddTab = useCallback(() => {
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    const newTabId = createTabId();
    const newSlotId = createSlotId();
    const newPaneId = createPaneId();
    const newTab: PaneTabPageState = {
      id: newTabId,
      label: `Tab ${getNextTabNumber(tabs)}`,
      layout: createSinglePaneLayout(newSlotId, newPaneId),
      focusedPaneId: newPaneId,
    };
    ws.createSessionSlotForWorkspace(ws.activeWorkspace.id, newSlotId);
    ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
  }, [ws.activeWorkspace, ws.createSessionSlotForWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleCloseTab = useCallback((tabId: string) => {
    // Closing the settings tab just closes settings
    if (tabId === SETTINGS_TAB_ID) {
      closeSettings();
      return;
    }
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];

    if (tabs.length <= 1) {
      // Closing the last tab: create a fresh one with a new conversation
      const newTabId = createTabId();
      const newSlotId = createSlotId();
      const newPaneId = createPaneId();
      const newTab: PaneTabPageState = {
        id: newTabId,
        label: `Tab ${getNextTabNumber([])}`,
        layout: createSinglePaneLayout(newSlotId, newPaneId),
        focusedPaneId: newPaneId,
      };
      ws.createSessionSlotForWorkspace(ws.activeWorkspace.id, newSlotId);
      ws.setPaneTabsForWorkspace(workspacePath, [newTab], newTabId);
      return;
    }

    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const nextActive = tabId === activeTabId ? nextTabs[0].id : activeTabId || nextTabs[0].id;
    ws.setPaneTabsForWorkspace(workspacePath, nextTabs, nextActive);
  }, [activeTabId, ws.activeWorkspace, ws.createSessionSlotForWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleRenameTab = useCallback((tabId: string, label: string) => {
    if (tabId === SETTINGS_TAB_ID) return;
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    const nextTabs = tabs.map((tab) => (tab.id === tabId ? { ...tab, label } : tab));
    ws.setPaneTabsForWorkspace(workspacePath, nextTabs, activeTabId || tabId);
  }, [activeTabId, ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleReorderTabs = useCallback((draggedId: string, targetId: string) => {
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    const draggedIndex = tabs.findIndex((tab) => tab.id === draggedId);
    const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;
    const nextTabs = [...tabs];
    const [draggedTab] = nextTabs.splice(draggedIndex, 1);
    nextTabs.splice(targetIndex, 0, draggedTab);
    ws.setPaneTabsForWorkspace(workspacePath, nextTabs, activeTabId || draggedId);
  }, [activeTabId, ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleSelectActiveConversation = useCallback((sessionId: string, sessionPath?: string, slotId?: string) => {
    if (!ws.activeWorkspaceId) return;
    handleSelectConversation(ws.activeWorkspaceId, sessionId, sessionPath, slotId);
  }, [handleSelectConversation, ws.activeWorkspaceId]);

  useEffect(() => {
    ws.workspaces.forEach((workspace) => {
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
      if (tabs.length === 0) {
        const paneId = createPaneId();
        const defaultTab: PaneTabPageState = {
          id: createTabId(),
          label: 'Tab 1',
          layout: createSinglePaneLayout('default', paneId),
          focusedPaneId: paneId,
        };
        ws.setPaneTabsForWorkspace(workspacePath, [defaultTab], defaultTab.id);
        return;
      }
      const storedActive = ws.activePaneTabByWorkspace[workspacePath];
      if (!storedActive || !tabs.some((tab) => tab.id === storedActive)) {
        ws.setPaneTabsForWorkspace(workspacePath, tabs, tabs[0].id);
      }
    });
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.activePaneTabByWorkspace, ws.setPaneTabsForWorkspace]);

  useEffect(() => {
    ws.workspaces.forEach((workspace) => {
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
      const requested = sessionSlotRequestsRef.current[workspace.id] || new Set<string>();
      sessionSlotRequestsRef.current[workspace.id] = requested;

      tabs.forEach((tab) => {
        collectPaneNodes(tab.layout).forEach((pane) => {
          if (workspace.slots[pane.slotId]) {
            requested.delete(pane.slotId);
            return;
          }
          if (requested.has(pane.slotId)) return;
          requested.add(pane.slotId);
          ws.createSessionSlotForWorkspace(workspace.id, pane.slotId);
        });
      });
    });
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.createSessionSlotForWorkspace]);

  useEffect(() => {
    ws.workspaces.forEach((workspace) => {
      if (sessionSlotListRequestedRef.current.has(workspace.id)) return;
      sessionSlotListRequestedRef.current.add(workspace.id);
      ws.listSessionSlots(workspace.id);
    });
  }, [ws.workspaces, ws.listSessionSlots]);

  useEffect(() => {
    if (!activeWorkspacePath || !activeTabId || !activeTab) return;
    const tabs = ws.paneTabsByWorkspace[activeWorkspacePath] || [];
    const tabIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    if (tabIndex < 0) return;
    const currentTab = tabs[tabIndex];
    const layoutChanged = JSON.stringify(currentTab.layout) !== JSON.stringify(panes.layout);
    const focusChanged = currentTab.focusedPaneId !== panes.focusedPaneId;
    if (!layoutChanged && !focusChanged) return;
    const nextTabs = [...tabs];
    nextTabs[tabIndex] = { ...currentTab, layout: panes.layout, focusedPaneId: panes.focusedPaneId };
    ws.setPaneTabsForWorkspace(activeWorkspacePath, nextTabs, activeTabId);
  }, [activeWorkspacePath, activeTabId, activeTab, panes.layout, panes.focusedPaneId, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const activeWs = ws.activeWorkspace;
  const activeWorkspaceId = activeWs?.id ?? null;
  const isRightPaneOpen = activeWs ? (ws.rightPaneByWorkspace[activeWs.path] ?? false) : false;
  const hasRootEntries = activeWorkspaceId ? Boolean(workspaceEntries[activeWorkspaceId]?.['']) : false;

  useEffect(() => {
    if (!ws.isConnected) return;
    if (!activeWorkspaceId) return;
    if (!isRightPaneOpen) return;
    if (hasRootEntries) return;
    requestWorkspaceEntries(activeWorkspaceId, '');
  }, [ws.isConnected, activeWorkspaceId, hasRootEntries, isRightPaneOpen, requestWorkspaceEntries]);

  // Memoized handlers for active workspace to prevent re-render loops in SidebarFileTree
  // Use activeWorkspaceId (stable string) instead of activeWs (new object each render)
  const activeWorkspaceWatchDirectory = useCallback((path: string) => {
    if (activeWorkspaceId) {
      watchDirectory(activeWorkspaceId, path);
    }
  }, [activeWorkspaceId, watchDirectory]);

  const activeWorkspaceUnwatchDirectory = useCallback((path: string) => {
    if (activeWorkspaceId) {
      unwatchDirectory(activeWorkspaceId, path);
    }
  }, [activeWorkspaceId, unwatchDirectory]);

  const activeWorkspaceRequestEntries = useCallback((path: string) => {
    if (activeWorkspaceId) {
      requestWorkspaceEntries(activeWorkspaceId, path);
    }
  }, [activeWorkspaceId, requestWorkspaceEntries]);

  const activeWorkspaceRequestGitStatus = useCallback(() => {
    if (activeWorkspaceId) {
      requestGitStatus(activeWorkspaceId);
    }
  }, [activeWorkspaceId, requestGitStatus]);

  // Loading state
  if (!ws.isConnected && ws.isConnecting) {
    return (
      <div className="h-full bg-pi-bg flex items-center justify-center font-mono text-[14px] text-pi-muted">
        <span className="cursor-blink">connecting...</span>
      </div>
    );
  }

  const focusedSlot = panes.focusedSlotId ? activeWs?.slots[panes.focusedSlotId] : null;

  // Get backend commands from focused slot
  const backendCommands = focusedSlot?.commands || [];

  // On mobile, when keyboard is visible, we need to use fixed positioning
  // to properly contain the app within the visual viewport
  const appContainerClasses = isMobile && isKeyboardVisible
    ? "fixed inset-0 bg-pi-bg flex flex-col font-mono"
    : "h-full bg-pi-bg flex flex-col font-mono";

  const sidebarStyle = {
    width: sidebarWidth,
    transition: isSidebarResizing ? 'none' : undefined,
  };
  const totalLeftWidth = isMobile ? 0 : WORKSPACE_RAIL_WIDTH + sidebarWidth;
  const rightPaneStyle = {
    width: `calc((100% - ${totalLeftWidth}px) * ${rightPaneRatio})`,
  };
  const rightPaneHandleStyle = {
    width: RIGHT_PANE_HANDLE_WIDTH,
  };
  const showRightPane = !isMobile && Boolean(activeWs) && isRightPaneOpen;
  const showRightPaneHandle = !isMobile && Boolean(activeWs) && !isRightPaneOpen;

  return (
    <div
      className={appContainerClasses}
      style={isMobile && isKeyboardVisible ? { 
        height: 'var(--viewport-height, 100%)',
        top: 'var(--viewport-offset, 0)',
      } : undefined}

    >
      {/* Directory browser modal */}
      {showBrowser && (
        <DirectoryBrowser
          currentPath={ws.currentBrowsePath}
          entries={ws.directoryEntries}
          recentWorkspaces={ws.recentWorkspaces}
          homeDirectory={ws.homeDirectory || '/'}
          onNavigate={ws.browseDirectory}
          onOpenWorkspace={(path) => {
            ws.openWorkspace(path);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}



      {/* Connection status banner */}
      <ConnectionStatus isConnected={ws.isConnected} error={ws.error} />

      <div className="flex flex-1 overflow-hidden" ref={layoutRef}>
        {!isMobile && (
          <>
            <WorkspaceRail
              workspaces={workspaceRailItems}
              onSelectWorkspace={handleSelectWorkspace}
              onCloseWorkspace={ws.closeWorkspace}
              onOpenBrowser={() => setShowBrowser(true)}
              onOpenSettings={openSettings}
            />
            <ConversationSidebar
              workspaceName={activeWorkspaceName}
              workspacePath={activeWs?.path}
              conversations={activeConversations}
              onSelectConversation={handleSelectActiveConversation}
              onRenameConversation={handleRenameActiveConversation}
              onDeleteConversation={handleDeleteActiveConversation}
              entriesByPath={activeWs ? (workspaceEntries[activeWs.id] || {}) : undefined}
              gitStatusFiles={activeWs ? (workspaceGitStatus[activeWs.id] || []) : undefined}
              gitBranch={activeWs ? (workspaceGitBranch[activeWs.id] ?? null) : null}
              gitWorktree={activeWs ? (workspaceGitWorktree[activeWs.id] ?? null) : null}
              onRequestEntries={activeWs ? activeWorkspaceRequestEntries : undefined}
              onRequestGitStatus={activeWs ? activeWorkspaceRequestGitStatus : undefined}
              onSelectFile={handleSelectFile}
              onSelectGitFile={handleSelectGitFile}
              selectedFilePath={activeWs ? (selectedFilePathByWorkspace[activeWs.id] || '') : ''}
              openFilePath={activeWs ? openFilePathByWorkspace[activeWs.id] : undefined}
              activeJobs={activeWs ? (ws.activeJobsByWorkspace[activeWs.id] || []) : undefined}
              onWatchDirectory={activeWs ? activeWorkspaceWatchDirectory : undefined}
              onUnwatchDirectory={activeWs ? activeWorkspaceUnwatchDirectory : undefined}
              className="h-full"
              style={sidebarStyle}
            />
            <div
              onMouseDown={handleSidebarResizeStart}
              className="flex-shrink-0 w-1 cursor-col-resize hover:bg-pi-border"
            >
              <div className="bg-pi-border/50 rounded-full w-0.5 h-6" />
            </div>
          </>
        )}

        <div className="flex flex-1 flex-col min-w-0">
          {!isMobile && activeWs && (
            <PaneTabsBar
              tabs={tabBarTabs}
              onSelectTab={handleSelectTab}
              onAddTab={handleAddTab}
              onCloseTab={handleCloseTab}
              onRenameTab={handleRenameTab}
              onReorderTabs={handleReorderTabs}
              onSplitVertical={() => panes.split('vertical')}
              onSplitHorizontal={() => panes.split('horizontal')}
              canSplit={panes.panes.length < 4}
            />
          )}

          {isMobile && (
            <div className="flex items-center justify-between border-b border-pi-border px-2 py-1 safe-area-top">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-3 text-pi-muted hover:text-pi-text transition-colors"
                title="Menu"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex-1 text-center text-[15px] text-pi-text truncate px-2">
                {activeWs?.name || 'No workspace'}
              </div>
              <div className="flex items-center gap-0">
                {activeWs && (
                  <button
                    onClick={toggleRightPane}
                    className={`p-3 transition-colors ${
                      isRightPaneOpen ? 'text-pi-accent' : 'text-pi-muted hover:text-pi-text'
                    }`}
                    title="Toggle file pane (⌘⇧F)"
                  >
                    <FileText className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main content area */}
          {!activeWs ? (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center text-pi-muted">
              <p className="mb-4">No workspace open</p>
              <button
                onClick={() => setShowBrowser(true)}
                className="px-4 py-2 border border-pi-border text-pi-text hover:border-pi-accent transition-colors"
              >
                Open directory {!isMobile && '(⌘O)'}
              </button>
            </div>
          ) : isSettingsOpen ? (
            <Settings
              notificationPermission={notifications.isSupported ? notifications.permission : 'unsupported'}
              onRequestNotificationPermission={notifications.requestPermission}
              deployStatus={ws.deployState.status}
              deployMessage={ws.deployState.message}
              onDeploy={handleDeploy}
              models={activeWs.models}
              scopedModels={settingsScopedModels}
              onSaveScopedModels={(models) => {
                const slotId = panes.focusedSlotId || 'default';
                ws.setScopedModels(slotId, models);
              }}
              startupInfo={activeWs.startupInfo || null}
            />
          ) : (
            <PaneManager
              layout={isMobile 
                ? { 
                    type: 'pane', 
                    id: panes.panes[mobilePaneIndex]?.id || 'default', 
                    slotId: panes.panes[mobilePaneIndex]?.sessionSlotId || 'default' 
                  } 
                : panes.layout
              }
              workspace={activeWs}
              focusedPaneId={panes.focusedPaneId}
              sessions={activeWs.sessions}
              models={activeWs.models}
              backendCommands={backendCommands}
              onFocusPane={panes.focusPane}
              onSplit={panes.split}
              onClosePane={handleClosePane}
              onResizeNode={panes.resizeNode}
              onSendPrompt={(slotId, message, images) => ws.sendPrompt(slotId, message, images)}
              onSteer={(slotId, message, images) => ws.steer(slotId, message, images)}
              onAbort={(slotId) => ws.abort(slotId)}
              onLoadSession={(slotId, sessionId) => {
                if (!activeWorkspaceId) return;
                const targetSession = resolveSessionPath(activeWorkspaceId, sessionId);
                if (!targetSession) {
                  console.warn('[App] Missing session path for switchSession', { workspaceId: activeWorkspaceId, sessionId });
                  return;
                }
                ws.switchSession(slotId, targetSession);
              }}
              onNewSession={(slotId) => ws.newSession(slotId)}
              onGetForkMessages={(slotId) => {
                ws.getForkMessages(slotId);
              }}
              onFork={(slotId, entryId) => ws.fork(slotId, entryId)}
              onSetModel={(slotId, provider, modelId) => ws.setModel(slotId, provider, modelId)}
              onSetThinkingLevel={(slotId, level) => ws.setThinkingLevel(slotId, level)}
              onQuestionnaireResponse={handleQuestionnaireResponse}
              onExtensionUIResponse={(slotId, response) => ws.sendExtensionUIResponse(slotId, response)}
              onCustomUIInput={(slotId, input) => ws.sendCustomUIInput(slotId, input)}
              onCompact={(slotId) => ws.compact(slotId)}
              onOpenSettings={openSettings}
              onExport={(slotId) => ws.exportHtml(slotId)}
              onRenameSession={(slotId, name) => ws.setSessionName(slotId, name)}
              onShowHotkeys={() => openSettings('keyboard')}
              onFollowUp={(slotId, message) => ws.followUp(slotId, message)}
              onReload={handleDeploy}
              // New features
              onGetSessionTree={(slotId) => ws.getSessionTree(slotId)}
              onNavigateTree={(slotId, targetId) => ws.navigateTree(slotId, targetId)}
              onCopyLastAssistant={(slotId) => ws.copyLastAssistant(slotId)}
              onGetQueuedMessages={(slotId) => ws.getQueuedMessages(slotId)}
              onClearQueue={(slotId) => ws.clearQueue(slotId)}
              onListFiles={(_slotId, query, requestId) => ws.listFiles(query, undefined, requestId)}
              onExecuteBash={(slotId, command, excludeFromContext) => {
                ws.executeBash(slotId, command, excludeFromContext);
              }}

              onToggleAllToolsCollapsed={() => setAllToolsCollapsed(prev => !prev)}
              onToggleAllThinkingCollapsed={() => setAllThinkingCollapsed(prev => !prev)}

              activePlan={ws.activePlanByWorkspace[activeWs.id] ?? null}
              onUpdatePlanTask={ws.updatePlanTask}
              onDeactivatePlan={ws.deactivatePlan}
              activeJobs={ws.activeJobsByWorkspace[activeWs.id] || []}
              onUpdateJobTask={ws.updateJobTask}
            />
          )}
        </div>

        {showRightPaneHandle && (
          <div
            className="flex-shrink-0 border-l border-pi-border bg-pi-surface flex flex-col items-center pt-2"
            style={rightPaneHandleStyle}
          >
            <button
              onClick={toggleRightPane}
              className="rounded p-1 text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors"
              title="Show file pane (⌘⇧F)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {showRightPane && (
          <>
            <div
              onMouseDown={handleRightPaneResizeStart}
              className="flex-shrink-0 w-1 cursor-col-resize hover:bg-pi-border"
            >
              <div className="bg-pi-border/50 rounded-full w-0.5 h-6" />
            </div>
            <WorkspaceFilesPane
              className="flex-shrink-0"
              style={rightPaneStyle}
              workspaceName={activeWs!.name}
              workspaceId={activeWs!.id}
              workspacePath={activeWs!.path}
              selectedFilePath={selectedFilePathByWorkspace[activeWs!.id] || ''}
              fileContentsByPath={workspaceFileContents[activeWs!.id] || {}}
              fileDiffsByPath={workspaceFileDiffs[activeWs!.id] || {}}
              onRequestFile={(path) => requestWorkspaceFile(activeWs!.id, path)}
              onRequestFileDiff={(path) => requestFileDiff(activeWs!.id, path)}
              viewMode={viewModeByWorkspace[activeWs!.id] || 'file'}
              activePlan={ws.activePlanByWorkspace[activeWs!.id] ?? null}
              onGetPlans={ws.getPlans}
              onGetPlanContent={ws.getPlanContent}
              onSavePlan={ws.savePlan}
              onActivatePlan={ws.activatePlan}
              onDeactivatePlan={ws.deactivatePlan}
              onUpdatePlanTask={ws.updatePlanTask}
              activeJobs={ws.activeJobsByWorkspace[activeWs!.id] || []}
              onGetJobs={ws.getJobs}
              onGetJobContent={ws.getJobContent}
              onCreateJob={ws.createJob}
              onSaveJob={ws.saveJob}
              onPromoteJob={ws.promoteJob}
              onDemoteJob={ws.demoteJob}
              onUpdateJobTask={ws.updateJobTask}
              onDeleteJob={ws.deleteJob}
              onRenameJob={ws.renameJob}
              onArchiveJob={ws.archiveJob}
              onUnarchiveJob={ws.unarchiveJob}
              onGetArchivedJobs={ws.getArchivedJobs}
              onTogglePane={toggleRightPane}
            />
          </>
        )}
      </div>

      {isMobile && isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <WorkspaceSidebar
            workspaces={sidebarWorkspaces}
            collapsed={false}
            className="relative z-10 h-full w-full"
            onToggleCollapse={() => setIsMobileSidebarOpen(false)}
            onSelectWorkspace={handleSelectWorkspace}
            onCloseWorkspace={ws.closeWorkspace}
            onSelectConversation={handleSelectConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
            onOpenBrowser={() => {
              setShowBrowser(true);
              setIsMobileSidebarOpen(false);
            }}
            onOpenSettings={openSettings}
            showClose
            onClose={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      )}

      {isMobile && activeWs && isRightPaneOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => ws.setWorkspaceRightPaneOpen(activeWs.path, false)}
          />
          <WorkspaceFilesPane
            className="relative z-10 h-full w-full"
            workspaceName={activeWs.name}
            workspaceId={activeWs.id}
            workspacePath={activeWs.path}
            selectedFilePath={selectedFilePathByWorkspace[activeWs.id] || ''}
            fileContentsByPath={workspaceFileContents[activeWs.id] || {}}
            fileDiffsByPath={workspaceFileDiffs[activeWs.id] || {}}
            onRequestFile={(path) => requestWorkspaceFile(activeWs.id, path)}
            onRequestFileDiff={(path) => requestFileDiff(activeWs.id, path)}
            viewMode={viewModeByWorkspace[activeWs.id] || 'file'}
            activePlan={ws.activePlanByWorkspace[activeWs.id] ?? null}
            onGetPlans={ws.getPlans}
            onGetPlanContent={ws.getPlanContent}
            onSavePlan={ws.savePlan}
            onActivatePlan={ws.activatePlan}
            onDeactivatePlan={ws.deactivatePlan}
            onUpdatePlanTask={ws.updatePlanTask}
            activeJobs={ws.activeJobsByWorkspace[activeWs.id] || []}
            onGetJobs={ws.getJobs}
            onGetJobContent={ws.getJobContent}
            onCreateJob={ws.createJob}
            onSaveJob={ws.saveJob}
            onPromoteJob={ws.promoteJob}
            onDemoteJob={ws.demoteJob}
            onUpdateJobTask={ws.updateJobTask}
            onDeleteJob={ws.deleteJob}
            onRenameJob={ws.renameJob}
            onArchiveJob={ws.archiveJob}
            onUnarchiveJob={ws.unarchiveJob}
            onGetArchivedJobs={ws.getArchivedJobs}
            onTogglePane={toggleRightPane}
          />
        </div>
      )}

    </div>
  );
}

export default App;
