import { useEffect, useRef } from 'react';
import { GitBranch, MessageSquare, Zap, FileText } from 'lucide-react';
import type { SessionTreeNode } from '@pi-web-ui/shared';

interface FlatTreeItem {
  id: string;
  text: string;
  type: SessionTreeNode['type'];
  role?: string;
  label?: string;
  isCurrent: boolean;
}

/** Check if text looks like actual content (not just a tool/result placeholder) */
function hasRealText(text: string): boolean {
  if (!text) return false;
  // Bracket-only entries like [bash], [read], [tool result] are tool placeholders
  if (/^\[.+\]$/.test(text.trim())) return false;
  return true;
}

/** Flatten a tree into a linear list (depth-first) keeping meaningful entries.
 *  Matches pi TUI behavior: skips tool-only assistant messages and toolResult entries. */
function flattenTree(nodes: SessionTreeNode[], currentLeafId: string | null): FlatTreeItem[] {
  const items: FlatTreeItem[] = [];

  function walk(node: SessionTreeNode) {
    const isCurrent = node.id === currentLeafId;

    // Skip toolResult messages (they're just wrappers around tool output)
    if (node.role === 'toolResult') {
      for (const child of node.children) walk(child);
      return;
    }

    // Skip assistant messages that have no real text (tool-call-only messages)
    // unless they're the current leaf (so user can see their position)
    if (node.role === 'assistant' && !hasRealText(node.text) && !isCurrent && !node.label) {
      for (const child of node.children) walk(child);
      return;
    }

    // Include user messages, assistant messages with text, labeled nodes, and special types
    const include = node.role === 'user' ||
      node.role === 'assistant' ||
      node.type === 'compaction' ||
      !!node.label;

    if (include) {
      // Build fallback text if still empty
      let displayText = node.text;
      if (!displayText) {
        if (node.role === 'user') displayText = '[user message]';
        else if (node.role === 'assistant') displayText = '[assistant]';
        else displayText = `[${node.type}]`;
      }
      items.push({
        id: node.id,
        text: displayText,
        type: node.type,
        role: node.role,
        label: node.label,
        isCurrent,
      });
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of nodes) {
    walk(root);
  }

  return items;
}

interface TreeMenuProps {
  tree: SessionTreeNode[];
  currentLeafId: string | null;
  selectedIndex: number;
  onSelect: (id: string) => void;
}

export function TreeMenu({ tree, currentLeafId, selectedIndex, onSelect }: TreeMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const items = flattenTree(tree, currentLeafId);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  const getIcon = (item: FlatTreeItem) => {
    if (item.role === 'user') return <MessageSquare className="w-3 h-3 text-pi-accent flex-shrink-0" />;
    if (item.role === 'assistant') return <Zap className="w-3 h-3 text-pi-success flex-shrink-0" />;
    if (item.type === 'compaction') return <FileText className="w-3 h-3 text-pi-warning flex-shrink-0" />;
    return <div className="w-3 h-3 flex-shrink-0" />;
  };

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[200px] overflow-y-auto z-50"
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-pi-border flex items-center gap-2 text-pi-muted text-[11px] sticky top-0 bg-pi-bg">
        <GitBranch className="w-3 h-3" />
        <span>Session Tree</span>
        <span className="ml-auto">↑↓ navigate • Enter select • Esc cancel</span>
      </div>

      {items.length === 0 ? (
        <div className="px-3 py-2 text-pi-muted text-[13px]">
          No session history
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={item.id}
            ref={index === selectedIndex ? selectedRef : null}
            onClick={() => onSelect(item.id)}
            className={`px-3 py-1.5 cursor-pointer text-[13px] transition-colors ${
              index === selectedIndex
                ? 'bg-pi-surface text-pi-text'
                : item.isCurrent
                  ? 'text-pi-accent hover:bg-pi-surface/50'
                  : 'text-pi-muted hover:bg-pi-surface/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {getIcon(item)}
              <span className="truncate flex-1">{item.text}</span>
              {item.label && (
                <span className="text-[10px] text-pi-warning bg-pi-warning/10 px-1 rounded flex-shrink-0">{item.label}</span>
              )}
              {item.isCurrent && (
                <span className="text-[10px] text-pi-accent flex-shrink-0">●</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Re-export for use by Pane to get flattened item count
export { flattenTree };
export type { FlatTreeItem };
