import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

interface PaneTabItem {
  id: string;
  label: string;
  isActive: boolean;
  isStreaming: boolean;
}

interface PaneTabsBarProps {
  tabs: PaneTabItem[];
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  onReorderTabs: (draggedId: string, targetId: string) => void;
}

export function PaneTabsBar({
  tabs,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
  onReorderTabs,
}: PaneTabsBarProps) {
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const startEditing = (tabId: string) => {
    const tab = tabById.get(tabId);
    if (!tab) return;
    setEditingTabId(tabId);
    setEditingLabel(tab.label);
  };

  const stopEditing = () => {
    setEditingTabId(null);
    setEditingLabel('');
  };

  const commitRename = (tabId: string) => {
    const current = tabById.get(tabId);
    if (!current) {
      stopEditing();
      return;
    }

    const trimmed = editingLabel.trim();
    const nextLabel = trimmed || current.label;
    if (nextLabel !== current.label) {
      onRenameTab(tabId, nextLabel);
    }
    stopEditing();
  };

  const cancelRename = () => {
    stopEditing();
  };

  return (
    <div className="flex h-10 items-center gap-1 overflow-hidden border-b border-pi-border bg-pi-surface px-2 py-1">
      {tabs.map((tab) => {
        const isEditing = tab.id === editingTabId;
        const isDragTarget = dragOverTabId === tab.id && draggingTabId !== tab.id;

        return (
          <div
            key={tab.id}
            draggable={!isEditing}
            onDragStart={(event) => {
              if (isEditing) return;
              setDraggingTabId(tab.id);
              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
              }
            }}
            onDragEnd={() => {
              setDraggingTabId(null);
              setDragOverTabId(null);
            }}
            onDragOver={(event) => {
              if (!draggingTabId || draggingTabId === tab.id) return;
              event.preventDefault();
              setDragOverTabId(tab.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const droppedDragId = event.dataTransfer?.getData('text/plain') || '';
              const draggedId = draggingTabId || droppedDragId;
              if (draggedId && draggedId !== tab.id) {
                onReorderTabs(draggedId, tab.id);
              }
              setDraggingTabId(null);
              setDragOverTabId(null);
            }}
            className={`group relative flex min-w-0 flex-1 max-w-[150px] items-center px-1 py-1 text-[12px] transition-colors ${
              tab.isActive
                ? 'text-pi-text after:absolute after:left-0 after:right-0 after:-bottom-[1px] after:h-[2px] after:bg-pi-accent'
                : 'text-pi-muted hover:text-pi-text'
            } ${isDragTarget ? 'ring-1 ring-pi-accent/60' : ''}`}
          >
            {isEditing ? (
              <input
                autoFocus
                value={editingLabel}
                onChange={(event) => setEditingLabel(event.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename(tab.id);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                className="mr-1 min-h-8 w-[180px] rounded border border-pi-border bg-pi-bg px-2 text-[12px] text-pi-text outline-none focus:border-pi-accent"
                aria-label="Rename tab"
              />
            ) : (
              <button
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => startEditing(tab.id)}
                className="mr-1 flex min-h-8 min-w-0 flex-1 items-center gap-1"
                title={tab.label}
              >
                <span className="truncate max-w-[160px]">{tab.label}</span>
                {tab.isStreaming ? <span className="h-1.5 w-1.5 rounded-full bg-pi-success status-running" /> : null}
              </button>
            )}
            <button
              onClick={() => onCloseTab(tab.id)}
              className="rounded p-1 text-pi-muted transition-colors hover:bg-pi-bg hover:text-pi-text"
              title="Close tab"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      <button
        onClick={onAddTab}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-pi-border text-pi-muted transition-colors hover:text-pi-text"
        title="New tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
