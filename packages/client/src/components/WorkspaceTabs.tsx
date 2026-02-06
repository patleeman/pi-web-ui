import { X } from 'lucide-react';

interface WorkspaceTab {
  id: string;
  name: string;
  path: string;
  isStreaming: boolean;
  messageCount: number;
  needsAttention?: boolean;
  branch?: string;
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
    <div className="flex items-center h-12 sm:h-10 px-2 sm:px-[14px] border-b border-pi-border overflow-x-auto">
      {/* Workspace tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex items-center border-b-2 -mb-[1px] min-w-0 flex-shrink-0 ${
              isActive
                ? 'border-pi-border-focus text-pi-text'
                : 'border-transparent text-pi-muted hover:text-pi-text active:text-pi-text'
            }`}
            title={tab.path}
          >
            <span className="px-3 sm:pl-[14px] sm:pr-1 py-3 sm:py-2 font-mono text-[15px] sm:text-[14px] flex items-center gap-2">
              {tab.name}
              
              {/* Activity indicator */}
              {tab.isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-pi-success status-running" />
              )}
              {tab.needsAttention && !tab.isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-pi-success" title="Task complete" />
              )}
            </span>
            
            {/* Close button - right next to tab name */}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="p-2 sm:p-1 mr-1 text-pi-muted hover:text-pi-text active:text-pi-text transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Close workspace"
            >
              <X className="w-5 h-5 sm:w-3 sm:h-3" />
            </span>
          </button>
        );
      })}

      {/* Add workspace button */}
      <button
        onClick={onOpenBrowser}
        className="px-4 py-3 sm:px-2 sm:py-2 text-pi-muted hover:text-pi-text transition-colors text-[20px] sm:text-[14px] ml-1 flex-shrink-0"
        title="Open directory (⌘O)"
      >
        +
      </button>
    </div>
  );
}
