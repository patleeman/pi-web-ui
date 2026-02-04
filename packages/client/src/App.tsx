/**
 * Pi Web UI
 * 
 * Multi-pane interface - TUI-style web experience.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useWorkspaces } from './hooks/useWorkspaces';
import { usePanes } from './hooks/usePanes';
import { useNotifications } from './hooks/useNotifications';
import { useIsMobile } from './hooks/useIsMobile';
import { useKeyboardVisible } from './hooks/useKeyboardVisible';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { PaneManager } from './components/PaneManager';
import { MobilePaneTabs } from './components/MobilePaneTabs';
import { StatusBar } from './components/StatusBar';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { Settings } from './components/Settings';
import { ForkDialog } from './components/ForkDialog';
import { HotkeysDialog } from './components/HotkeysDialog';
import { TreeDialog } from './components/TreeDialog';
import { ExtensionUIDialog } from './components/ExtensionUIDialog';
import { CustomUIDialog } from './components/CustomUIDialog';
import { useSettings } from './contexts/SettingsContext';
import type { SessionTreeNode, ExtensionUIRequest, ExtensionUIResponse, CustomUIState, CustomUINode, CustomUIInputEvent } from '@pi-web-ui/shared';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'
  : `ws://${window.location.host}/ws`;

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
  
  // Mobile pane index - tracks which pane is shown on mobile (separate from focusedPaneId)
  const [mobilePaneIndex, setMobilePaneIndex] = useState(0);
  
  // Keep mobile pane index in bounds when panes are added/removed
  const prevPaneCountRef = useRef(0);
  
  // Extension UI state
  const [extensionUIRequest, setExtensionUIRequest] = useState<{
    request: ExtensionUIRequest;
    slotId: string;
  } | null>(null);
  
  // Custom UI state (for ctx.ui.custom())
  const [customUIState, setCustomUIState] = useState<{
    state: CustomUIState;
    slotId: string;
  } | null>(null);
  
  const prevStreamingRef = useRef<Record<string, boolean>>({});

  // Pane management - connected to workspace session slots
  const panes = usePanes({
    workspace: ws.activeWorkspace,
    workspaceIds: ws.workspaces.map(w => w.id),
    onCreateSlot: ws.createSessionSlotForWorkspace,
    onCloseSlot: ws.closeSessionSlotForWorkspace,
  });

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

  // Listen for extension UI request events
  useEffect(() => {
    const handleExtensionUIRequest = (e: CustomEvent<{ 
      workspaceId: string; 
      sessionSlotId?: string; 
      request: ExtensionUIRequest 
    }>) => {
      const slotId = e.detail.sessionSlotId || 'default';
      setExtensionUIRequest({
        request: e.detail.request,
        slotId,
      });
    };

    window.addEventListener('pi:extensionUIRequest', handleExtensionUIRequest as EventListener);
    return () => window.removeEventListener('pi:extensionUIRequest', handleExtensionUIRequest as EventListener);
  }, []);

  // Listen for custom UI events (ctx.ui.custom())
  useEffect(() => {
    const handleCustomUIStart = (e: CustomEvent<{
      workspaceId: string;
      sessionSlotId?: string;
      state: CustomUIState;
    }>) => {
      const slotId = e.detail.sessionSlotId || 'default';
      setCustomUIState({
        state: e.detail.state,
        slotId,
      });
    };

    const handleCustomUIUpdate = (e: CustomEvent<{
      workspaceId: string;
      sessionSlotId?: string;
      sessionId: string;
      root: CustomUINode;
    }>) => {
      setCustomUIState((prev) => {
        if (!prev || prev.state.sessionId !== e.detail.sessionId) return prev;
        return {
          ...prev,
          state: {
            ...prev.state,
            root: e.detail.root,
          },
        };
      });
    };

    const handleCustomUIClose = (e: CustomEvent<{
      workspaceId: string;
      sessionSlotId?: string;
      sessionId: string;
    }>) => {
      setCustomUIState((prev) => {
        if (!prev || prev.state.sessionId !== e.detail.sessionId) return prev;
        return null;
      });
    };

    window.addEventListener('pi:customUIStart', handleCustomUIStart as EventListener);
    window.addEventListener('pi:customUIUpdate', handleCustomUIUpdate as EventListener);
    window.addEventListener('pi:customUIClose', handleCustomUIClose as EventListener);
    
    return () => {
      window.removeEventListener('pi:customUIStart', handleCustomUIStart as EventListener);
      window.removeEventListener('pi:customUIUpdate', handleCustomUIUpdate as EventListener);
      window.removeEventListener('pi:customUIClose', handleCustomUIClose as EventListener);
    };
  }, []);

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
    
    // ⌘W - Close pane (if more than one)
    if (e.key === 'w' && isMod && panes.panes.length > 1) {
      e.preventDefault();
      if (panes.focusedPaneId) {
        panes.closePane(panes.focusedPaneId);
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
  }, [showBrowser, forkDialogOpen, showHotkeys, treeDialogOpen, openSettings, isMobile, panes, ws]);

  // Handle deploy
  const handleDeploy = useCallback(() => {
    ws.deploy();
  }, [ws]);

  // Handle questionnaire response
  const handleQuestionnaireResponse = useCallback((slotId: string, toolCallId: string, response: string) => {
    ws.sendQuestionnaireResponse(slotId, toolCallId, response);
  }, [ws]);

  // Handle extension UI response
  const handleExtensionUIResponse = useCallback((response: ExtensionUIResponse) => {
    if (extensionUIRequest) {
      ws.sendExtensionUIResponse(extensionUIRequest.slotId, response);
      setExtensionUIRequest(null);
    }
  }, [extensionUIRequest, ws]);

  // Handle custom UI input
  const handleCustomUIInput = useCallback((input: CustomUIInputEvent) => {
    if (customUIState) {
      ws.sendCustomUIInput(customUIState.slotId, input);
    }
  }, [customUIState, ws]);

  // Handle custom UI close (user cancelled)
  const handleCustomUIClose = useCallback(() => {
    if (customUIState) {
      // Send Escape to signal cancellation
      ws.sendCustomUIInput(customUIState.slotId, {
        sessionId: customUIState.state.sessionId,
        inputType: 'key',
        key: 'Escape',
      });
    }
  }, [customUIState, ws]);

  // Loading state
  if (!ws.isConnected && ws.isConnecting) {
    return (
      <div className="h-full bg-pi-bg flex items-center justify-center font-mono text-[14px] text-pi-muted">
        <span className="cursor-blink">connecting...</span>
      </div>
    );
  }

  const activeWs = ws.activeWorkspace;
  
  // Build workspace tabs data
  const workspaceTabs = ws.workspaces.map(w => {
    const isStreaming = Object.values(w.slots).some(s => s.isStreaming);
    const messageCount = Object.values(w.slots).reduce((sum, s) => sum + s.messages.length, 0);
    
    return {
      id: w.id,
      name: w.name,
      path: w.path,
      isStreaming,
      messageCount,
      needsAttention: needsAttention.has(w.id),
    };
  });

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

      {/* Extension UI dialog (for /review and other extension commands) */}
      {extensionUIRequest && (
        <ExtensionUIDialog
          request={extensionUIRequest.request}
          onResponse={handleExtensionUIResponse}
        />
      )}

      {/* Custom UI dialog (for ctx.ui.custom()) */}
      {customUIState && (
        <CustomUIDialog
          state={customUIState.state}
          onInput={handleCustomUIInput}
          onClose={handleCustomUIClose}
        />
      )}

      {/* Connection status banner */}
      <ConnectionStatus isConnected={ws.isConnected} error={ws.error} />

      {/* Header: Workspace tabs + settings */}
      <div className="flex items-center border-b border-pi-border safe-area-top">
        <div className="flex-1 overflow-hidden">
          <WorkspaceTabs
            tabs={workspaceTabs}
            activeId={ws.activeWorkspaceId}
            onSelect={ws.setActiveWorkspace}
            onClose={ws.closeWorkspace}
            onOpenBrowser={() => setShowBrowser(true)}
          />
        </div>
        
        {/* Settings button */}
        <button
          onClick={openSettings}
          className="p-3 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-pi-muted hover:text-pi-text active:text-pi-text transition-colors"
          title="Settings (⌘,)"
        >
          <SettingsIcon className="w-6 h-6 sm:w-4 sm:h-4" />
        </button>
      </div>

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
          onClosePane={panes.closePane}
          onResizeNode={panes.resizeNode}
          onSendPrompt={(slotId, message, images) => ws.sendPrompt(slotId, message, images)}
          onSteer={(slotId, message, images) => ws.steer(slotId, message, images)}
          onAbort={(slotId) => ws.abort(slotId)}
          onLoadSession={(slotId, sessionId) => ws.switchSession(slotId, sessionId)}
          onNewSession={(slotId) => ws.newSession(slotId)}
          onGetForkMessages={(slotId) => {
            setForkSlotId(slotId);
            ws.getForkMessages(slotId);
          }}
          onSetModel={(slotId, provider, modelId) => ws.setModel(slotId, provider, modelId)}
          onSetThinkingLevel={(slotId, level) => ws.setThinkingLevel(slotId, level)}
          onQuestionnaireResponse={handleQuestionnaireResponse}
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
          onListFiles={(_slotId, query) => ws.listFiles(query)}
          onExecuteBash={(slotId, command, excludeFromContext) => {
            ws.executeBash(slotId, command, excludeFromContext);
          }}

          onToggleAllToolsCollapsed={() => setAllToolsCollapsed(prev => !prev)}
          onToggleAllThinkingCollapsed={() => setAllThinkingCollapsed(prev => !prev)}
          onGetScopedModels={(slotId) => ws.getScopedModels(slotId)}
          onSetScopedModels={(slotId, models) => ws.setScopedModels(slotId, models)}
        />
      )}

      {/* Mobile pane tabs */}
      {activeWs && isMobile && panes.panes.length > 0 && !isKeyboardVisible && (
        <MobilePaneTabs
          paneCount={panes.panes.length}
          activeIndex={mobilePaneIndex}
          maxPanes={4}
          onSelectPane={(index) => {
            setMobilePaneIndex(index);
            panes.focusPane(panes.panes[index].id);
          }}
          onAddPane={() => panes.split('vertical')}
          onClosePane={(index) => {
            const paneId = panes.panes[index]?.id;
            if (paneId) {
              panes.closePane(paneId);
            }
          }}
          streamingPanes={panes.panes.map(p => p.slot?.isStreaming || false)}
        />
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
