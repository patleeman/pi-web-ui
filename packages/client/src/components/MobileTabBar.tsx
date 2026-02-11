import { useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';

interface MobileTabItem {
  id: string;
  label: string;
  isActive: boolean;
  isStreaming: boolean;
}

interface MobileTabBarProps {
  tabs: MobileTabItem[];
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
}

export function MobileTabBar({
  tabs,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
}: MobileTabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);

  const startEditing = (tabId: string) => {
    const tab = tabById.get(tabId);
    if (!tab) return;
    setEditingTabId(tabId);
    setEditingLabel(tab.label);
  };

  const commitRename = (tabId: string) => {
    const trimmed = editingLabel.trim();
    if (trimmed) {
      onRenameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  };

  if (tabs.length === 0) {
    return (
      <div className="flex h-12 items-center justify-center border-b border-pi-border bg-pi-surface px-2">
        <button
          onClick={onAddTab}
          className="flex items-center gap-2 px-4 py-2 text-[14px] text-pi-muted hover:text-pi-text transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New conversation</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-12 items-center gap-1 overflow-x-auto border-b border-pi-border bg-pi-surface px-2 py-1">
      {tabs.map((tab) => {
        const isEditing = tab.id === editingTabId;

        return (
          <div
            key={tab.id}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors min-w-0 ${
              tab.isActive
                ? 'bg-pi-accent text-pi-bg'
                : 'bg-pi-bg text-pi-muted hover:text-pi-text'
            }`}
          >
            {isEditing ? (
              <input
                type="text"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(tab.id);
                  if (e.key === 'Escape') setEditingTabId(null);
                }}
                className="w-24 bg-transparent outline-none text-pi-text"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => startEditing(tab.id)}
                className="flex items-center gap-2 min-w-0"
              >
                {tab.isStreaming && (
                  <span className={`w-2 h-2 rounded-full ${tab.isActive ? 'bg-pi-bg' : 'bg-pi-success'} animate-pulse`} />
                )}
                <span className="truncate max-w-[120px]">{tab.label}</span>
              </button>
            )}
            {!isEditing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`p-0.5 rounded transition-colors ${
                  tab.isActive ? 'hover:bg-pi-bg/20' : 'hover:bg-pi-border'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      
      <button
        onClick={onAddTab}
        className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
}
