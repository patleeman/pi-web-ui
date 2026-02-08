import { useState, useRef, useCallback, useMemo, type CSSProperties, type MouseEvent } from 'react';
import { MoreHorizontal, MessageSquare, FolderTree, PanelLeftClose, Briefcase } from 'lucide-react';
import type { FileInfo, GitStatusFile, ActiveJobState, JobPhase } from '@pi-deck/shared';
import { SidebarFileTree } from './SidebarFileTree';

interface ConversationSummary {
  sessionId: string;
  sessionPath?: string;
  label: string;
  paneLabel?: string;
  slotId?: string;
  isFocused: boolean;
  isStreaming?: boolean;
}

interface ConversationSidebarProps {
  workspaceName?: string;
  workspacePath?: string;
  conversations: ConversationSummary[];
  onSelectConversation: (sessionId: string, sessionPath?: string, slotId?: string) => void;
  onRenameConversation: (sessionId: string, sessionPath: string | undefined, label: string) => void;
  onDeleteConversation: (sessionId: string, sessionPath: string | undefined, label: string) => void;
  entriesByPath?: Record<string, FileInfo[]>;
  gitStatusFiles?: GitStatusFile[];
  gitBranch?: string | null;
  gitWorktree?: string | null;
  onRequestEntries?: (path: string) => void;
  onRequestGitStatus?: () => void;
  onSelectFile?: (path: string) => void;
  onSelectGitFile?: (path: string) => void;
  selectedFilePath?: string;
  openFilePath?: string;
  // File watching props (for files section)
  onWatchDirectory?: (path: string) => void;
  onUnwatchDirectory?: (path: string) => void;
  activeJobs?: ActiveJobState[];
  onCollapseSidebar?: () => void;
  className?: string;
  style?: CSSProperties;
}

type SidebarTab = 'conversations' | 'explorer';

// Panel ratios for explorer tab: [files, git]
const DEFAULT_EXPLORER_RATIOS = [0.65, 0.35];
const MIN_PANEL_RATIO = 0.1;

export function ConversationSidebar({
  workspaceName,
  workspacePath,
  conversations,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  entriesByPath,
  gitStatusFiles,
  gitBranch,
  gitWorktree,
  onRequestEntries,
  onRequestGitStatus,
  onSelectFile,
  onSelectGitFile,
  selectedFilePath,
  openFilePath,
  activeJobs,
  onWatchDirectory,
  onUnwatchDirectory,
  onCollapseSidebar,
  className = '',
  style,
}: ConversationSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');
  const [ratios, setRatios] = useState(DEFAULT_EXPLORER_RATIOS);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handleIndex: number; startY: number; startRatios: number[] } | null>(null);

  const showFileTree = Boolean(
    entriesByPath && gitStatusFiles && onRequestEntries && onRequestGitStatus && onSelectFile && onSelectGitFile && workspacePath
  );

  // Resize drag handling
  const handleResizeStart = useCallback((handleIndex: number, e: MouseEvent) => {
    e.preventDefault();
    dragRef.current = { handleIndex, startY: e.clientY, startRatios: [...ratios] };

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const containerHeight = containerRef.current.offsetHeight;
      if (containerHeight === 0) return;
      const deltaRatio = (ev.clientY - dragRef.current.startY) / containerHeight;
      const { handleIndex: idx, startRatios } = dragRef.current;
      const newRatios = [...startRatios];
      // Adjust the two panels adjacent to this handle
      newRatios[idx] = Math.max(MIN_PANEL_RATIO, startRatios[idx] + deltaRatio);
      newRatios[idx + 1] = Math.max(MIN_PANEL_RATIO, startRatios[idx + 1] - deltaRatio);
      // Normalize
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

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>, sessionId: string) => {
    event.stopPropagation();
    setOpenMenuId((prev) => (prev === sessionId ? null : sessionId));
  };

  const handleRename = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onRenameConversation(conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onDeleteConversation(conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-pi-border bg-pi-surface ${className}`}
      style={style}
      onClick={() => setOpenMenuId(null)}
    >
      {/* Tab header — matches right sidebar design */}
      <div className="h-10 px-3 border-b border-pi-border flex items-center">
        <button
          onClick={() => setActiveTab('conversations')}
          className={`px-2 h-full text-[12px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
            activeTab === 'conversations'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          Chats
          {conversations.length > 0 && (
            <span className="bg-pi-muted/20 text-pi-muted px-1.5 rounded text-[10px] font-medium">
              {conversations.length}
            </span>
          )}
        </button>
        {showFileTree && (
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-2 h-full text-[12px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              activeTab === 'explorer'
                ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
                : 'text-pi-muted hover:text-pi-text'
            }`}
          >
            <FolderTree className="w-3 h-3" />
            Explorer
          </button>
        )}
        <div className="flex-1" />
        {onCollapseSidebar && (
          <button
            onClick={onCollapseSidebar}
            className="p-1 rounded text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversations tab */}
      {activeTab === 'conversations' && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
          <div className="space-y-0.5">
            {conversations.length === 0 ? (
              <div className="px-1 py-1 text-[12px] text-pi-muted">No conversations yet</div>
            ) : (
              conversations.map((conversation) => (
                <div key={conversation.sessionId} className="group flex items-center gap-1 min-w-0">
                  <button
                    onClick={() => {
                      setOpenMenuId(null);
                      onSelectConversation(conversation.sessionId, conversation.sessionPath, conversation.slotId);
                    }}
                    className={`flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors min-w-0 ${
                      conversation.isFocused
                        ? 'bg-pi-bg text-pi-text'
                        : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                    }`}
                    title={conversation.label}
                  >
                    {conversation.isStreaming && (
                      <span className="w-2 h-2 rounded-full bg-pi-success status-running flex-shrink-0" />
                    )}
                    {conversation.slotId && jobBySlotId.has(conversation.slotId) && (
                      <Briefcase className={`w-3 h-3 flex-shrink-0 ${JOB_PHASE_COLORS[jobBySlotId.get(conversation.slotId)!.phase]}`} />
                    )}
                    <span className="truncate">{conversation.label}</span>
                  </button>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(event) => handleMenuToggle(event, conversation.sessionId)}
                      className="rounded p-1 text-pi-muted opacity-70 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-pi-text"
                      title="Conversation actions"
                      aria-label="Conversation actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {openMenuId === conversation.sessionId && (
                      <div
                        className="absolute right-0 z-10 mt-1 w-32 rounded border border-pi-border bg-pi-surface shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-text hover:bg-pi-bg"
                          onClick={(event) => handleRename(event, conversation)}
                        >
                          Rename
                        </button>
                        <button
                          className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-error hover:bg-pi-bg"
                          onClick={(event) => handleDelete(event, conversation)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Explorer tab: Files + Git */}
      {activeTab === 'explorer' && showFileTree && (
        <div className="flex-1 flex flex-col min-h-0" ref={containerRef}>
          {/* Files panel */}
          <div className="flex flex-col min-h-0" style={{ flex: `${ratios[0]} 1 0%` }}>
            <SidebarFileTree
              section="files"
              workspaceName={workspaceName || 'Workspace'}
              workspacePath={workspacePath!}
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
            className="flex-shrink-0 h-1 cursor-row-resize hover:bg-pi-accent/30 transition-colors flex items-center justify-center"
          >
            <div className="bg-pi-border/50 rounded-full h-0.5 w-8" />
          </div>

          {/* Git panel */}
          <div className="flex flex-col min-h-0" style={{ flex: `${ratios[1]} 1 0%` }}>
            <SidebarFileTree
              section="git"
              workspaceName={workspaceName || 'Workspace'}
              workspacePath={workspacePath!}
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
    </aside>
  );
}
