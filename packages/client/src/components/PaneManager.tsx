import { useState, useCallback, useRef, useEffect } from 'react';
import type { PaneLayout, PaneInfo, SessionInfo, ImageAttachment, ModelInfo, ThinkingLevel, SlashCommand as BackendSlashCommand } from '@pi-web-ui/shared';
import type { PaneData } from '../hooks/usePanes';
import { Pane } from './Pane';

interface PaneManagerProps {
  panes: PaneData[];
  focusedPaneId: string | null;
  layout: PaneLayout;
  sessions: SessionInfo[];
  models: ModelInfo[];
  backendCommands: BackendSlashCommand[];
  onFocusPane: (paneId: string) => void;
  onSplit: (direction: 'vertical' | 'horizontal') => void;
  onClosePane: (paneId: string) => void;
  onResizePanes: (panes: PaneInfo[]) => void;
  onSendPrompt: (slotId: string, message: string, images?: ImageAttachment[]) => void;
  onSteer: (slotId: string, message: string) => void;
  onAbort: (slotId: string) => void;
  onLoadSession: (slotId: string, sessionId: string) => void;
  onNewSession: (slotId: string) => void;
  onGetForkMessages: (slotId: string) => void;
  onSetModel: (slotId: string, provider: string, modelId: string) => void;
  onSetThinkingLevel: (slotId: string, level: ThinkingLevel) => void;
  onQuestionnaireResponse: (slotId: string, toolCallId: string, response: string) => void;
}

export function PaneManager({
  panes,
  focusedPaneId,
  layout,
  sessions,
  models,
  backendCommands,
  onFocusPane,
  onSplit,
  onClosePane,
  onResizePanes,
  onSendPrompt,
  onSteer,
  onAbort,
  onLoadSession,
  onNewSession,
  onGetForkMessages,
  onSetModel,
  onSetThinkingLevel,
  onQuestionnaireResponse,
}: PaneManagerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  const isVertical = layout === 'single' || layout === 'split-v';

  const handleMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = isVertical ? e.clientX : e.clientY;
    const startSizes = panes.map(p => p.size);
    setResizing({ index, startPos, startSizes });
  }, [panes, isVertical]);

  useEffect(() => {
    if (!resizing || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) return;

      const totalSize = isVertical ? container.width : container.height;
      const currentPos = isVertical ? e.clientX - container.left : e.clientY - container.top;
      
      let cumulativeSize = 0;
      for (let i = 0; i <= resizing.index; i++) {
        cumulativeSize += resizing.startSizes[i];
      }
      const totalStartSize = resizing.startSizes.reduce((a, b) => a + b, 0);
      const startPx = (cumulativeSize / totalStartSize) * totalSize;
      const deltaRatio = (currentPos - startPx) / totalSize;

      const newPanes = panes.map((p) => ({ ...p }));
      const minSize = 0.15;
      
      const leftIndex = resizing.index;
      const rightIndex = resizing.index + 1;
      
      let newLeftSize = resizing.startSizes[leftIndex] + deltaRatio * totalStartSize;
      let newRightSize = resizing.startSizes[rightIndex] - deltaRatio * totalStartSize;
      
      if (newLeftSize < minSize * totalStartSize) {
        newRightSize += newLeftSize - minSize * totalStartSize;
        newLeftSize = minSize * totalStartSize;
      }
      if (newRightSize < minSize * totalStartSize) {
        newLeftSize += newRightSize - minSize * totalStartSize;
        newRightSize = minSize * totalStartSize;
      }
      
      newPanes[leftIndex].size = newLeftSize / totalStartSize;
      newPanes[rightIndex].size = newRightSize / totalStartSize;
      
      const totalNewSize = newPanes.reduce((a, p) => a + p.size, 0);
      newPanes.forEach(p => p.size /= totalNewSize);
      
      onResizePanes(newPanes);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, panes, isVertical, onResizePanes]);

  // Single pane
  if (panes.length === 1) {
    const pane = panes[0];
    return (
      <div ref={containerRef} className="flex-1 flex p-2">
        <Pane
          pane={pane}
          isFocused={focusedPaneId === pane.id}
          sessions={sessions}
          models={models}
          backendCommands={backendCommands}
          onFocus={() => onFocusPane(pane.id)}
          onClose={() => onClosePane(pane.id)}
          onSendPrompt={(msg, images) => onSendPrompt(pane.sessionSlotId, msg, images)}
          onSteer={(msg) => onSteer(pane.sessionSlotId, msg)}
          onAbort={() => onAbort(pane.sessionSlotId)}
          onLoadSession={(sessionId) => onLoadSession(pane.sessionSlotId, sessionId)}
          onNewSession={() => onNewSession(pane.sessionSlotId)}
          onSplit={onSplit}
          onGetForkMessages={() => onGetForkMessages(pane.sessionSlotId)}
          onSetModel={(provider, modelId) => onSetModel(pane.sessionSlotId, provider, modelId)}
          onSetThinkingLevel={(level) => onSetThinkingLevel(pane.sessionSlotId, level)}
          onQuestionnaireResponse={(toolCallId, response) => onQuestionnaireResponse(pane.sessionSlotId, toolCallId, response)}
          canClose={false}
        />
      </div>
    );
  }

  // Multiple panes
  return (
    <div
      ref={containerRef}
      className={`flex-1 flex p-2 ${
        layout === 'split-h' ? 'flex-col' : 'flex-row'
      }`}
    >
      {panes.map((pane, index) => (
        <div
          key={pane.id}
          className="flex"
          style={{
            flex: pane.size,
            flexDirection: layout === 'split-h' ? 'column' : 'row',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <Pane
            pane={pane}
            isFocused={focusedPaneId === pane.id}
            sessions={sessions}
            models={models}
            backendCommands={backendCommands}
            onFocus={() => onFocusPane(pane.id)}
            onClose={() => onClosePane(pane.id)}
            onSendPrompt={(msg, images) => onSendPrompt(pane.sessionSlotId, msg, images)}
            onSteer={(msg) => onSteer(pane.sessionSlotId, msg)}
            onAbort={() => onAbort(pane.sessionSlotId)}
            onLoadSession={(sessionId) => onLoadSession(pane.sessionSlotId, sessionId)}
            onNewSession={() => onNewSession(pane.sessionSlotId)}
            onSplit={onSplit}
            onGetForkMessages={() => onGetForkMessages(pane.sessionSlotId)}
            onSetModel={(provider, modelId) => onSetModel(pane.sessionSlotId, provider, modelId)}
            onSetThinkingLevel={(level) => onSetThinkingLevel(pane.sessionSlotId, level)}
            onQuestionnaireResponse={(toolCallId, response) => onQuestionnaireResponse(pane.sessionSlotId, toolCallId, response)}
            canClose={panes.length > 1}
          />
          
          {/* Resize handle */}
          {index < panes.length - 1 && (
            <div
              onMouseDown={handleMouseDown(index)}
              className={`flex items-center justify-center ${
                layout === 'split-h' 
                  ? 'w-full h-2 cursor-row-resize' 
                  : 'h-full w-2 cursor-col-resize'
              }`}
            >
              <div
                className={`bg-pi-border rounded-sm ${
                  layout === 'split-h' ? 'w-10 h-[2px]' : 'h-10 w-[2px]'
                }`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
