import { useState, useCallback, useRef, useEffect } from 'react';
import type { SessionInfo, ImageAttachment, ModelInfo, ThinkingLevel, SlashCommand as BackendSlashCommand, ExtensionUIResponse, CustomUIInputEvent } from '@pi-deck/shared';
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
  // Plans
  activePlan?: import('@pi-deck/shared').ActivePlanState | null;
  onUpdatePlanTask?: (planPath: string, line: number, done: boolean) => void;
  onDeactivatePlan?: () => void;
  // Jobs
  activeJobs?: import('@pi-deck/shared').ActiveJobState[];
  onUpdateJobTask?: (jobPath: string, line: number, done: boolean) => void;
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
  activePlan,
  onUpdatePlanTask,
  onDeactivatePlan,
  activeJobs,
  onUpdateJobTask,
}: PaneManagerProps) {
  const totalPanes = countPanes(layout);

  // Store all slot-bound callbacks in a ref so we can create stable wrappers.
  // The ref always holds the latest callbacks without causing re-renders.
  const cbRef = useRef({
    onFocusPane, onClosePane, onSendPrompt, onSteer, onAbort, onLoadSession,
    onNewSession, onGetForkMessages, onFork, onSetModel, onSetThinkingLevel,
    onQuestionnaireResponse, onExtensionUIResponse, onCustomUIInput, onCompact,
    onExport, onRenameSession, onFollowUp, onGetSessionTree, onNavigateTree,
    onCopyLastAssistant, onGetQueuedMessages, onClearQueue, onListFiles,
    onExecuteBash, onUpdatePlanTask, onDeactivatePlan, onUpdateJobTask,
  });
  cbRef.current = {
    onFocusPane, onClosePane, onSendPrompt, onSteer, onAbort, onLoadSession,
    onNewSession, onGetForkMessages, onFork, onSetModel, onSetThinkingLevel,
    onQuestionnaireResponse, onExtensionUIResponse, onCustomUIInput, onCompact,
    onExport, onRenameSession, onFollowUp, onGetSessionTree, onNavigateTree,
    onCopyLastAssistant, onGetQueuedMessages, onClearQueue, onListFiles,
    onExecuteBash, onUpdatePlanTask, onDeactivatePlan, onUpdateJobTask,
  };

  // Cache of stable per-slot callback objects. Functions read through cbRef
  // so they always call the latest callback without changing identity.
  const slotCbCache = useRef(new Map<string, Record<string, Function>>());

  const getSlotCallbacks = useCallback((slotId: string, paneId: string) => {
    const cacheKey = `${paneId}:${slotId}`;
    let cached = slotCbCache.current.get(cacheKey);
    if (!cached) {
      cached = {
        onFocus: () => cbRef.current.onFocusPane(paneId),
        onClose: () => cbRef.current.onClosePane(paneId),
        onSendPrompt: (msg: string, images?: ImageAttachment[]) => cbRef.current.onSendPrompt(slotId, msg, images),
        onSteer: (msg: string, images?: ImageAttachment[]) => cbRef.current.onSteer(slotId, msg, images),
        onAbort: () => cbRef.current.onAbort(slotId),
        onLoadSession: (sessionId: string) => cbRef.current.onLoadSession(slotId, sessionId),
        onNewSession: () => cbRef.current.onNewSession(slotId),
        onGetForkMessages: () => cbRef.current.onGetForkMessages(slotId),
        onFork: (entryId: string) => cbRef.current.onFork(slotId, entryId),
        onSetModel: (provider: string, modelId: string) => cbRef.current.onSetModel(slotId, provider, modelId),
        onSetThinkingLevel: (level: ThinkingLevel) => cbRef.current.onSetThinkingLevel(slotId, level),
        onQuestionnaireResponse: (toolCallId: string, response: string) => cbRef.current.onQuestionnaireResponse(slotId, toolCallId, response),
        onExtensionUIResponse: (response: ExtensionUIResponse) => cbRef.current.onExtensionUIResponse(slotId, response),
        onCustomUIInput: (input: CustomUIInputEvent) => cbRef.current.onCustomUIInput(slotId, input),
        onCompact: () => cbRef.current.onCompact(slotId),
        onExport: () => cbRef.current.onExport(slotId),
        onRenameSession: (name: string) => cbRef.current.onRenameSession(slotId, name),
        onFollowUp: (msg: string) => cbRef.current.onFollowUp(slotId, msg),
        onGetSessionTree: () => cbRef.current.onGetSessionTree(slotId),
        onNavigateTree: (targetId: string) => cbRef.current.onNavigateTree(slotId, targetId),
        onCopyLastAssistant: () => cbRef.current.onCopyLastAssistant(slotId),
        onGetQueuedMessages: () => cbRef.current.onGetQueuedMessages(slotId),
        onClearQueue: () => cbRef.current.onClearQueue(slotId),
        onListFiles: (query?: string, requestId?: string) => cbRef.current.onListFiles(slotId, query, requestId),
        onExecuteBash: (cmd: string, exclude?: boolean) => cbRef.current.onExecuteBash(slotId, cmd, exclude),
        onUpdatePlanTask: (planPath: string, line: number, done: boolean) => (cbRef.current.onUpdatePlanTask ?? (() => {}))(planPath, line, done),
        onDeactivatePlan: () => (cbRef.current.onDeactivatePlan ?? (() => {}))(),
        onUpdateJobTask: (jobPath: string, line: number, done: boolean) => (cbRef.current.onUpdateJobTask ?? (() => {}))(jobPath, line, done),
      };
      slotCbCache.current.set(cacheKey, cached);
    }
    return cached;
  }, []);

  // Render a single pane
  const renderPane = (node: PaneNode) => {
    const slot = workspace?.slots[node.slotId] || null;
    const paneData = {
      id: node.id,
      sessionSlotId: node.slotId,
      size: 1,
      slot,
    };
    const cb = getSlotCallbacks(node.slotId, node.id);

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
        onFocus={cb.onFocus as () => void}
        onClose={cb.onClose as () => void}
        onSendPrompt={cb.onSendPrompt as (msg: string, images?: ImageAttachment[]) => void}
        onSteer={cb.onSteer as (msg: string, images?: ImageAttachment[]) => void}
        onAbort={cb.onAbort as () => void}
        onLoadSession={cb.onLoadSession as (sessionId: string) => void}
        onNewSession={cb.onNewSession as () => void}
        onSplit={onSplit}
        onGetForkMessages={cb.onGetForkMessages as () => void}
        onFork={cb.onFork as (entryId: string) => void}
        onSetModel={cb.onSetModel as (provider: string, modelId: string) => void}
        onSetThinkingLevel={cb.onSetThinkingLevel as (level: ThinkingLevel) => void}
        onQuestionnaireResponse={cb.onQuestionnaireResponse as (toolCallId: string, response: string) => void}
        onExtensionUIResponse={cb.onExtensionUIResponse as (response: ExtensionUIResponse) => void}
        onCustomUIInput={cb.onCustomUIInput as (input: CustomUIInputEvent) => void}
        onCompact={cb.onCompact as () => void}
        onOpenSettings={onOpenSettings}
        onExport={cb.onExport as () => void}
        onRenameSession={cb.onRenameSession as (name: string) => void}
        onShowHotkeys={onShowHotkeys}
        onFollowUp={cb.onFollowUp as (msg: string) => void}
        onReload={onReload}
        onGetSessionTree={cb.onGetSessionTree as () => void}
        onNavigateTree={cb.onNavigateTree as (targetId: string) => void}
        onCopyLastAssistant={cb.onCopyLastAssistant as () => void}
        onGetQueuedMessages={cb.onGetQueuedMessages as () => void}
        onClearQueue={cb.onClearQueue as () => void}
        onListFiles={cb.onListFiles as (query?: string, requestId?: string) => void}
        onExecuteBash={cb.onExecuteBash as (cmd: string, exclude?: boolean) => void}
        onToggleAllToolsCollapsed={onToggleAllToolsCollapsed}
        onToggleAllThinkingCollapsed={onToggleAllThinkingCollapsed}
        activePlan={activePlan ?? null}
        onUpdatePlanTask={cb.onUpdatePlanTask as (planPath: string, line: number, done: boolean) => void}
        onDeactivatePlan={cb.onDeactivatePlan as () => void}
        activeJobs={activeJobs ?? []}
        onUpdateJobTask={cb.onUpdateJobTask as (jobPath: string, line: number, done: boolean) => void}
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
    <div className="flex-1 flex mt-px overflow-hidden">
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
          className={`flex-shrink-0 bg-pi-border ${
            isRow
              ? 'w-px cursor-col-resize hover:bg-pi-accent/40'
              : 'h-px cursor-row-resize hover:bg-pi-accent/40'
          }`}
        />
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
