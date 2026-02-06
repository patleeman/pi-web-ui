/**
 * Pi Web UI
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
import { StatusBar } from './components/StatusBar';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { Settings } from './components/Settings';
import { ForkDialog } from './components/ForkDialog';
import { HotkeysDialog } from './components/HotkeysDialog';
import { TreeDialog } from './components/TreeDialog';
import { PaneTabsBar } from './components/PaneTabsBar';
import { WorkspaceRail } from './components/WorkspaceRail';
import { ConversationSidebar } from './components/ConversationSidebar';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceFilesPane } from './components/WorkspaceFilesPane';
import { useSettings } from './contexts/SettingsContext';
import type { SessionTreeNode, FileInfo, PaneLayoutNode, PaneTabPageState } from '@pi-web-ui/shared';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'
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

const collectPaneNodes = (node: PaneLayoutNode): Array<{ id: string; slotId: string }> => {
  if (node.type === 'pane') return [node];
  return node.children.flatMap(collectPaneNodes);
};

const findSlotIdByPaneId = (node: PaneLayoutNode, paneId: string): string | null => {
  const pane = collectPaneNodes(node).find((item) => item.id === paneId);
  return pane?.slotId || null;
};

interface ForkMessage {
  entryId: string;
  text: string;
}

function App() {
  const ws = useWorkspaces(WS_URL);
  const notifications = useNotifications({ titlePrefix: 'Pi' });
  const isMobile = useIsMobile();
  const isKeyboardVisible = useKeyboardVisible();
  const { openSettings } = useSettings();
  
  const [showBrowser, setShowBrowser] = useState(false);
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set());
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkMessages, setForkMessages] = useState<ForkMessage[]>([]);
  const [forkSlotId, setForkSlotId] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  // New feature state - collapse toggles (not fully implemented yet)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_allToolsCollapsed, setAllToolsCollapsed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_allThinkingCollapsed, setAllThinkingCollapsed] = useState(false);
  const [treeDialogOpen, setTreeDialogOpen] = useState(false);
  const [sessionTree, setSessionTree] = useState<SessionTreeNode[]>([]);
  const [currentLeafId, setCurrentLeafId] = useState<string | null>(null);
  const [treeSlotId, setTreeSlotId] = useState<string | null>(null);
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
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<Record<string, Array<{ path: string; status: import('@pi-web-ui/shared').GitFileStatus }>>>({});
  const [workspaceFileDiffs, setWorkspaceFileDiffs] = useState<Record<string, Record<string, string>>>({});
  const [openFilePathByWorkspace, setOpenFilePathByWorkspace] = useState<Record<string, string>>({});
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(Math.max(ws.sidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
  const [rightPaneRatio, setRightPaneRatio] = useState(0.5);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isRightPaneResizing, setIsRightPaneResizing] = useState(false);
  
  const layoutRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  
  const workspaceEntriesRequestedRef = useRef<Record<string, Set<string>>>({});
  const workspaceFileRequestsRef = useRef<Record<string, Set<string>>>({});
  const sessionSlotRequestsRef = useRef<Record<string, Set<string>>>({});
  const sessionSlotListRequestedRef = useRef<Set<string>>(new Set());
  
  // Mobile pane index - tracks which pane is shown on mobile (separate from focusedPaneId)
  const [mobilePaneIndex, setMobilePaneIndex] = useState(0);
  
  // Keep mobile pane index in bounds when panes are added/removed
  const prevPaneCountRef = useRef(0);
  
  const prevStreamingRef = useRef<Record<string, boolean>>({});

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

  // Listen for fork messages event from useWorkspaces
  useEffect(() => {
    const handleForkMessages = (e: CustomEvent<{ workspaceId: string; sessionSlotId?: string; messages: ForkMessage[] }>) => {
      setForkMessages(e.detail.messages);
      setForkDialogOpen(true);
    };

    window.addEventListener('pi:forkMessages', handleForkMessages as EventListener);
    return () => window.removeEventListener('pi:forkMessages', handleForkMessages as EventListener);
  }, []);

  // Listen for session tree event
  useEffect(() => {
    const handleSessionTree = (e: CustomEvent<{ tree: SessionTreeNode[]; currentLeafId: string | null }>) => {
      setSessionTree(e.detail.tree);
      setCurrentLeafId(e.detail.currentLeafId);
      setTreeDialogOpen(true);
    };

    window.addEventListener('pi:sessionTree', handleSessionTree as EventListener);
    return () => window.removeEventListener('pi:sessionTree', handleSessionTree as EventListener);
  }, []);

  useEffect(() => {
    const handleWorkspaceEntries = (e: CustomEvent<{ workspaceId: string; path: string; entries: FileInfo[]; requestId?: string }>) => {
      if (e.detail.requestId && !e.detail.requestId.startsWith('workspace-entries:')) return;
      setWorkspaceEntries(prev => ({
        ...prev,
        [e.detail.workspaceId]: {
          ...(prev[e.detail.workspaceId] || {}),
          [e.detail.path]: e.detail.entries,
        },
      }));
      const requested = workspaceEntriesRequestedRef.current[e.detail.workspaceId];
      if (requested) {
        requested.delete(e.detail.path);
      }
    };

    window.addEventListener('pi:workspaceEntries', handleWorkspaceEntries as EventListener);
    return () => window.removeEventListener('pi:workspaceEntries', handleWorkspaceEntries as EventListener);
  }, []);

  useEffect(() => {
    const handleWorkspaceFile = (e: CustomEvent<{ workspaceId: string; path: string; content: string; truncated?: boolean; requestId?: string }>) => {
      if (e.detail.requestId && !e.detail.requestId.startsWith('workspace-file:')) return;
      setWorkspaceFileContents(prev => ({
        ...prev,
        [e.detail.workspaceId]: {
          ...(prev[e.detail.workspaceId] || {}),
          [e.detail.path]: { content: e.detail.content, truncated: Boolean(e.detail.truncated) },
        },
      }));
      const requested = workspaceFileRequestsRef.current[e.detail.workspaceId];
      if (requested) {
        requested.delete(e.detail.path);
      }
    };

    window.addEventListener('pi:workspaceFile', handleWorkspaceFile as EventListener);
    return () => window.removeEventListener('pi:workspaceFile', handleWorkspaceFile as EventListener);
  }, []);

  useEffect(() => {
    const handleGitStatus = (e: CustomEvent<{ workspaceId: string; files: Array<{ path: string; status: import('@pi-web-ui/shared').GitFileStatus }>; requestId?: string }>) => {
      setWorkspaceGitStatus(prev => ({
        ...prev,
        [e.detail.workspaceId]: e.detail.files,
      }));
    };

    window.addEventListener('pi:gitStatus', handleGitStatus as EventListener);
    return () => window.removeEventListener('pi:gitStatus', handleGitStatus as EventListener);
  }, []);

  useEffect(() => {
    const handleFileDiff = (e: CustomEvent<{ workspaceId: string; path: string; diff: string; requestId?: string }>) => {
      setWorkspaceFileDiffs(prev => ({
        ...prev,
        [e.detail.workspaceId]: {
          ...(prev[e.detail.workspaceId] || {}),
          [e.detail.path]: e.detail.diff,
        },
      }));
    };

    window.addEventListener('pi:fileDiff', handleFileDiff as EventListener);
    return () => window.removeEventListener('pi:fileDiff', handleFileDiff as EventListener);
  }, []);

  const requestWorkspaceEntries = useCallback((workspaceId: string, path: string) => {
    if (!ws.isConnected) return;
    const normalizedPath = path.replace(/^\/+/, '');
    const requested = workspaceEntriesRequestedRef.current[workspaceId] || new Set<string>();
    if (requested.has(normalizedPath)) return;
    requested.add(normalizedPath);
    workspaceEntriesRequestedRef.current[workspaceId] = requested;
    const requestId = `workspace-entries:${workspaceId}:${normalizedPath}:${Date.now()}`;
    ws.listWorkspaceEntries(workspaceId, normalizedPath, requestId);
  }, [ws]);

  const requestWorkspaceFile = useCallback((workspaceId: string, path: string) => {
    if (!ws.isConnected) return;
    const normalizedPath = path.replace(/^\/+/, '');
    if (!normalizedPath) return;
    const requested = workspaceFileRequestsRef.current[workspaceId] || new Set<string>();
    if (requested.has(normalizedPath)) return;
    requested.add(normalizedPath);
    workspaceFileRequestsRef.current[workspaceId] = requested;
    const requestId = `workspace-file:${workspaceId}:${normalizedPath}:${Date.now()}`;
    ws.readWorkspaceFile(workspaceId, normalizedPath, requestId);
  }, [ws]);

  const requestGitStatus = useCallback((workspaceId: string) => {
    if (!ws.isConnected) return;
    ws.getGitStatus(workspaceId);
  }, [ws]);

  const requestFileDiff = useCallback((workspaceId: string, path: string) => {
    if (!ws.isConnected) return;
    ws.getFileDiff(workspaceId, path);
  }, [ws]);

  const normalizeFileLink = useCallback((path: string) => {
    const trimmed = path.replace(/^file:\/\//i, '');
    return trimmed.replace(/^~\//, '').replace(/^\/+/, '').replace(/^\.\//, '');
  }, []);

  useEffect(() => {
    const handleOpenFile = (e: CustomEvent<{ path: string }>) => {
      if (!ws.activeWorkspace) return;
      const normalizedPath = normalizeFileLink(e.detail.path || '');
      if (!normalizedPath) return;

      const workspaceId = ws.activeWorkspace.id;
      const workspacePath = ws.activeWorkspace.path;
      setOpenFilePathByWorkspace((prev) => ({ ...prev, [workspaceId]: normalizedPath }));
      requestWorkspaceFile(workspaceId, normalizedPath);
      requestWorkspaceEntries(workspaceId, normalizedPath.split('/').slice(0, -1).join('/'));

      const isOpen = ws.rightPaneByWorkspace[workspacePath] ?? false;
      if (!isOpen) {
        ws.setWorkspaceRightPaneOpen(workspacePath, true);
      }
    };

    window.addEventListener('pi:openFile', handleOpenFile as EventListener);
    return () => window.removeEventListener('pi:openFile', handleOpenFile as EventListener);
  }, [normalizeFileLink, requestWorkspaceEntries, requestWorkspaceFile, ws.activeWorkspace, ws.rightPaneByWorkspace, ws.setWorkspaceRightPaneOpen]);

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
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    
    // Escape closes modals
    if (e.key === 'Escape') {
      if (showHotkeys) {
        setShowHotkeys(false);
        return;
      }
      if (treeDialogOpen) {
        setTreeDialogOpen(false);
        return;
      }
      if (forkDialogOpen) {
        setForkDialogOpen(false);
        return;
      }
      if (showBrowser) {
        setShowBrowser(false);
        return;
      }
    }
    
    // ⌘O - Open directory
    if (e.key === 'o' && isMod) {
      e.preventDefault();
      setShowBrowser(true);
      return;
    }
    
    // ⌘, - Settings
    if (e.key === ',' && isMod) {
      e.preventDefault();
      openSettings();
      return;
    }

    // ⌘Shift+F - Toggle file pane
    if (e.key === 'f' && isMod && e.shiftKey) {
      e.preventDefault();
      toggleRightPane();
      return;
    }
    
    // ⌘\ - Split vertical
    if (e.key === '\\' && isMod && !isMobile) {
      e.preventDefault();
      panes.split('vertical');
      return;
    }
    
    // ⌘Shift\ - Split horizontal
    if (e.key === '\\' && isMod && e.shiftKey && !isMobile) {
      e.preventDefault();
      panes.split('horizontal');
      return;
    }
    
    // ⌘W - Close pane (create new conversation if it's the last)
    if (e.key === 'w' && isMod) {
      e.preventDefault();
      if (panes.focusedPaneId) {
        handleClosePane(panes.focusedPaneId);
      }
      return;
    }
    
    // ⌘1-4 - Focus pane by number
    if (isMod && e.key >= '1' && e.key <= '4') {
      const idx = parseInt(e.key) - 1;
      if (idx < panes.panes.length) {
        e.preventDefault();
        panes.focusPane(panes.panes[idx].id);
      }
      return;
    }
    
    // ⌘. - Stop agent in focused pane
    if (e.key === '.' && isMod && panes.focusedSlotId) {
      e.preventDefault();
      ws.abort(panes.focusedSlotId);
      return;
    }
  }, [showBrowser, forkDialogOpen, showHotkeys, treeDialogOpen, openSettings, toggleRightPane, isMobile, panes, handleClosePane, ws]);

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
    const targetPaneId = tabInfo?.paneId || targetTab.focusedPaneId || collectPaneNodes(targetTab.layout)[0]?.id;
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
  }, [activeTabId, focusPaneById, isMobile, panes.updatePaneSlot, resolveSessionPath, slotToTabByWorkspace, ws, ws.activeWorkspaceId, ws.activePaneTabByWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace, ws.setActiveWorkspace, ws.switchSession, ws.workspaces]);

  const sidebarWorkspaces = useMemo(() => ws.workspaces.map((workspace) => {
    const isActive = workspace.id === ws.activeWorkspaceId;
    const isStreaming = Object.values(workspace.slots).some((slot) => slot.isStreaming);
    const tabs = ws.paneTabsByWorkspace[workspace.path] || [];
    const activeTabForWorkspace = ws.activePaneTabByWorkspace[workspace.path] || tabs[0]?.id || null;
    const slotMap = slotToTabByWorkspace[workspace.id] || new Map();

    const sessionSlotInfo = new Map<string, { slotIds: string[]; isStreaming: boolean }>();
    Object.entries(workspace.slots).forEach(([slotId, slot]) => {
      const sessionId = slot.state?.sessionId;
      if (!sessionId) return;
      const entry = sessionSlotInfo.get(sessionId) || { slotIds: [], isStreaming: false };
      entry.slotIds.push(slotId);
      if (slot.isStreaming) entry.isStreaming = true;
      sessionSlotInfo.set(sessionId, entry);
    });

    const getSlotFirstUserMessage = (slot: (typeof workspace.slots)[string]) => (
      slot.messages.find((message) => message.role === 'user')?.content
        ?.find((content) => content.type === 'text')?.text
    );

    const sessionMap = new Map<string, { sessionId: string; sessionPath?: string; label: string; updatedAt: number }>();
    workspace.sessions.forEach((session) => {
      const label = session.name
        || (session.firstMessage && session.firstMessage !== '(no messages)' ? session.firstMessage.slice(0, 40) : null)
        || 'New conversation';
      sessionMap.set(session.id, {
        sessionId: session.id,
        sessionPath: session.path,
        label,
        updatedAt: session.updatedAt,
      });
    });

    Object.entries(workspace.slots).forEach(([, slot]) => {
      const sessionId = slot.state?.sessionId;
      if (!sessionId) return;
      const existing = sessionMap.get(sessionId);
      if (existing) {
        if (!existing.sessionPath && slot.state?.sessionFile) {
          existing.sessionPath = slot.state.sessionFile;
        }
        return;
      }
      const firstUserMessage = getSlotFirstUserMessage(slot);
      const label = slot.state?.sessionName
        || (firstUserMessage ? firstUserMessage.slice(0, 40) : undefined)
        || 'New conversation';
      const updatedAt = slot.messages.reduce((latest, message) => Math.max(latest, message.timestamp ?? 0), 0) || Date.now();
      sessionMap.set(sessionId, {
        sessionId,
        sessionPath: slot.state?.sessionFile,
        label,
        updatedAt,
      });
    });

    const conversations = [...sessionMap.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((session) => {
        const slotInfo = sessionSlotInfo.get(session.sessionId);
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
  }), [ws.workspaces, ws.activeWorkspaceId, ws.paneTabsByWorkspace, ws.activePaneTabByWorkspace, needsAttention, panes.focusedPaneId, slotToTabByWorkspace]);

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

  const tabBarTabs = useMemo(() => {
    if (!ws.activeWorkspace) return [];
    return activeWorkspaceTabs.map((tab) => {
      const tabPanes = collectPaneNodes(tab.layout);
      const isStreaming = tabPanes.some((pane) => ws.activeWorkspace?.slots[pane.slotId]?.isStreaming);
      return {
        id: tab.id,
        label: tab.label,
        isActive: tab.id === activeTabId,
        isStreaming,
      };
    });
  }, [ws.activeWorkspace, activeWorkspaceTabs, activeTabId]);

  const handleSelectTab = useCallback((tabId: string) => {
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    if (!tabs.length) return;
    ws.setPaneTabsForWorkspace(workspacePath, tabs, tabId);
  }, [ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleAddTab = useCallback(() => {
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    const newTabId = createTabId();
    const newSlotId = createSlotId();
    const newPaneId = createPaneId();
    const newTab: PaneTabPageState = {
      id: newTabId,
      label: `Tab ${tabs.length + 1}`,
      layout: createSinglePaneLayout(newSlotId, newPaneId),
      focusedPaneId: newPaneId,
    };
    ws.createSessionSlotForWorkspace(ws.activeWorkspace.id, newSlotId);
    ws.setPaneTabsForWorkspace(workspacePath, [...tabs, newTab], newTabId);
  }, [ws.activeWorkspace, ws.createSessionSlotForWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleCloseTab = useCallback((tabId: string) => {
    if (!ws.activeWorkspace) return;
    const workspacePath = ws.activeWorkspace.path;
    const tabs = ws.paneTabsByWorkspace[workspacePath] || [];
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    if (!nextTabs.length) return;
    const nextActive = tabId === activeTabId ? nextTabs[0].id : activeTabId || nextTabs[0].id;
    ws.setPaneTabsForWorkspace(workspacePath, nextTabs, nextActive);
  }, [activeTabId, ws.activeWorkspace, ws.paneTabsByWorkspace, ws.setPaneTabsForWorkspace]);

  const handleRenameTab = useCallback((tabId: string, label: string) => {
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

  // Loading state
  if (!ws.isConnected && ws.isConnecting) {
    return (
      <div className="h-full bg-pi-bg flex items-center justify-center font-mono text-[14px] text-pi-muted">
        <span className="cursor-blink">connecting...</span>
      </div>
    );
  }

  // Count running/compacting/error states for status bar
  const runningCount = activeWs
    ? Object.values(activeWs.slots).filter(s => s.isStreaming).length
    : 0;
  const compactingCount = activeWs
    ? Object.values(activeWs.slots).filter(s => s.state?.isCompacting).length
    : 0;
  
  // Get context percent from focused slot
  const focusedSlot = panes.focusedSlotId ? activeWs?.slots[panes.focusedSlotId] : null;
  const contextPercent = focusedSlot?.state?.contextWindowPercent;
  const gitBranch = focusedSlot?.state?.git.branch || null;
  const gitChangedFiles = focusedSlot?.state?.git.changedFiles || 0;

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
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Directory browser modal */}
      {showBrowser && (
        <DirectoryBrowser
          currentPath={ws.currentBrowsePath}
          entries={ws.directoryEntries}
          allowedRoots={ws.allowedRoots}
          recentWorkspaces={ws.recentWorkspaces}
          homeDirectory={ws.homeDirectory || ws.allowedRoots[0] || '/'}
          onNavigate={ws.browseDirectory}
          onOpenWorkspace={(path) => {
            ws.openWorkspace(path);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {/* Settings modal */}
      <Settings
        notificationPermission={notifications.isSupported ? notifications.permission : 'unsupported'}
        onRequestNotificationPermission={notifications.requestPermission}
        deployStatus={ws.deployState.status}
        deployMessage={ws.deployState.message}
        onDeploy={handleDeploy}
        allowedRoots={ws.allowedRoots}
        onUpdateAllowedRoots={() => {}}
      />

      {/* Fork dialog */}
      <ForkDialog
        isOpen={forkDialogOpen}
        messages={forkMessages}
        onFork={(entryId) => {
          if (forkSlotId) {
            ws.fork(forkSlotId, entryId);
          }
          setForkDialogOpen(false);
          setForkMessages([]);
        }}
        onClose={() => {
          setForkDialogOpen(false);
          setForkMessages([]);
        }}
      />

      {/* Hotkeys dialog */}
      <HotkeysDialog
        isOpen={showHotkeys}
        onClose={() => setShowHotkeys(false)}
      />

      {/* Tree dialog */}
      <TreeDialog
        isOpen={treeDialogOpen}
        tree={sessionTree}
        currentLeafId={currentLeafId}
        onNavigate={(targetId, summarize) => {
          if (treeSlotId) {
            ws.navigateTree(treeSlotId, targetId, summarize);
          } else if (panes.focusedSlotId) {
            ws.navigateTree(panes.focusedSlotId, targetId, summarize);
          }
          setTreeDialogOpen(false);
        }}
        onClose={() => setTreeDialogOpen(false)}
      />

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
              conversations={activeConversations}
              onSelectConversation={handleSelectActiveConversation}
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
                setForkSlotId(slotId);
                ws.getForkMessages(slotId);
              }}
              onSetModel={(slotId, provider, modelId) => ws.setModel(slotId, provider, modelId)}
              onSetThinkingLevel={(slotId, level) => ws.setThinkingLevel(slotId, level)}
              onQuestionnaireResponse={handleQuestionnaireResponse}
              onExtensionUIResponse={(slotId, response) => ws.sendExtensionUIResponse(slotId, response)}
              onCustomUIInput={(slotId, input) => ws.sendCustomUIInput(slotId, input)}
              onCompact={(slotId) => ws.compact(slotId)}
              onOpenSettings={openSettings}
              onExport={(slotId) => ws.exportHtml(slotId)}
              onRenameSession={(slotId, name) => ws.setSessionName(slotId, name)}
              onShowHotkeys={() => setShowHotkeys(true)}
              onFollowUp={(slotId, message) => ws.followUp(slotId, message)}
              onReload={handleDeploy}
              // New features
              onGetSessionTree={(slotId) => {
                setTreeSlotId(slotId);
                ws.getSessionTree(slotId);
              }}
              onCopyLastAssistant={(slotId) => ws.copyLastAssistant(slotId)}
              onGetQueuedMessages={(slotId) => ws.getQueuedMessages(slotId)}
              onClearQueue={(slotId) => ws.clearQueue(slotId)}
              onListFiles={(_slotId, query, requestId) => ws.listFiles(query, undefined, requestId)}
              onExecuteBash={(slotId, command, excludeFromContext) => {
                ws.executeBash(slotId, command, excludeFromContext);
              }}

              onToggleAllToolsCollapsed={() => setAllToolsCollapsed(prev => !prev)}
              onToggleAllThinkingCollapsed={() => setAllThinkingCollapsed(prev => !prev)}
              onGetScopedModels={(slotId) => ws.getScopedModels(slotId)}
              onSetScopedModels={(slotId, models) => ws.setScopedModels(slotId, models)}
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
              entriesByPath={workspaceEntries[activeWs!.id] || {}}
              fileContentsByPath={workspaceFileContents[activeWs!.id] || {}}
              gitStatusFiles={workspaceGitStatus[activeWs!.id] || []}
              fileDiffsByPath={workspaceFileDiffs[activeWs!.id] || {}}
              onRequestEntries={(path) => requestWorkspaceEntries(activeWs!.id, path)}
              onRequestFile={(path) => requestWorkspaceFile(activeWs!.id, path)}
              onRequestGitStatus={() => requestGitStatus(activeWs!.id)}
              onRequestFileDiff={(path) => requestFileDiff(activeWs!.id, path)}
              onTogglePane={toggleRightPane}
              openFilePath={openFilePathByWorkspace[activeWs!.id]}
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
            entriesByPath={workspaceEntries[activeWs.id] || {}}
            fileContentsByPath={workspaceFileContents[activeWs.id] || {}}
            gitStatusFiles={workspaceGitStatus[activeWs.id] || []}
            fileDiffsByPath={workspaceFileDiffs[activeWs.id] || {}}
            onRequestEntries={(path) => requestWorkspaceEntries(activeWs.id, path)}
            onRequestFile={(path) => requestWorkspaceFile(activeWs.id, path)}
            onRequestGitStatus={() => requestGitStatus(activeWs.id)}
            onRequestFileDiff={(path) => requestFileDiff(activeWs.id, path)}
            onTogglePane={toggleRightPane}
            openFilePath={openFilePathByWorkspace[activeWs.id]}
          />
        </div>
      )}

      {/* Status bar */}
      {activeWs && (
        <StatusBar
          cwd={isMobile ? activeWs.name : activeWs.path}
          gitBranch={gitBranch}
          gitChangedFiles={gitChangedFiles}
          runningCount={runningCount}
          compactingCount={compactingCount}
          errorCount={0}
          contextPercent={contextPercent}
          isKeyboardVisible={isKeyboardVisible}
        />
      )}
    </div>
  );
}

export default App;
