import { useEffect, useCallback } from 'react';
import type {
  CustomUIState,
  CustomUINode,
  CustomUIContainerNode,
  CustomUITextNode,
  CustomUISelectListNode,
  CustomUIBorderNode,
  CustomUILoaderNode,
  CustomUIInputEvent,
} from '@pi-web-ui/shared';

interface CustomUIDialogProps {
  state: CustomUIState;
  onInput: (input: CustomUIInputEvent) => void;
  onClose: () => void;
}

/**
 * Dialog for rendering custom UI component trees from ctx.ui.custom().
 * Renders the serialized component tree with React equivalents.
 */
export function CustomUIDialog({ state, onInput, onClose }: CustomUIDialogProps) {
  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Send all key events to the server for handling
      // The server-side component will decide what to do with them
      
      // Don't prevent default for all keys, just the navigation ones
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
        e.preventDefault();
      }
      
      onInput({
        sessionId: state.sessionId,
        inputType: 'key',
        key: e.key,
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.sessionId, onInput]);

  // Handle item click in select lists
  const handleItemClick = useCallback((nodeId: string, value: string) => {
    onInput({
      sessionId: state.sessionId,
      inputType: 'select',
      nodeId,
      value,
    });
  }, [state.sessionId, onInput]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-pi-bg border border-pi-border rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Title */}
        {state.title && (
          <div className="px-4 py-3 border-b border-pi-border">
            <h2 className="text-pi-text font-medium">{state.title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto">
          <RenderNode node={state.root} onItemClick={handleItemClick} />
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-pi-border text-xs text-pi-muted">
          ↑↓/jk navigate • Enter select • Esc cancel
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Node Renderers
// ============================================================================

interface RenderNodeProps {
  node: CustomUINode;
  onItemClick: (nodeId: string, value: string) => void;
}

function RenderNode({ node, onItemClick }: RenderNodeProps) {
  switch (node.type) {
    case 'container':
      return <RenderContainer node={node} onItemClick={onItemClick} />;
    case 'text':
      return <RenderText node={node} />;
    case 'selectList':
      return <RenderSelectList node={node} onItemClick={onItemClick} />;
    case 'border':
      return <RenderBorder node={node} />;
    case 'loader':
      return <RenderLoader node={node} />;
    default:
      // Unknown node type - render nothing
      return null;
  }
}

// ============================================================================
// Container
// ============================================================================

function RenderContainer({ node, onItemClick }: { node: CustomUIContainerNode; onItemClick: (nodeId: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {node.children.map((child) => (
        <RenderNode key={child.id} node={child} onItemClick={onItemClick} />
      ))}
    </div>
  );
}

// ============================================================================
// Text
// ============================================================================

function RenderText({ node }: { node: CustomUITextNode }) {
  const styleClasses = getTextStyleClasses(node.style);
  const boldClass = node.bold ? 'font-bold' : '';

  return (
    <span className={`${styleClasses} ${boldClass}`}>
      {node.content}
    </span>
  );
}

function getTextStyleClasses(style?: CustomUITextNode['style']): string {
  switch (style) {
    case 'accent':
      return 'text-pi-accent';
    case 'muted':
      return 'text-pi-muted';
    case 'dim':
      return 'text-pi-muted/50';
    case 'warning':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-pi-text';
  }
}

// ============================================================================
// SelectList
// ============================================================================

function RenderSelectList({ node, onItemClick }: { node: CustomUISelectListNode; onItemClick: (nodeId: string, value: string) => void }) {
  // Get the items to display (filtered if applicable)
  const displayItems = node.filteredIndices
    ? node.filteredIndices.map((i) => ({ ...node.items[i], originalIndex: i }))
    : node.items.map((item, i) => ({ ...item, originalIndex: i }));

  return (
    <div className="py-1">
      {/* Search filter display */}
      {node.searchable && node.filter && (
        <div className="px-3 py-1 text-sm text-pi-muted border-b border-pi-border mb-2">
          Filter: <span className="text-pi-text">{node.filter}</span>
        </div>
      )}

      {/* Items */}
      {displayItems.length === 0 ? (
        <div className="px-3 py-2 text-pi-muted text-sm">No matches</div>
      ) : (
        displayItems.map((item, displayIndex) => {
          const isSelected = displayIndex === node.selectedIndex;
          
          return (
            <button
              key={item.value}
              onClick={() => onItemClick(node.id, item.value)}
              className={`w-full px-3 py-2 text-left flex items-start gap-3 transition-colors ${
                isSelected
                  ? 'bg-pi-accent/20 text-pi-text'
                  : 'text-pi-muted hover:bg-pi-surface hover:text-pi-text'
              }`}
            >
              <span className="text-pi-accent w-5 text-sm flex-shrink-0">
                {displayIndex + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.label}</div>
                {item.description && (
                  <div className="text-xs text-pi-muted mt-0.5 truncate">
                    {item.description}
                  </div>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// Border
// ============================================================================

function RenderBorder({ node }: { node: CustomUIBorderNode }) {
  const styleClass = node.style === 'accent' ? 'border-pi-accent' : 'border-pi-border';
  
  return (
    <hr className={`${styleClass} border-t`} />
  );
}

// ============================================================================
// Loader
// ============================================================================

function RenderLoader({ node }: { node: CustomUILoaderNode }) {
  return (
    <div className={`flex items-center gap-3 ${node.bordered ? 'p-4 border border-pi-border rounded' : ''}`}>
      {/* Spinner */}
      <div className="animate-spin h-4 w-4 border-2 border-pi-accent border-t-transparent rounded-full" />
      
      {/* Message */}
      <span className="text-pi-text">{node.message}</span>
    </div>
  );
}
