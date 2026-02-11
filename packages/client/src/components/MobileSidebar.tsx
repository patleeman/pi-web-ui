import { useState, useRef, useCallback, useEffect, useMemo, memo, type CSSProperties, type MouseEvent, type KeyboardEvent } from 'react';
import { MoreHorizontal, MessageSquare, FolderTree, X, ChevronDown, FolderOpen, Settings, Briefcase } from 'lucide-react';
import type { FileInfo, GitStatusFile, ActiveJobState, JobPhase } from '@pi-deck/shared';
import { SidebarFileTree } from './SidebarFileTree';

interface PaneSummary {
  slotId: string;
  label: string;
  isStreaming: boolean;
  isFocused: boolean;
}

interface ConversationSummary {
  sessionId: string;
  sessionPath?: string;
  label: string;
  paneLabel?: string;
  slotId?: string;
  isFocused: boolean;
  isStreaming?: boolean;
}

interface WorkspaceSidebarItem {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  isStreaming: boolean;
  needsAttention: boolean;
  panes: PaneSummary[];
  conversations: ConversationSummary[];
}

type SidebarTab = 'conversations' | 'explorer';

// Panel ratios for explorer tab: [files, git]
const DEFAULT_EXPLORER_RATIOS = [0.65, 0.35];
const MIN_PANEL_RATIO = 0.1;

interface MobileSidebarProps {
  workspaces: WorkspaceSidebarItem[];
  activeWorkspaceId: string | null;
  conversations: ConversationSummary[];
  entriesByPath?: Record<string, FileInfo[]>;
  gitStatusFiles?: GitStatusFile[];
  gitBranch?: string | null;
  gitWorktree?: string | null;
  selectedFilePath?: string;
  openFilePath?: string;
  activeJobs?: ActiveJobState[];
  onSelectWorkspace: (id: string) => void;
  onCloseWorkspace: (id: string) => void;
  onSelectConversation: (sessionId: string, sessionPath?: string, slotId?: string, label?: string) => void;
  onRenameConversation: (sessionId: string, sessionPath: string | undefined, newName: string) => void;
  onDeleteConversation: (sessionId: string, sessionPath: string | undefined, label: string) => void;
  onRequestEntries?: (path: string) => void;
  onRequestGitStatus?: () => void;
  onSelectFile?: (path: string) => void;
  onSelectGitFile?: (path: string) => void;
  onWatchDirectory?: (path: string) => void;
  onUnwatchDirectory?: (path: string) => void;
  onOpenBrowser: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export const MobileSidebar = memo(function MobileSidebar({
  workspaces,
  activeWorkspaceId,
  conversations,
  entriesByPath,
  gitStatusFiles,
  gitBranch,
  gitWorktree,
  selectedFilePath,
  openFilePath,
  activeJobs,
  onSelectWorkspace,
  onCloseWorkspace,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onRequestEntries,
  onRequestGitStatus,
  onSelectFile,
  onSelectGitFile,
  onWatchDirectory,
  onUnwatchDirectory,
  onOpenBrowser,
  onOpenSettings,
  onClose,
  className = '',
  style,
}: MobileSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [ratios, setRatios] = useState(DEFAULT_EXPLORER_RATIOS);
  const editInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handleIndex: number; startY: number; startRatios: number[] } | null>(null);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const showFileTree = Boolean(
    entriesByPath && gitStatusFiles && onRequestEntries && onRequestGitStatus && onSelectFile && onSelectGitFile
  );

  // Map slotId → active job for quick lookup
  const jobBySlotId = useMemo(() => {
    if (!activeJobs || activeJobs.length === 0) return new Map<string, ActiveJobState>();
    const map = new Map<string, ActiveJobState>();
    for (const job of activeJobs) {
      if (job.sessionSlotId) map.set(job.sessionSlotId, job);
    }
    return map;
  }, [activeJobs]);

  const JOB_PHASE_COLORS: Record<JobPhase, string> = {
    executing: 'text-pi-success',
    planning: 'text-pi-warning',
    review: 'text-pi-accent',
    ready: 'text-pi-accent',
    backlog: 'text-pi-muted',
    complete: 'text-pi-muted',
  };

  // Focus the inline rename input when it appears
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showWorkspaceDropdown) return;
    const handleClick = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-workspace-dropdown]')) {
        setShowWorkspaceDropdown(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showWorkspaceDropdown]);

  const startEditing = useCallback((conversation: ConversationSummary) => {
    setEditingId(conversation.sessionId);
    setEditingValue(conversation.label);
    setOpenMenuId(null);
  }, []);

  const commitEdit = useCallback((conversation: ConversationSummary) => {
    const trimmed = editingValue.trim();
    setEditingId(null);
    if (trimmed && trimmed !== conversation.label) {
      onRenameConversation(conversation.sessionId, conversation.sessionPath, trimmed);
    }
  }, [editingValue, onRenameConversation]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleEditKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, conversation: ConversationSummary) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(conversation);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>, sessionId: string) => {
    event.stopPropagation();
    setOpenMenuId((prev) => (prev === sessionId ? null : sessionId));
  };

  const handleRename = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    startEditing(conversation);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onDeleteConversation(conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    onSelectWorkspace(workspaceId);
    setShowWorkspaceDropdown(false);
    // Reset to conversations tab when switching workspaces
    // (the new workspace might not have file tree data loaded yet)
    setActiveTab('conversations');
  };

  // Resize drag handling for explorer panels
  const handleResizeStart = useCallback((handleIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { handleIndex, startY: e.clientY, startRatios: [...ratios] };

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const containerHeight = containerRef.current.offsetHeight;
      if (containerHeight === 0) return;
      const deltaRatio = (ev.clientY - dragRef.current.startY) / containerHeight;
      const { handleIndex: idx, startRatios } = dragRef.current;
      const newRatios = [...startRatios];
      newRatios[idx] = Math.max(MIN_PANEL_RATIO, startRatios[idx] + deltaRatio);
      newRatios[idx + 1] = Math.max(MIN_PANEL_RATIO, startRatios[idx + 1] - deltaRatio);
      const total = newRatios.reduce((a, b) => a + b, 0);
      setRatios(newRatios.map(r => r / total));
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [ratios]);

  return (
    <aside
      className={`flex flex-col bg-pi-surface h-full ${className}`}
      style={style}
      onClick={() => setOpenMenuId(null)}
    >
      {/* Header with workspace selector and close button */}
      <div className="h-14 px-4 border-b border-pi-border flex items-center justify-between">
        {workspaces.length === 0 ? (
          <span className="text-[15px] text-pi-muted">No workspaces</span>
        ) : (
          <div className="relative flex-1 min-w-0" data-workspace-dropdown>
            <button
              onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
              className="flex items-center gap-2 text-[15px] font-medium text-pi-text hover:text-pi-accent transition-colors min-w-0"
            >
              <span className="truncate">{activeWorkspace?.name || 'Select workspace'}</span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showWorkspaceDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showWorkspaceDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 max-w-[80vw] rounded border border-pi-border bg-pi-surface shadow-lg z-50">
                {workspaces.map((workspace) => {
                  const statusIndicator = workspace.isStreaming
                    ? 'bg-pi-success status-running'
                    : workspace.needsAttention
                      ? 'bg-pi-success'
                      : '';
                  
                  return (
                    <div key={workspace.id} className="flex items-center group">
                      <button
                        onClick={() => handleSelectWorkspace(workspace.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-3 text-left transition-colors ${
                          workspace.isActive ? 'bg-pi-bg text-pi-text' : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                        }`}
                      >
                        {statusIndicator && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusIndicator}`} />
                        )}
                        <span className="truncate text-[14px]">{workspace.name}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseWorkspace(workspace.id);
                        }}
                        className="px-3 py-3 text-pi-muted hover:text-pi-error transition-colors"
                        title="Close workspace"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        <button
          onClick={onClose}
          className="p-2 text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors ml-2"
          title="Close menu"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Tab header - matches desktop ConversationSidebar design */}
      <div className="h-12 px-4 border-b border-pi-border flex items-center">
        <button
          onClick={() => setActiveTab('conversations')}
          className={`px-3 h-full text-[14px] uppercase tracking-wide transition-colors flex items-center gap-2 ${
            activeTab === 'conversations'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chats
          {conversations.length > 0 && (
            <span className="bg-pi-muted/20 text-pi-muted px-1.5 rounded text-[12px] font-medium">
              {conversations.length}
            </span>
          )}
        </button>
        {showFileTree && (
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-3 h-full text-[14px] uppercase tracking-wide transition-colors flex items-center gap-2 ${
              activeTab === 'explorer'
                ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
                : 'text-pi-muted hover:text-pi-text'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            Explorer
          </button>
        )}
      </div>

      {/* Conversations tab */}
      {activeTab === 'conversations' && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {conversations.length === 0 ? (
              <div className="px-2 py-4 text-[14px] text-pi-muted text-center">No conversations yet</div>
            ) : (
              conversations.map((conversation) => {
                const isEditing = editingId === conversation.sessionId;
                return (
                  <div key={conversation.sessionId} className="group flex items-center gap-2 min-w-0">
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, conversation)}
                        onBlur={() => commitEdit(conversation)}
                        className="flex-1 rounded px-3 py-2 text-[14px] bg-pi-bg text-pi-text border border-pi-accent outline-none min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setOpenMenuId(null);
                          onSelectConversation(conversation.sessionId, conversation.sessionPath, conversation.slotId, conversation.label);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          startEditing(conversation);
                        }}
                        className={`flex flex-1 items-center gap-3 rounded px-3 py-3 text-left text-[14px] transition-colors min-w-0 ${
                          conversation.isFocused
                            ? 'bg-pi-bg text-pi-text'
                            : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                        }`}
                        title={conversation.label}
                      >
                        {conversation.isStreaming && (
                          <span className="w-2.5 h-2.5 rounded-full bg-pi-success status-running flex-shrink-0" />
                        )}
                        {conversation.slotId && jobBySlotId.has(conversation.slotId) && (
                          <Briefcase className={`w-4 h-4 flex-shrink-0 ${JOB_PHASE_COLORS[jobBySlotId.get(conversation.slotId)!.phase]}`} />
                        )}
                        <span className="truncate">{conversation.label}</span>
                      </button>
                    )}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(event) => handleMenuToggle(event, conversation.sessionId)}
                        className="rounded p-2 text-pi-muted opacity-70 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-pi-text"
                        title="Conversation actions"
                        aria-label="Conversation actions"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {openMenuId === conversation.sessionId && (
                        <div
                          className="absolute right-0 z-10 mt-1 w-36 rounded border border-pi-border bg-pi-surface shadow-lg"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            className="flex w-full items-center px-4 py-2.5 text-left text-[14px] text-pi-text hover:bg-pi-bg"
                            onClick={(event) => handleRename(event, conversation)}
                          >
                            Rename
                          </button>
                          <button
                            className="flex w-full items-center px-4 py-2.5 text-left text-[14px] text-pi-error hover:bg-pi-bg"
                            onClick={(event) => handleDelete(event, conversation)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Explorer tab: Files + Git */}
      {activeTab === 'explorer' && showFileTree && activeWorkspace && (
        <div className="flex-1 flex flex-col min-h-0" ref={containerRef}>
          {/* Files panel */}
          <div className="flex flex-col min-h-0" style={{ flex: `${ratios[0]} 1 0%` }}>
            <SidebarFileTree
              section="files"
              workspaceName={activeWorkspace.name}
              workspacePath={activeWorkspace.path}
              entriesByPath={entriesByPath!}
              gitStatusFiles={gitStatusFiles!}
              onRequestEntries={onRequestEntries!}
              onRequestGitStatus={onRequestGitStatus!}
              onSelectFile={onSelectFile!}
              onSelectGitFile={onSelectGitFile!}
              selectedFilePath={selectedFilePath || ''}
              openFilePath={openFilePath}
              onWatchDirectory={onWatchDirectory}
              onUnwatchDirectory={onUnwatchDirectory}
            />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={(e) => handleResizeStart(0, e)}
            className="flex-shrink-0 h-2 cursor-row-resize hover:bg-pi-accent/30 transition-colors flex items-center justify-center"
          >
            <div className="bg-pi-border/50 rounded-full h-1 w-12" />
          </div>

          {/* Git panel */}
          <div className="flex flex-col min-h-0" style={{ flex: `${ratios[1]} 1 0%` }}>
            <SidebarFileTree
              section="git"
              workspaceName={activeWorkspace.name}
              workspacePath={activeWorkspace.path}
              entriesByPath={entriesByPath!}
              gitStatusFiles={gitStatusFiles!}
              gitBranch={gitBranch}
              gitWorktree={gitWorktree}
              onRequestEntries={onRequestEntries!}
              onRequestGitStatus={onRequestGitStatus!}
              onSelectFile={onSelectFile!}
              onSelectGitFile={onSelectGitFile!}
              selectedFilePath={selectedFilePath || ''}
              openFilePath={openFilePath}
            />
          </div>
        </div>
      )}

      {/* Footer with actions */}
      <div className="border-t border-pi-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onOpenBrowser}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-pi-border text-[14px] text-pi-muted hover:text-pi-text hover:border-pi-accent rounded transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open workspace</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-3 text-[14px] text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
});
