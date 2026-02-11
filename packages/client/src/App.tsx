/**
 * Pi-Deck
 * 
 * Tab-based interface - each tab contains one session.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Menu, FileText, X, ChevronLeft } from 'lucide-react';
import { useWorkspaces } from './hooks/useWorkspaces';
import { useTabs } from './hooks/useTabs';
import { useNotifications } from './hooks/useNotifications';
import { useIsMobile } from './hooks/useIsMobile';
import { useKeyboardVisible } from './hooks/useKeyboardVisible';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { Settings } from './components/Settings';
import { PaneTabsBar } from './components/PaneTabsBar';
import { WorkspaceRail } from './components/WorkspaceRail';
import { ConversationSidebar } from './components/ConversationSidebar';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { MobileSidebar } from './components/MobileSidebar';
import { MobileBottomToolbar } from './components/MobileBottomToolbar';
import { WorkspaceFilesPane } from './components/WorkspaceFilesPane';
import { SessionView } from './components/SessionView';
import { useSettings } from './contexts/SettingsContext';
import type { FileInfo, PaneTabPageState } from '@pi-deck/shared';
import { matchesHotkey } from './hotkeys';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:9741/ws'
  : `ws://${window.location.host}/ws`;

const WORKSPACE_RAIL_WIDTH = 56;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const RIGHT_PANE_MIN_RATIO = 0.2;
const RIGHT_PANE_MAX_RATIO = 0.8;
// const RIGHT_PANE_HANDLE_WIDTH = 32;  // Removed - no longer needed

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createTabId = () => createId('tab');
const createSlotId = () => createId('slot');

const truncateLabel = (label: string, maxLength: number): string => {
  if (label.length <= maxLength) return label;
  return label.slice(0, maxLength - 1) + '…';
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

function App() {
  const ws = useWorkspaces(WS_URL);
  const notifications = useNotifications({ titlePrefix: 'Pi' });
  const isMobile = useIsMobile();
  const isKeyboardVisible = useKeyboardVisible();
  const { settings, openSettings, closeSettings, isSettingsOpen } = useSettings();
  const hk = settings.hotkeyOverrides;
  
  const [showBrowser, setShowBrowser] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [settingsScopedModels, setSettingsScopedModels] = useState([]);
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set());

  const [_allToolsCollapsed, setAllToolsCollapsed] = useState(false);
  const [_allThinkingCollapsed, setAllThinkingCollapsed] = useState(false);

  
  // Mobile 3-panel system: 'conversations' | 'chat' | 'tools'
  const [mobileActivePanel, setMobileActivePanel] = useState<'conversations' | 'chat' | 'tools'>('chat');
  
  const [workspaceEntries, setWorkspaceEntries] = useState<Record<string, Record<string, FileInfo[]>>>({});
  const [workspaceFileContents, _setWorkspaceFileContents] = useState<Record<string, Record<string, { content: string; truncated: boolean }>>>({});
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<Record<string, Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>>>({});
  const [workspaceGitBranch, setWorkspaceGitBranch] = useState<Record<string, string | null>>({});
  const [workspaceGitWorktree, setWorkspaceGitWorktree] = useState<Record<string, string | null>>({});
  const [workspaceFileDiffs, _setWorkspaceFileDiffs] = useState<Record<string, Record<string, string>>>({});
  const [openFilePathByWorkspace, _setOpenFilePathByWorkspace] = useState<Record<string, string>>({});
  const [selectedFilePathByWorkspace, setSelectedFilePathByWorkspace] = useState<Record<string, string>>({});
  const [viewModeByWorkspace, setViewModeByWorkspace] = useState<Record<string, 'file' | 'diff'>>({});
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(Math.max(ws.sidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
  const [rightPaneRatio, setRightPaneRatio] = useState(0.5);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isRightPaneResizing, setIsRightPaneResizing] = useState(false);
  
  const layoutRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  
  const wsRef = useRef(ws);
  wsRef.current = ws;
  
  const workspaceEntriesRequestedRef = useRef<Record<string, Set<string>>>({});
  const workspaceFileRequestsRef = useRef<Record<string, Set<string>>>({});
  const sessionSlotListRequestedRef = useRef<Set<string>>(new Set());
  
  const [jobLocations, _setJobLocations] = useState<Array<{ path: string; isDefault: boolean; displayName: string }>>([]);
  
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

  /* const activeTab = useMemo(() => {
    if (!activeTabId) return null;
    return activeWorkspaceTabs.find((tab) => tab.id === activeTabId) || null;
  }, [activeTabId, activeWorkspaceTabs]); */

  // Tab management - simplified, each tab has exactly one slot
  const { tab, focusedSlotId } = useTabs({
    workspace: ws.activeWorkspace,
    tabId: activeTabId,
    tabs: activeWorkspaceTabs,
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

  const prevStreamingRef = useRef<Record<string, boolean>>({});

  // Apply default model to newly initialized sessions
  useEffect(() => {
    const { defaultModelKey, defaultThinkingLevel } = settings;
    if (!defaultModelKey) return;

    const [provider, modelId] = defaultModelKey.split(':');
    if (!provider || !modelId) return;

    for (const workspace of ws.workspaces) {
      for (const [slotId, slot] of Object.entries(workspace.slots)) {
        const key = `${workspace.id}:${slotId}`;
        if (defaultModelAppliedRef.current.has(key)) continue;
        if (!slot.state?.sessionId) continue;
        defaultModelAppliedRef.current.add(key);
        if (slot.messages.length > 0 || (slot.state.messageCount ?? 0) > 0) continue;
        if (slot.state.model?.provider === provider && slot.state.model?.id === modelId) continue;
        ws.setModel(slotId, provider, modelId);
        if (defaultThinkingLevel && defaultThinkingLevel !== 'off') {
          ws.setThinkingLevel(slotId, defaultThinkingLevel as import('@pi-deck/shared').ThinkingLevel);
        }
      }
    }
  }, [ws.workspaces, settings.defaultModelKey, settings.defaultThinkingLevel, ws.setModel, ws.setThinkingLevel]);

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

  // Listen for plan activation - create a new tab for the plan's session slot
  useEffect(() => {
    const handlePlanSlotCreated = (e: CustomEvent<{ workspaceId: string; sessionSlotId: string; planTitle?: string }>) => {
      const { workspaceId, sessionSlotId, planTitle } = e.detail;
      const workspace = ws.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return;
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
      const newTabId = createTabId();
      const newTab: PaneTabPageState = {
        id: newTabId,
        label: planTitle || 'Plan',
        slotId: sessionSlotId,
      };
      ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    };

    window.addEventListener('pi:planSlotCreated', handlePlanSlotCreated as EventListener);
    return () => window.removeEventListener('pi:planSlotCreated', handlePlanSlotCreated as EventListener);
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  // Listen for job promotion - create a new tab for the job's session slot
  useEffect(() => {
    const handleJobSlotCreated = (e: CustomEvent<{ workspaceId: string; sessionSlotId: string }>) => {
      const { workspaceId, sessionSlotId } = e.detail;
      const workspace = ws.workspaces.find(w => w.id === workspaceId);
      if (!workspace) return;
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];

      // Check if a tab for this slot already exists
      const existingTab = tabs.find(t => t.slotId === sessionSlotId);
      if (existingTab) {
        ws.setPaneTabsForWorkspace(workspacePath, tabs, existingTab.id);
        return;
      }

      const newTabId = createTabId();
      const phaseMatch = sessionSlotId.match(/^job-(planning|executing|review)/);
      const label = phaseMatch ? `Job: ${phaseMatch[1].charAt(0).toUpperCase() + phaseMatch[1].slice(1)}` : 'Job';
      const newTab: PaneTabPageState = {
        id: newTabId,
        label,
        slotId: sessionSlotId,
      };
      ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    };

    window.addEventListener('pi:jobSlotCreated', handleJobSlotCreated as EventListener);
    return () => window.removeEventListener('pi:jobSlotCreated', handleJobSlotCreated as EventListener);
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  // Listen for /jobs slash command - open right pane to jobs tab
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
    const handleGitStatus = (e: CustomEvent<{ workspaceId: string; files: Array<{ path: string; status: import('@pi-deck/shared').GitFileStatus }>; branch?: string | null; worktree?: string | null; requestId?: string }>) => {
      setWorkspaceGitStatus(prev => ({
        ...prev,
        [e.detail.workspaceId]: e.detail.files,
      }));
      if (e.detail.branch !== undefined) {
        setWorkspaceGitBranch(prev => ({ ...prev, [e.detail.workspaceId]: e.detail.branch ?? null }));
      }
      if (e.detail.worktree !== undefined) {
        setWorkspaceGitWorktree(prev => ({ ...prev, [e.detail.workspaceId]: e.detail.worktree ?? null }));
      }
    };

    window.addEventListener('pi:gitStatus', handleGitStatus as EventListener);
    return () => window.removeEventListener('pi:gitStatus', handleGitStatus as EventListener);
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

  /* const normalizeFileLink = useCallback((path: string) => {
    const trimmed = path.replace(/^file:\/\//i, '');
    if (trimmed.startsWith('~/') && ws.homeDirectory) {
      return ws.homeDirectory.replace(/\/+$/, '') + '/' + trimmed.slice(2);
    }
    if (trimmed.startsWith('/')) return trimmed;
    return trimmed.replace(/^\.\//, '');
  }, [ws.homeDirectory]); */

  const handleSelectFile = useCallback((path: string) => {
    if (!ws.activeWorkspace) return;
    const workspaceId = ws.activeWorkspace.id;
    setSelectedFilePathByWorkspace(prev => ({ ...prev, [workspaceId]: path }));
    setViewModeByWorkspace(prev => ({ ...prev, [workspaceId]: 'file' }));
    requestWorkspaceFile(workspaceId, path);
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

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement | null;
    const isTypingTarget = target ? (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) : false;

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

    // ⌘1-9 - Switch tab by number
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

    if (matchesHotkey(e, 'stopAgent', hk) && focusedSlotId) {
      e.preventDefault();
      ws.abort(focusedSlotId);
      return;
    }
  }, [showBrowser, isSettingsOpen, closeSettings, openSettings, toggleRightPane, focusedSlotId, ws, activeWorkspaceTabs, hk]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [handleKeyDown]);

  // Request scoped models when settings opens
  useEffect(() => {
    if (!isSettingsOpen) return;
    const slotId = focusedSlotId || 'default';
    ws.getScopedModels(slotId);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSettingsScopedModels(detail.models || []);
    };
    window.addEventListener('pi:scopedModels', handler);
    return () => window.removeEventListener('pi:scopedModels', handler);
  }, [isSettingsOpen, focusedSlotId, ws]);

  const handleDeploy = useCallback(() => {
    ws.deploy();
  }, [ws]);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    ws.setActiveWorkspace(workspaceId);
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  }, [ws, isMobile]);

  // Find-or-create pattern for conversation selection
  const handleSelectConversation = useCallback((workspaceId: string, sessionId: string, sessionPath?: string, _slotId?: string, label?: string) => {
    const workspace = ws.workspaces.find((wsItem) => wsItem.id === workspaceId);
    if (!workspace) return;
    
    const workspacePath = workspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    
    // Check if this conversation is already open
    const existingTab = tabs.find(t => t.sessionId === sessionId);
    if (existingTab) {
      ws.setPaneTabsForWorkspace(workspacePath, tabs, existingTab.id);
      if (workspaceId !== ws.activeWorkspaceId) {
        ws.setActiveWorkspace(workspaceId);
      }
      return;
    }
    
    // Create new tab bound to this session
    const newTabId = createTabId();
    const newSlotId = createSlotId();
    
    const newTab: PaneTabPageState = {
      id: newTabId,
      label: label ? truncateLabel(label, 20) : 'Conversation',
      sessionId: sessionId,
      sessionPath: sessionPath,
      slotId: newSlotId,
    };
    
    ws.createSessionSlotForWorkspace(workspaceId, newSlotId);
    ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    
    if (workspaceId !== ws.activeWorkspaceId) {
      ws.setActiveWorkspace(workspaceId);
    }
    
    // Load session
    if (sessionPath) {
      ws.switchSession(newSlotId, sessionPath);
    }
  }, [ws, ws.activeWorkspaceId]);

  const handleRenameConversation = useCallback((workspaceId: string, sessionId: string, sessionPath: string | undefined, newName: string) => {
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

  const handleRenameActiveConversation = useCallback((sessionId: string, sessionPath: string | undefined, newName: string) => {
    if (!ws.activeWorkspaceId) return;
    handleRenameConversation(ws.activeWorkspaceId, sessionId, sessionPath, newName);
  }, [handleRenameConversation, ws.activeWorkspaceId]);

  const handleDeleteActiveConversation = useCallback((sessionId: string, sessionPath: string | undefined, label: string) => {
    if (!ws.activeWorkspaceId) return;
    handleDeleteConversation(ws.activeWorkspaceId, sessionId, sessionPath, label);
  }, [handleDeleteConversation, ws.activeWorkspaceId]);

  /** Navigate to the tab containing a given session slot */
  const handleNavigateToSlot = useCallback((slotId: string) => {
    if (!ws.activeWorkspaceId) return;
    const workspace = ws.workspaces.find(w => w.id === ws.activeWorkspaceId);
    if (!workspace) return;
    const workspacePath = workspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    const existingTab = tabs.find(t => t.slotId === slotId);

    if (existingTab) {
      ws.setPaneTabsForWorkspace(workspacePath, tabs, existingTab.id);
    } else {
      // No tab for this slot - create one
      const newTabId = createTabId();
      const phaseMatch = slotId.match(/^job-(planning|executing|review)/);
      const label = phaseMatch ? `Job: ${phaseMatch[1].charAt(0).toUpperCase() + phaseMatch[1].slice(1)}` : 'Job';
      const newTab: PaneTabPageState = {
        id: newTabId,
        label,
        slotId: slotId,
      };
      ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
    }
  }, [ws.activeWorkspaceId, ws.workspaces, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  // Build sidebar workspaces data
  const sidebarWorkspaces = useMemo(() => {
    return ws.workspaces.map((workspace) => {
      const isActive = workspace.id === ws.activeWorkspaceId;
      const isStreaming = Object.values(workspace.slots).some((slot) => slot.isStreaming);
      const tabs = ws.paneTabsByWorkspace[workspace.path] || [];

      // Build session map from slots
      const sessionMap = new Map<string, { sessionId: string; sessionPath?: string; label: string; updatedAt: number }>();
      
      Object.entries(workspace.slots).forEach(([, slot]) => {
        if (!slot.state?.sessionId) return;
        if (!slot.messages.length && !slot.isStreaming) return;

        const firstUserMessage = slot.messages.find(m => m.role === 'user')?.content
          ?.find(c => c.type === 'text')?.text;
        
        const label = slot.state.sessionName || firstUserMessage || 'Conversation';
        const latestTimestamp = slot.messages.length > 0
          ? Math.max(...slot.messages.map(m => m.timestamp || 0))
          : Date.now();

        sessionMap.set(slot.state.sessionId, {
          sessionId: slot.state.sessionId,
          sessionPath: slot.state.sessionFile,
          label,
          updatedAt: latestTimestamp,
        });
      });

      // Add workspace sessions
      workspace.sessions.forEach((session) => {
        if (session.messageCount <= 0) return;
        if (sessionMap.has(session.id)) return;
        
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

      const conversations = [...sessionMap.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((session) => {
          // Find if this session is in an active tab
          const tabWithSession = tabs.find(t => t.sessionId === session.sessionId);
          const isFocused = Boolean(
            isActive
            && tabWithSession
            && tabWithSession.id === activeTabId
          );
          
          // Check if any slot with this session is streaming
          const isStreaming = Object.values(workspace.slots).some(
            slot => slot.state?.sessionId === session.sessionId && slot.isStreaming
          );
          
          return {
            sessionId: session.sessionId,
            sessionPath: session.sessionPath,
            label: session.label,
            slotId: tabWithSession?.slotId,
            isFocused,
            isStreaming,
          };
        });

      return {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        isActive,
        isStreaming,
        needsAttention: needsAttention.has(workspace.id),
        conversations,
      };
    });
  }, [ws.workspaces, ws.activeWorkspaceId, ws.paneTabsByWorkspace, activeTabId, needsAttention]);

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

  // Build tab bar tabs
  const baseTabs = activeWorkspaceTabs.map((tab) => {
    if (!ws.activeWorkspace) return { id: tab.id, label: 'Tab', isActive: false, isStreaming: false };
    const slot = ws.activeWorkspace.slots[tab.slotId];
    const isStreaming = slot?.isStreaming || false;
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
    if (tabId === SETTINGS_TAB_ID) return;
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
    const newTab: PaneTabPageState = {
      id: newTabId,
      label: 'New Conversation',
      slotId: newSlotId,
    };
    ws.createSessionSlotForWorkspace(ws.activeWorkspace.id, newSlotId);
    ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
  }, [ws.activeWorkspace, ws.createSessionSlotForWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleCloseTab = useCallback((tabId: string) => {
    if (tabId === SETTINGS_TAB_ID) {
      closeSettings();
      return;
    }
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];

    if (tabs.length <= 1) {
      ws.setPaneTabsForWorkspace(workspacePath, [], '');
      return;
    }

    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const nextActive = tabId === activeTabId ? nextTabs[0].id : activeTabId || nextTabs[0].id;
    ws.setPaneTabsForWorkspace(workspacePath, nextTabs, nextActive);
  }, [activeTabId, ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

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

  const handleSelectActiveConversation = useCallback((sessionId: string, sessionPath?: string, _slotId?: string, label?: string) => {
    if (!ws.activeWorkspaceId) return;
    handleSelectConversation(ws.activeWorkspaceId, sessionId, sessionPath, undefined, label);
    // On mobile, switch to chat panel after selecting a conversation
    if (isMobile) {
      setMobileActivePanel('chat');
    }
  }, [handleSelectConversation, ws.activeWorkspaceId, isMobile]);

  // Ensure slots are created for tabs
  useEffect(() => {
    ws.workspaces.forEach((workspace) => {
      const workspacePath = workspace.path;
      const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
      const requested = sessionSlotListRequestedRef.current;

      tabs.forEach((tab) => {
        if (workspace.slots[tab.slotId]) return;
        if (requested.has(tab.slotId)) return;
        requested.add(tab.slotId);
        ws.createSessionSlotForWorkspace(workspace.id, tab.slotId);
      });
    });
  }, [ws.workspaces, ws.paneTabsByWorkspace, ws.createSessionSlotForWorkspace]);

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

  // Memoized handlers for active workspace
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
        connecting...
      </div>
    );
  }

  // Get backend commands from focused slot
  const focusedSlot = focusedSlotId ? activeWs?.slots[focusedSlotId] : null;
  const backendCommands = focusedSlot?.commands || [];

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
  const showRightPane = !isMobile && Boolean(activeWs) && isRightPaneOpen;

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

      {/* Update available banner */}
      {ws.updateAvailable && !updateDismissed && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-pi-accent/10 border-b border-pi-accent/30 text-[13px]">
          <span className="text-pi-text">
            Update available: <span className="font-semibold text-pi-accent">v{ws.updateAvailable.latest}</span>
            <span className="text-pi-muted ml-1">(current: v{ws.updateAvailable.current})</span>
          </span>
          <button
            onClick={() => setUpdateDismissed(true)}
            className="ml-3 p-0.5 text-pi-muted hover:text-pi-text transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
              className="flex-shrink-0 w-px bg-pi-border cursor-col-resize hover:bg-pi-accent/40"
            />
          </>
        )}

        <div className={`flex flex-1 flex-col min-w-0 ${isMobile ? 'pb-14' : ''}`}>
          {!isMobile && activeWs && (
            <PaneTabsBar
              tabs={tabBarTabs}
              onSelectTab={handleSelectTab}
              onAddTab={handleAddTab}
              onCloseTab={handleCloseTab}
              onRenameTab={handleRenameTab}
              onReorderTabs={handleReorderTabs}
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
                    title="Toggle file pane"
                  >
                    <FileText className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main content area */}
          {!activeWs ? (
            <div className="flex-1 flex flex-col items-center justify-center text-pi-muted">
              <p className="mb-4">No workspace open</p>
              <button
                onClick={() => setShowBrowser(true)}
                className="px-4 py-2 border border-pi-border text-pi-text hover:border-pi-accent transition-colors"
              >
                Open directory
              </button>
            </div>
          ) : activeWorkspaceTabs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-pi-muted">
              <p className="text-lg mb-2">No conversations open</p>
              <p className="text-sm mb-6">Select a conversation from the sidebar or start a new one</p>
              <button
                onClick={() => {
                  const newTabId = createTabId();
                  const newSlotId = createSlotId();
                  const newTab: PaneTabPageState = {
                    id: newTabId,
                    label: 'New Conversation',
                    slotId: newSlotId,
                  };
                  ws.createSessionSlotForWorkspace(activeWs.id, newSlotId);
                  ws.setPaneTabsForWorkspace(activeWs.path, [newTab], newTabId);
                }}
                className="px-4 py-2 bg-pi-accent text-white rounded hover:bg-pi-accent/90 transition-colors"
              >
                New Conversation
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
                const slotId = focusedSlotId || 'default';
                ws.setScopedModels(slotId, models);
              }}
              startupInfo={activeWs.startupInfo || null}
              jobLocations={jobLocations}
              onAddJobLocation={ws.addJobLocation}
              onRemoveJobLocation={(path) => ws.updateJobConfig({ removeLocation: path })}
              onSetDefaultJobLocation={(path) => ws.updateJobConfig({ defaultLocation: path })}
              onReorderJobLocations={(paths) => ws.updateJobConfig({ locations: paths })}
            />
          ) : tab?.slot ? (
            <SessionView
              slot={tab.slot}
              slotId={tab.slotId}
              sessions={activeWs.sessions}
              models={activeWs.models}
              backendCommands={backendCommands}
              onSendPrompt={(message, images) => ws.sendPrompt(tab.slotId, message, images)}
              onSteer={(message, images) => ws.steer(tab.slotId, message, images)}
              onAbort={() => ws.abort(tab.slotId)}
              onLoadSession={(sessionId) => {
                const targetSession = activeWs.sessions.find(s => s.id === sessionId)?.path || sessionId;
                ws.switchSession(tab.slotId, targetSession);
              }}
              onNewSession={() => ws.newSession(tab.slotId)}
              onGetForkMessages={() => ws.getForkMessages(tab.slotId)}
              onFork={(entryId) => ws.fork(tab.slotId, entryId)}
              onSetModel={(provider, modelId) => ws.setModel(tab.slotId, provider, modelId)}
              onSetThinkingLevel={(level) => ws.setThinkingLevel(tab.slotId, level)}
              onQuestionnaireResponse={(toolCallId, response) => {
                ws.sendQuestionnaireResponse(tab.slotId, toolCallId, response);
              }}
              onExtensionUIResponse={(response) => ws.sendExtensionUIResponse(tab.slotId, response)}
              onCustomUIInput={(input) => ws.sendCustomUIInput(tab.slotId, input)}
              onCompact={() => ws.compact(tab.slotId)}
              onOpenSettings={openSettings}
              onExport={() => ws.exportHtml(tab.slotId)}
              onRenameSession={(name) => ws.setSessionName(tab.slotId, name)}
              onShowHotkeys={() => openSettings('keyboard')}
              onFollowUp={(message) => ws.followUp(tab.slotId, message)}
              onReload={handleDeploy}
              onGetSessionTree={() => ws.getSessionTree(tab.slotId)}
              onNavigateTree={(targetId) => ws.navigateTree(tab.slotId, targetId)}
              onCopyLastAssistant={() => ws.copyLastAssistant(tab.slotId)}
              onGetQueuedMessages={() => ws.getQueuedMessages(tab.slotId)}
              onListFiles={(query, requestId) => ws.listFiles(query, undefined, requestId)}
              onExecuteBash={(command, excludeFromContext) => {
                ws.executeBash(tab.slotId, command, excludeFromContext);
              }}
              onToggleAllToolsCollapsed={() => setAllToolsCollapsed(prev => !prev)}
              onToggleAllThinkingCollapsed={() => setAllThinkingCollapsed(prev => !prev)}
              activePlan={ws.activePlanByWorkspace[activeWs.id] ?? null}
              onUpdatePlanTask={ws.updatePlanTask}
              onDeactivatePlan={ws.deactivatePlan}
              activeJobs={ws.activeJobsByWorkspace[activeWs.id] || []}
              onUpdateJobTask={ws.updateJobTask}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-pi-muted">
              Loading...
            </div>
          )}
        </div>

        {/* Right panel handle when closed */}
        {!isMobile && activeWs && !isRightPaneOpen && (
          <div
            className="flex-shrink-0 border-l border-pi-border bg-pi-surface flex flex-col items-center py-2 cursor-pointer hover:bg-pi-bg"
            style={{ width: 32 }}
            onClick={toggleRightPane}
            title="Show file pane (⌘⇧F)"
          >
            <FileText className="w-4 h-4 text-pi-muted" />
          </div>
        )}

        {showRightPane && (
          <>
            <div
              onMouseDown={handleRightPaneResizeStart}
              className="flex-shrink-0 w-px bg-pi-border cursor-col-resize hover:bg-pi-accent/40"
            />
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
              onGetJobLocations={ws.getJobLocations}
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
              onStartJobConversation={ws.startJobConversation}
              onNavigateToSlot={handleNavigateToSlot}
              onTogglePane={toggleRightPane}
              onAddJobAttachment={ws.addJobAttachment}
              onRemoveJobAttachment={ws.removeJobAttachment}
              onReadJobAttachment={ws.readJobAttachment}
              onBrowseJobDirectory={ws.browseJobDirectory}
              onAddJobLocation={ws.addJobLocation}
            />
          </>
        )}
      </div>

      {/* Mobile 3-panel layout - no animations */}
      {isMobile && activeWs && (
        <>
          {/* Conversations panel - instant show/hide */}
          {mobileActivePanel === 'conversations' && (
            <div className="fixed top-0 bottom-14 left-0 z-40 w-full bg-pi-surface">
              <MobileSidebar
                workspaces={sidebarWorkspaces}
                activeWorkspaceId={ws.activeWorkspaceId}
                conversations={activeConversations}
                entriesByPath={workspaceEntries[activeWs.id] || {}}
                gitStatusFiles={workspaceGitStatus[activeWs.id] || []}
                gitBranch={workspaceGitBranch[activeWs.id] ?? null}
                gitWorktree={workspaceGitWorktree[activeWs.id] ?? null}
                selectedFilePath={selectedFilePathByWorkspace[activeWs.id] || ''}
                openFilePath={openFilePathByWorkspace[activeWs.id]}
                activeJobs={ws.activeJobsByWorkspace[activeWs.id] || []}
                onSelectWorkspace={handleSelectWorkspace}
                onCloseWorkspace={ws.closeWorkspace}
                onSelectConversation={handleSelectActiveConversation}
                onRenameConversation={handleRenameActiveConversation}
                onDeleteConversation={handleDeleteActiveConversation}
                onRequestEntries={activeWorkspaceRequestEntries}
                onRequestGitStatus={activeWorkspaceRequestGitStatus}
                onSelectFile={handleSelectFile}
                onSelectGitFile={handleSelectGitFile}
                onWatchDirectory={activeWorkspaceWatchDirectory}
                onUnwatchDirectory={activeWorkspaceUnwatchDirectory}
                onOpenBrowser={() => {
                  setShowBrowser(true);
                  setMobileActivePanel('chat');
                }}
                onOpenSettings={() => {
                  openSettings();
                  setMobileActivePanel('chat');
                }}
                onClose={() => setMobileActivePanel('chat')}
                className="h-full w-full"
              />
            </div>
          )}

          {/* Tools panel - instant show/hide */}
          {mobileActivePanel === 'tools' && (
            <div className="fixed top-0 bottom-14 right-0 z-40 w-full bg-pi-surface">
              <WorkspaceFilesPane
                className="h-full w-full"
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
                onGetJobLocations={ws.getJobLocations}
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
                onStartJobConversation={ws.startJobConversation}
                onNavigateToSlot={handleNavigateToSlot}
                onTogglePane={() => setMobileActivePanel('chat')}
                onAddJobAttachment={ws.addJobAttachment}
                onRemoveJobAttachment={ws.removeJobAttachment}
                onReadJobAttachment={ws.readJobAttachment}
                onBrowseJobDirectory={ws.browseJobDirectory}
                onAddJobLocation={ws.addJobLocation}
              />
            </div>
          )}
        </>
      )}

      {/* Mobile bottom toolbar - always visible with high z-index */}
      {isMobile && activeWs && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <MobileBottomToolbar
            activePanel={mobileActivePanel}
            onSelectPanel={setMobileActivePanel}
          />
        </div>
      )}
    </div>
  );
}

export default App;
