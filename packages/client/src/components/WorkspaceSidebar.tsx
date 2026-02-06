import { useState, type CSSProperties, type MouseEvent } from 'react';
import { X, ChevronLeft, ChevronRight, FolderOpen, Settings, MoreHorizontal } from 'lucide-react';

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

interface WorkspaceSidebarProps {
  workspaces: WorkspaceSidebarItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectWorkspace: (id: string) => void;
  onCloseWorkspace: (id: string) => void;
  onSelectConversation: (workspaceId: string, sessionId: string, sessionPath?: string, slotId?: string) => void;
  onRenameConversation: (workspaceId: string, sessionId: string, sessionPath: string | undefined, label: string) => void;
  onDeleteConversation: (workspaceId: string, sessionId: string, sessionPath: string | undefined, label: string) => void;
  onOpenBrowser: () => void;
  onOpenSettings: () => void;
  className?: string;
  style?: CSSProperties;
  /** Show an X close button (for mobile overlay) */
  showClose?: boolean;
  onClose?: () => void;
}

export function WorkspaceSidebar({
  workspaces,
  collapsed,
  onToggleCollapse,
  onSelectWorkspace,
  onCloseWorkspace,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onOpenBrowser,
  onOpenSettings,
  className = '',
  style,
  showClose = false,
  onClose,
}: WorkspaceSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>, menuId: string) => {
    event.stopPropagation();
    setOpenMenuId((prev) => (prev === menuId ? null : menuId));
  };

  const handleRename = (event: MouseEvent<HTMLButtonElement>, workspaceId: string, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onRenameConversation(workspaceId, conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, workspaceId: string, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onDeleteConversation(workspaceId, conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  return (
    <aside
      className={`flex flex-col bg-pi-surface border-r border-pi-border transition-[width] duration-200 flex-shrink-0 ${className}`}
      style={style}
      onClick={() => setOpenMenuId(null)}
    >
      <div className={`h-14 sm:h-10 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 border-b border-pi-border`}>
        {!collapsed && (
          <span className="text-[14px] sm:text-[12px] uppercase tracking-wide text-pi-muted">Workspaces</span>
        )}
        {showClose ? (
          <button
            onClick={onClose}
            className="p-3 text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors"
            title="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors hidden sm:block"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>
      <div className="flex items-center px-3 py-1.5 border-b border-pi-border">
        <button
          onClick={onOpenBrowser}
          className={`flex items-center justify-center gap-1.5 border border-pi-border text-[14px] sm:text-[12px] text-pi-muted hover:text-pi-text hover:border-pi-accent rounded transition-colors ${
            collapsed ? 'p-1.5' : 'px-2.5 py-1.5 sm:py-1 w-full'
          }`}
          title="Open directory (⌘O)"
        >
          <FolderOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          {!collapsed && <span>Open workspace</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {workspaces.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-[14px] sm:text-[12px] text-pi-muted">No workspaces</div>
        )}
        {workspaces.map((workspace, wsIndex) => {
          const statusIndicator = workspace.isStreaming
            ? 'bg-pi-success status-running'
            : workspace.needsAttention
              ? 'bg-pi-success'
              : '';
          const initials = workspace.name.slice(0, 2).toUpperCase();

          return (
            <div key={workspace.id}>
              {/* Divider between workspaces */}
              {wsIndex > 0 && !collapsed && (
                <div className="border-t border-pi-border" />
              )}
              <div className="py-1">
                <div className="group flex w-full items-center">
                  <button
                    onClick={() => onSelectWorkspace(workspace.id)}
                    className="group flex w-full flex-1 items-center gap-2 px-2 py-2 sm:py-1 text-left transition-colors"
                    title={workspace.path}
                  >
                    {statusIndicator ? (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusIndicator}`} />
                    ) : null}
                    {collapsed ? (
                      <span className="text-[11px] font-semibold tracking-wide">{initials}</span>
                    ) : (
                      <span className="truncate font-medium text-[15px] sm:text-[13px] text-pi-text">{workspace.name}</span>
                    )}
                  </button>
                  {!collapsed && (
                    <button
                      onClick={() => onCloseWorkspace(workspace.id)}
                      className="p-3 sm:p-1 mr-1 text-pi-muted hover:text-pi-error transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Close workspace"
                    >
                      <X className="w-6 h-6 sm:w-3.5 sm:h-3.5" />
                    </button>
                  )}
                </div>
                {!collapsed && workspace.conversations.length > 0 && (
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {workspace.conversations.map((conversation) => {
                      const menuId = `${workspace.id}:${conversation.sessionId}`;
                      return (
                        <div key={conversation.sessionId} className="group flex items-center gap-1">
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onSelectConversation(workspace.id, conversation.sessionId, conversation.sessionPath, conversation.slotId);
                            }}
                            className={`flex flex-1 items-center gap-2 px-2 py-2 sm:py-1 text-[14px] sm:text-[12px] text-left transition-colors ${
                              conversation.isFocused && workspace.isActive
                                ? 'border-l-2 border-pi-accent text-pi-text'
                                : 'border-l-2 border-transparent text-pi-muted hover:text-pi-text'
                            }`}
                            title={conversation.label}
                          >
                            {conversation.isStreaming && (
                              <span className="w-2 h-2 rounded-full bg-pi-success status-running flex-shrink-0" />
                            )}
                            <span className="truncate">{conversation.label}</span>
                          </button>
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(event) => handleMenuToggle(event, menuId)}
                              className="rounded p-1 text-pi-muted opacity-70 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-pi-text"
                              title="Conversation actions"
                              aria-label="Conversation actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                            {openMenuId === menuId && (
                              <div
                                className="absolute right-0 z-10 mt-1 w-32 rounded border border-pi-border bg-pi-surface shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-text hover:bg-pi-bg"
                                  onClick={(event) => handleRename(event, workspace.id, conversation)}
                                >
                                  Rename
                                </button>
                                <button
                                  className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-error hover:bg-pi-bg"
                                  onClick={(event) => handleDelete(event, workspace.id, conversation)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center border-t border-pi-border px-3 py-4">
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-1.5 rounded text-[14px] sm:text-[12px] text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors ${
            collapsed ? 'p-1.5 justify-center w-full' : ''
          }`}
          title="Settings (⌘,)"
        >
          <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
