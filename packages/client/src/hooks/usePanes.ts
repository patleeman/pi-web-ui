import { useState, useCallback, useMemo } from 'react';
import type { PaneLayout, PaneInfo } from '@pi-web-ui/shared';
import type { SessionSlotState, WorkspaceState } from './useWorkspaces';

/** Pane data combining layout info with session slot state */
export interface PaneData extends PaneInfo {
  slot: SessionSlotState | null;
}

interface UsePanesOptions {
  /** Current workspace (provides session slots) */
  workspace: WorkspaceState | null;
  /** Callback to create a new session slot on the server */
  onCreateSlot: (slotId: string) => void;
  /** Callback to close a session slot on the server */
  onCloseSlot: (slotId: string) => void;
}

interface UsePanesReturn {
  panes: PaneData[];
  focusedPaneId: string | null;
  focusedSlotId: string | null;
  layout: PaneLayout;
  focusPane: (paneId: string) => void;
  split: (direction: 'vertical' | 'horizontal') => void;
  closePane: (paneId: string) => void;
  resizePanes: (panes: PaneInfo[]) => void;
}

let nextPaneId = 1;
let nextSlotId = 1;

function generateSlotId(): string {
  return `slot-${nextSlotId++}`;
}

interface PaneConfig {
  id: string;
  slotId: string;
  size: number;
}

export function usePanes({ workspace, onCreateSlot, onCloseSlot }: UsePanesOptions): UsePanesReturn {
  // Track pane layout configuration (id, slotId, size)
  const [paneConfigs, setPaneConfigs] = useState<PaneConfig[]>(() => [{
    id: `pane-${nextPaneId++}`,
    slotId: 'default',
    size: 1,
  }]);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(() => paneConfigs[0]?.id || null);
  const [layout, setLayout] = useState<PaneLayout>('single');

  // Combine pane configs with slot state from workspace
  const panes: PaneData[] = useMemo(() => {
    return paneConfigs.map(config => ({
      id: config.id,
      sessionSlotId: config.slotId,
      size: config.size,
      slot: workspace?.slots[config.slotId] || null,
    }));
  }, [paneConfigs, workspace?.slots]);

  // Get the focused slot ID
  const focusedSlotId = useMemo(() => {
    const focusedPane = paneConfigs.find(p => p.id === focusedPaneId);
    return focusedPane?.slotId || null;
  }, [paneConfigs, focusedPaneId]);

  const focusPane = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
  }, []);

  const split = useCallback((direction: 'vertical' | 'horizontal') => {
    setPaneConfigs(current => {
      if (current.length >= 4) return current;
      
      // Create new slot ID and request it from server
      const newSlotId = generateSlotId();
      onCreateSlot(newSlotId);
      
      // Create new pane config
      const newPaneId = `pane-${nextPaneId++}`;
      const newPanes = [...current, {
        id: newPaneId,
        slotId: newSlotId,
        size: 1,
      }];
      
      // Distribute sizes equally
      const equalSize = 1 / newPanes.length;
      newPanes.forEach(p => p.size = equalSize);
      
      // Focus the new pane
      setFocusedPaneId(newPaneId);
      
      return newPanes;
    });
    
    setLayout(current => {
      if (current === 'single') {
        return direction === 'vertical' ? 'split-v' : 'split-h';
      }
      return current;
    });
  }, [onCreateSlot]);

  const closePane = useCallback((paneId: string) => {
    setPaneConfigs(current => {
      if (current.length <= 1) return current;
      
      const paneToClose = current.find(p => p.id === paneId);
      if (paneToClose && paneToClose.slotId !== 'default') {
        // Close the session slot on server (unless it's the default)
        onCloseSlot(paneToClose.slotId);
      }
      
      const newPanes = current.filter(p => p.id !== paneId);
      
      // Redistribute sizes
      const totalSize = newPanes.reduce((a, p) => a + p.size, 0);
      newPanes.forEach(p => p.size /= totalSize);
      
      // Update focus if needed
      setFocusedPaneId(focused => {
        if (focused === paneId) {
          return newPanes[0]?.id || null;
        }
        return focused;
      });
      
      // Update layout if single pane
      if (newPanes.length === 1) {
        setLayout('single');
      }
      
      return newPanes;
    });
  }, [onCloseSlot]);

  const resizePanes = useCallback((newPanes: PaneInfo[]) => {
    setPaneConfigs(current => 
      current.map(p => {
        const newPane = newPanes.find(np => np.id === p.id);
        return newPane ? { ...p, size: newPane.size } : p;
      })
    );
  }, []);

  return {
    panes,
    focusedPaneId,
    focusedSlotId,
    layout,
    focusPane,
    split,
    closePane,
    resizePanes,
  };
}
