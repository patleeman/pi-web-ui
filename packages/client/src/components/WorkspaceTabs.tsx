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
    <div className="flex items-center h-10 px-[14px] border-b border-pi-border">
      {/* Workspace tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`px-[14px] py-2 font-mono text-[14px] flex items-center gap-2 border-b-2 -mb-[1px] ${
              isActive
                ? 'border-pi-border-focus text-pi-text'
                : 'border-transparent text-pi-muted hover:text-pi-text'
            }`}
            title={tab.path}
          >
            {tab.name}
            
            {/* Activity indicator */}
            {tab.isStreaming && (
              <span className="w-1.5 h-1.5 rounded-full bg-pi-success status-running" />
            )}
            {tab.needsAttention && !tab.isStreaming && (
              <span className="w-1.5 h-1.5 rounded-full bg-pi-success" title="Task complete" />
            )}
          </button>
        );
      })}

      {/* Add workspace button */}
      <button
        onClick={onOpenBrowser}
        className="px-2 py-2 text-pi-muted hover:text-pi-text transition-colors text-[14px] ml-1"
        title="Open directory (⌘O)"
      >
        +
      </button>

      {/* Close buttons - separate area */}
      <div className="ml-auto flex items-center">
        {tabs.map((tab) => (
          <button
            key={`close-${tab.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            className={`p-1 text-pi-muted hover:text-pi-text transition-colors ${
              tab.id === activeId ? 'opacity-100' : 'opacity-0 hover:opacity-100'
            }`}
            title="Close workspace"
          >
            <X className="w-3 h-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
