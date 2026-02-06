import { useState, useCallback, useRef, useEffect } from 'react';
import type { SessionInfo, ImageAttachment, ModelInfo, ThinkingLevel, SlashCommand as BackendSlashCommand, ExtensionUIResponse, CustomUIInputEvent } from '@pi-web-ui/shared';
import type { WorkspaceState } from '../hooks/useWorkspaces';
import { Pane } from './Pane';

// Layout tree types (must match usePanes)
interface PaneNode {
  type: 'pane';
  id: string;
  slotId: string;
}

interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];
}

type LayoutNode = PaneNode | SplitNode;

interface PaneManagerProps {
  layout: LayoutNode;
  workspace: WorkspaceState | null;
  focusedPaneId: string | null;
  sessions: SessionInfo[];
  models: ModelInfo[];
  backendCommands: BackendSlashCommand[];
  onFocusPane: (paneId: string) => void;
  onSplit: (direction: 'vertical' | 'horizontal') => void;
  onClosePane: (paneId: string) => void;
  onResizeNode: (path: number[], sizes: number[]) => void;
  onSendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  onSteer: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  onAbort: (slotId: string) => void;
  onLoadSession: (slotId: string, sessionId: string) => void;
  onNewSession: (slotId: string) => void;
  onGetForkMessages: (slotId: string) => void;
  onFork: (slotId: string, entryId: string) => void;
  onSetModel: (slotId: string, provider: string, modelId: string) => void;
  onSetThinkingLevel: (slotId: string, level: ThinkingLevel) => void;
  onQuestionnaireResponse: (slotId: string, toolCallId: string, response: string) => void;
  onExtensionUIResponse: (slotId: string, response: ExtensionUIResponse) => void;
  onCustomUIInput: (slotId: string, input: CustomUIInputEvent) => void;
  onCompact: (slotId: string) => void;
  onOpenSettings: () => void;
  onExport: (slotId: string) => void;
  onRenameSession: (slotId: string, name: string) => void;
  onShowHotkeys: () => void;
  onFollowUp: (slotId: string, message: string) => void;
  onReload: () => void;
  // New features
  onGetSessionTree: (slotId: string) => void;
  onNavigateTree: (slotId: string, targetId: string) => void;
  onCopyLastAssistant: (slotId: string) => void;
  onGetQueuedMessages: (slotId: string) => void;
  onClearQueue: (slotId: string) => void;
  onListFiles: (slotId: string, query?: string, requestId?: string) => void;
  onExecuteBash: (slotId: string, command: string, excludeFromContext?: boolean) => void;
  onToggleAllToolsCollapsed: () => void;
  onToggleAllThinkingCollapsed: () => void;
  onGetScopedModels: (slotId: string) => void;
  onSetScopedModels: (slotId: string, models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) => void;
  // Plans
  activePlan?: import('@pi-web-ui/shared').ActivePlanState | null;
  onUpdatePlanTask?: (planPath: string, line: number, done: boolean) => void;
  onDeactivatePlan?: () => void;
}

// Count total panes in layout
function countPanes(node: LayoutNode): number {
  if (node.type === 'pane') return 1;
  return node.children.reduce((sum, child) => sum + countPanes(child), 0);
}

export function PaneManager({
  layout,
  workspace,
  focusedPaneId,
  sessions,
  models,
  backendCommands,
  onFocusPane,
  onSplit,
  onClosePane,
  onResizeNode,
  onSendPrompt,
  onSteer,
  onAbort,
  onLoadSession,
  onNewSession,
  onGetForkMessages,
  onFork,
  onSetModel,
  onSetThinkingLevel,
  onQuestionnaireResponse,
  onExtensionUIResponse,
  onCustomUIInput,
  onCompact,
  onOpenSettings,
  onExport,
  onRenameSession,
  onShowHotkeys,
  onFollowUp,
  onReload,
  // New features
  onGetSessionTree,
  onNavigateTree,
  onCopyLastAssistant,
  onGetQueuedMessages,
  onClearQueue,
  onListFiles,
  onExecuteBash,
  onToggleAllToolsCollapsed,
  onToggleAllThinkingCollapsed,
  onGetScopedModels,
  onSetScopedModels,
  activePlan,
  onUpdatePlanTask,
  onDeactivatePlan,
}: PaneManagerProps) {
  const totalPanes = countPanes(layout);

  // Render a single pane
  const renderPane = (node: PaneNode) => {
    const slot = workspace?.slots[node.slotId] || null;
    const paneData = {
      id: node.id,
      sessionSlotId: node.slotId,
      size: 1,
      slot,
    };

    return (
      <Pane
        key={node.id}
        pane={paneData}
        isFocused={focusedPaneId === node.id}
        sessions={sessions}
        models={models}
        backendCommands={backendCommands}
        startupInfo={workspace?.startupInfo || null}
        canClose={totalPanes > 0}
        onFocus={() => onFocusPane(node.id)}
        onClose={() => onClosePane(node.id)}
        onSendPrompt={(msg, images) => onSendPrompt(node.slotId, msg, images)}
        onSteer={(msg, images) => onSteer(node.slotId, msg, images)}
        onAbort={() => onAbort(node.slotId)}
        onLoadSession={(sessionId) => onLoadSession(node.slotId, sessionId)}
        onNewSession={() => onNewSession(node.slotId)}
        onSplit={onSplit}
        onGetForkMessages={() => onGetForkMessages(node.slotId)}
        onFork={(entryId) => onFork(node.slotId, entryId)}
        onSetModel={(provider, modelId) => onSetModel(node.slotId, provider, modelId)}
        onSetThinkingLevel={(level) => onSetThinkingLevel(node.slotId, level)}
        onQuestionnaireResponse={(toolCallId, response) => onQuestionnaireResponse(node.slotId, toolCallId, response)}
        onExtensionUIResponse={(response) => onExtensionUIResponse(node.slotId, response)}
        onCustomUIInput={(input) => onCustomUIInput(node.slotId, input)}
        onCompact={() => onCompact(node.slotId)}
        onOpenSettings={onOpenSettings}
        onExport={() => onExport(node.slotId)}
        onRenameSession={(name) => onRenameSession(node.slotId, name)}
        onShowHotkeys={onShowHotkeys}
        onFollowUp={(msg) => onFollowUp(node.slotId, msg)}
        onReload={onReload}
        // New features
        onGetSessionTree={() => onGetSessionTree(node.slotId)}
        onNavigateTree={(targetId) => onNavigateTree(node.slotId, targetId)}
        onCopyLastAssistant={() => onCopyLastAssistant(node.slotId)}
        onGetQueuedMessages={() => onGetQueuedMessages(node.slotId)}
        onClearQueue={() => onClearQueue(node.slotId)}
        onListFiles={(query, requestId) => onListFiles(node.slotId, query, requestId)}
        onExecuteBash={(cmd, exclude) => onExecuteBash(node.slotId, cmd, exclude)}
        onToggleAllToolsCollapsed={onToggleAllToolsCollapsed}
        onToggleAllThinkingCollapsed={onToggleAllThinkingCollapsed}
        onGetScopedModels={() => onGetScopedModels(node.slotId)}
        onSetScopedModels={(models) => onSetScopedModels(node.slotId, models)}
        activePlan={activePlan ?? null}
        onUpdatePlanTask={onUpdatePlanTask ?? (() => {})}
        onDeactivatePlan={onDeactivatePlan ?? (() => {})}
      />
    );
  };

  // Render any node recursively
  const renderNode = (node: LayoutNode, path: number[] = []): React.ReactNode => {
    if (node.type === 'pane') {
      return renderPane(node);
    }
    
    // It's a split node
    return (
      <SplitContainer
        key={`split-${path.join('-')}`}
        direction={node.direction}
        sizes={node.sizes}
        onResize={(sizes) => onResizeNode(path, sizes)}
      >
        {node.children.map((child, i) => renderNode(child, [...path, i]))}
      </SplitContainer>
    );
  };

  return (
    <div className="flex-1 flex px-2 -mt-px overflow-hidden">
      {renderNode(layout)}
    </div>
  );
}

// Split container component with resize handles
interface SplitContainerProps {
  direction: 'horizontal' | 'vertical';
  sizes: number[];
  onResize: (sizes: number[]) => void;
  children: React.ReactNode[];
}

function SplitContainer({ direction, sizes, onResize, children }: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{ index: number; startPos: number; startSizes: number[] } | null>(null);

  // horizontal direction = children side by side (flex-row)
  // vertical direction = children stacked (flex-col)
  const isRow = direction === 'horizontal';

  const handleMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = isRow ? e.clientX : e.clientY;
    setResizing({ index, startPos, startSizes: [...sizes] });
  }, [sizes, isRow]);

  useEffect(() => {
    if (!resizing || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) return;

      const totalSize = isRow ? container.width : container.height;
      const currentPos = isRow ? e.clientX - container.left : e.clientY - container.top;
      
      // Calculate where the divider should be based on cumulative sizes
      let cumulativeRatio = 0;
      for (let i = 0; i <= resizing.index; i++) {
        cumulativeRatio += resizing.startSizes[i];
      }
      
      const targetRatio = currentPos / totalSize;
      const deltaRatio = targetRatio - cumulativeRatio;

      const newSizes = [...resizing.startSizes];
      const minSize = 0.1;
      
      let leftSize = resizing.startSizes[resizing.index] + deltaRatio;
      let rightSize = resizing.startSizes[resizing.index + 1] - deltaRatio;
      
      // Enforce minimum sizes
      if (leftSize < minSize) {
        rightSize += leftSize - minSize;
        leftSize = minSize;
      }
      if (rightSize < minSize) {
        leftSize += rightSize - minSize;
        rightSize = minSize;
      }
      
      newSizes[resizing.index] = leftSize;
      newSizes[resizing.index + 1] = rightSize;
      
      // Normalize to ensure they sum to 1
      const total = newSizes.reduce((a, b) => a + b, 0);
      const normalized = newSizes.map(s => s / total);
      
      onResize(normalized);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, isRow, onResize]);

  // Build array of elements (children interleaved with resize handles)
  const elements: React.ReactNode[] = [];
  
  children.forEach((child, i) => {
    // Add child container
    elements.push(
      <div
        key={`child-${i}`}
        style={{ flex: `${sizes[i]} 1 0%` }}
        className={`overflow-hidden flex ${isRow ? 'min-w-0' : 'min-h-0'}`}
      >
        {child}
      </div>
    );
    
    // Add resize handle between children
    if (i < children.length - 1) {
      elements.push(
        <div
          key={`handle-${i}`}
          onMouseDown={handleMouseDown(i)}
          className={`flex-shrink-0 flex items-center justify-center ${
            isRow
              ? 'w-1 cursor-col-resize hover:bg-pi-border'
              : 'h-1 cursor-row-resize hover:bg-pi-border'
          }`}
        >
          <div
            className={`bg-pi-border/50 rounded-full ${
              isRow ? 'w-0.5 h-6' : 'h-0.5 w-6'
            }`}
          />
        </div>
      );
    }
  });

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex ${isRow ? 'flex-row' : 'flex-col'} overflow-hidden`}
    >
      {elements}
    </div>
  );
}
