import { FolderOpen, X } from 'lucide-react';

interface WorkspaceTab {
  id: string;
  name: string;
  path: string;
  isStreaming: boolean;
  messageCount: number;
}

interface WorkspaceTabsProps {
  tabs: WorkspaceTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenBrowser: () => void;
}

export function WorkspaceTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onOpenBrowser,
}: WorkspaceTabsProps) {
  return (
    <div className="flex items-center border-b border-pi-border bg-pi-surface overflow-x-auto">
      {/* Add workspace button */}
      <button
        onClick={onOpenBrowser}
        className="flex-shrink-0 px-3 py-2 text-pi-muted hover:text-pi-accent border-r border-pi-border transition-colors"
        title="Open directory (⌘O)"
      >
        <FolderOpen className="w-4 h-4" />
      </button>

      {/* Workspace tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`flex items-center border-r border-pi-border group ${
              isActive
                ? 'bg-pi-bg text-pi-fg'
                : 'bg-pi-surface text-pi-muted hover:text-pi-fg'
            }`}
          >
            <button
              onClick={() => onSelect(tab.id)}
              className="px-3 py-2 font-mono text-sm flex items-center gap-2 min-w-0"
              title={tab.path}
            >
              {/* Activity indicator */}
              {tab.isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-pi-accent animate-pulse flex-shrink-0" />
              )}
              
              {/* Directory name */}
              <span className="truncate max-w-[150px]">{tab.name}</span>
              
              {/* Message count badge */}
              {tab.messageCount > 0 && (
                <span className="text-xs text-pi-muted">
                  ({tab.messageCount})
                </span>
              )}
            </button>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="px-1.5 py-2 text-pi-muted hover:text-pi-fg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Close workspace"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Empty state hint */}
      {tabs.length === 0 && (
        <div className="px-3 py-2 text-pi-muted text-sm font-mono">
          Click "+ dir" to open a workspace
        </div>
      )}
    </div>
  );
}
