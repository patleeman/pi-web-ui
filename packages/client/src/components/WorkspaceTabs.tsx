import { FolderOpen, X } from 'lucide-react';

interface WorkspaceTab {
  id: string;
  name: string;
  path: string;
  isStreaming: boolean;
  messageCount: number;
  needsAttention?: boolean;
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
    <div className="flex items-center border-b border-pi-border bg-pi-surface overflow-x-auto scrollbar-thin">
      {/* Add workspace button */}
      <button
        onClick={onOpenBrowser}
        className="flex-shrink-0 px-2 md:px-3 py-2 text-pi-muted hover:text-pi-accent active:text-pi-accent border-r border-pi-border transition-colors"
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
              className="px-2 md:px-3 py-2 font-mono text-xs md:text-sm flex items-center gap-1 md:gap-2 min-w-0"
              title={tab.path}
            >
              {/* Activity indicator */}
              {tab.isStreaming ? (
                <span className="w-1.5 h-1.5 rounded-full bg-pi-accent animate-pulse flex-shrink-0" />
              ) : tab.needsAttention ? (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title="Task complete" />
              ) : null}
              
              {/* Directory name - shorter on mobile */}
              <span className="truncate max-w-[80px] md:max-w-[150px]">{tab.name}</span>
              
              {/* Message count badge - hide on very small screens */}
              {tab.messageCount > 0 && (
                <span className="text-xs text-pi-muted hidden sm:inline">
                  ({tab.messageCount})
                </span>
              )}
            </button>

            {/* Close button - always visible on touch devices */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="px-1.5 py-2 text-pi-muted hover:text-pi-fg md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              title="Close workspace"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Empty state hint */}
      {tabs.length === 0 && (
        <div className="px-2 md:px-3 py-2 text-pi-muted text-xs md:text-sm font-mono">
          <span className="hidden sm:inline">Click folder icon to open a workspace</span>
          <span className="sm:hidden">Tap folder to open</span>
        </div>
      )}
    </div>
  );
}
