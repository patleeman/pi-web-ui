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
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { PaneManager } from './components/PaneManager';
import { StatusBar } from './components/StatusBar';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { Settings } from './components/Settings';
import { ForkDialog } from './components/ForkDialog';
import { HotkeysDialog } from './components/HotkeysDialog';
import { useSettings } from './contexts/SettingsContext';

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
  const { openSettings } = useSettings();
  
  const [showBrowser, setShowBrowser] = useState(false);
  const [deployStatus, setDeployStatus] = useState<'idle' | 'building' | 'restarting' | 'error'>('idle');
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set());
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkMessages, setForkMessages] = useState<ForkMessage[]>([]);
  const [forkSlotId, setForkSlotId] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  
  const prevStreamingRef = useRef<Record<string, boolean>>({});

  // Pane management - connected to workspace session slots
  const panes = usePanes({
    workspace: ws.activeWorkspace,
    onCreateSlot: ws.createSessionSlot,
    onCloseSlot: ws.closeSessionSlot,
  });

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

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    
    // Escape closes modals
    if (e.key === 'Escape') {
      if (showHotkeys) {
        setShowHotkeys(false);
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
  }, [showBrowser, forkDialogOpen, showHotkeys, openSettings, isMobile, panes, ws]);

  // Handle deploy
  const handleDeploy = useCallback(() => {
    setDeployStatus('building');
    setDeployMessage('Starting rebuild...');
    ws.deploy();
  }, [ws]);

  // Handle questionnaire response
  const handleQuestionnaireResponse = useCallback((slotId: string, toolCallId: string, response: string) => {
    ws.sendQuestionnaireResponse(slotId, toolCallId, response);
  }, [ws]);

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

  // Count running/error states for status bar
  const runningCount = activeWs
    ? Object.values(activeWs.slots).filter(s => s.isStreaming).length
    : 0;
  
  // Get context percent from focused slot
  const focusedSlot = panes.focusedSlotId ? activeWs?.slots[panes.focusedSlotId] : null;
  const contextPercent = focusedSlot?.state?.contextWindowPercent;
  const gitBranch = focusedSlot?.state?.git.branch || null;
  const gitChangedFiles = focusedSlot?.state?.git.changedFiles || 0;

  // Get backend commands from focused slot
  const backendCommands = focusedSlot?.commands || [];

  return (
    <div
      className="h-full bg-pi-bg flex flex-col font-mono"
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
        deployStatus={deployStatus}
        deployMessage={deployMessage}
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

      {/* Connection status banner */}
      <ConnectionStatus isConnected={ws.isConnected} error={ws.error} />

      {/* Header: Workspace tabs + settings */}
      <div className="flex items-center border-b border-pi-border">
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
          className="p-2 text-pi-muted hover:text-pi-text transition-colors"
          title="Settings (⌘,)"
        >
          <SettingsIcon className="w-4 h-4" />
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
          layout={isMobile ? { type: 'pane', id: panes.panes[0]?.id || 'default', slotId: panes.panes[0]?.sessionSlotId || 'default' } : panes.layout}
          workspace={activeWs}
          focusedPaneId={panes.focusedPaneId}
          sessions={activeWs.sessions}
          models={activeWs.models}
          backendCommands={backendCommands}
          onFocusPane={panes.focusPane}
          onSplit={isMobile ? () => {} : panes.split}
          onClosePane={panes.closePane}
          onResizeNode={panes.resizeNode}
          onSendPrompt={(slotId, message, images) => ws.sendPrompt(slotId, message, images)}
          onSteer={(slotId, message) => ws.steer(slotId, message)}
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
        />
      )}

      {/* Status bar */}
      {activeWs && (
        <StatusBar
          cwd={isMobile ? activeWs.name : activeWs.path}
          gitBranch={gitBranch}
          gitChangedFiles={gitChangedFiles}
          runningCount={runningCount}
          errorCount={0}
          contextPercent={contextPercent}
        />
      )}
    </div>
  );
}

export default App;
