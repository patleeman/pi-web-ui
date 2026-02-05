import type { CSSProperties } from 'react';
import { X, ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react';

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
  onOpenBrowser: () => void;
  onOpenSettings: () => void;
  className?: string;
  style?: CSSProperties;
}

export function WorkspaceSidebar({
  workspaces,
  collapsed,
  onToggleCollapse,
  onSelectWorkspace,
  onCloseWorkspace,
  onSelectConversation,
  onOpenBrowser,
  onOpenSettings,
  className = '',
  style,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-pi-surface border-r border-pi-border transition-[width] duration-200 flex-shrink-0 ${className}`}
      style={style}
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-2 py-2 border-b border-pi-border`}>
        {!collapsed && (
          <span className="text-[11px] uppercase tracking-wide text-pi-muted">Workspaces</span>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <button
            onClick={onOpenBrowser}
            className="p-2 text-pi-muted hover:text-pi-text transition-colors"
            title="Open directory (⌘O)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-2 text-pi-muted hover:text-pi-text transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {workspaces.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-[12px] text-pi-muted">No workspaces</div>
        )}
        {workspaces.map((workspace) => {
          const statusIndicator = workspace.isStreaming
            ? 'bg-pi-success status-running'
            : workspace.needsAttention
              ? 'bg-pi-success'
              : '';
          const initials = workspace.name.slice(0, 2).toUpperCase();

          return (
            <div key={workspace.id} className="px-2 py-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className={`group flex-1 flex items-center gap-2 px-2 py-2 rounded text-left transition-colors ${
                    workspace.isActive
                      ? 'bg-pi-border/40 text-pi-text'
                      : 'text-pi-muted hover:text-pi-text hover:bg-pi-bg'
                  }`}
                  title={workspace.path}
                >
                  {statusIndicator ? (
                    <span className={`w-2 h-2 rounded-full ${statusIndicator}`} />
                  ) : (
                    <span className="w-2 h-2" />
                  )}
                  {collapsed ? (
                    <span className="text-[11px] font-semibold tracking-wide">{initials}</span>
                  ) : (
                    <span className="truncate">{workspace.name}</span>
                  )}
                </button>
                {!collapsed && (
                  <button
                    onClick={() => onCloseWorkspace(workspace.id)}
                    className="p-1 text-pi-muted hover:text-pi-error transition-colors"
                    title="Close workspace"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {!collapsed && workspace.conversations.length > 0 && (
                <div className="ml-5 mt-2 space-y-1">
                  <div className="px-2 text-[10px] uppercase tracking-wide text-pi-muted/70">Conversations</div>
                  {workspace.conversations.map((conversation) => (
                    <button
                      key={conversation.sessionId}
                      onClick={() => onSelectConversation(workspace.id, conversation.sessionId, conversation.sessionPath, conversation.slotId)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors ${
                        conversation.isFocused
                          ? 'bg-pi-border/40 text-pi-text'
                          : 'text-pi-muted hover:text-pi-text hover:bg-pi-bg'
                      }`}
                      title={conversation.label}
                    >
                      <span className="truncate">{conversation.label}</span>
                      {conversation.paneLabel && (
                        <span className="ml-auto text-[10px] text-pi-muted">[{conversation.paneLabel}]</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-pi-border p-2 flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-2 py-2 rounded text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors"
          title="Settings (⌘,)"
        >
          <Settings className="w-4 h-4" />
          {!collapsed && <span className="text-[12px]">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
