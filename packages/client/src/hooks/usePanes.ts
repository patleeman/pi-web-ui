import { useState, useCallback, useMemo, useRef } from 'react';
import type { PaneInfo, PaneLayoutNode } from '@pi-web-ui/shared';
import type { SessionSlotState, WorkspaceState } from './useWorkspaces';

/** Pane data combining layout info with session slot state */
export interface PaneData extends PaneInfo {
  slot: SessionSlotState | null;
}

// Layout tree node types
export type PaneNode = Extract<PaneLayoutNode, { type: 'pane' }>;
export type SplitNode = Extract<PaneLayoutNode, { type: 'split' }>;
export type LayoutNode = PaneLayoutNode;

interface UsePanesOptions {
  workspace: WorkspaceState | null;
  /** All current workspace IDs - used to clean up stale layouts */
  workspaceIds: string[];
  /** Active tab ID for the current workspace */
  tabId: string | null;
  /** All tab IDs per workspace (used to clean up stale tab layouts) */
  tabIdsByWorkspace: Record<string, string[]>;
  /** Initial layout for the active tab (used when first created) */
  initialLayout?: LayoutNode | null;
  /** Initial focused pane ID for the active tab */
  initialFocusedPaneId?: string | null;
  onCreateSlot: (workspaceId: string, slotId: string) => void;
  onCloseSlot: (workspaceId: string, slotId: string) => void;
}

interface UsePanesReturn {
  panes: PaneData[];
  layout: LayoutNode;
  focusedPaneId: string | null;
  focusedSlotId: string | null;
  focusPane: (paneId: string) => void;
  split: (direction: 'vertical' | 'horizontal') => void;
  closePane: (paneId: string) => void;
  updatePaneSlot: (paneId: string, slotId: string) => void;
  resizeNode: (path: number[], sizes: number[]) => void;
}

function generatePaneId(): string {
  return `pane-${Math.random().toString(16).slice(2)}`;
}

function generateSlotId(): string {
  return `slot-${Math.random().toString(16).slice(2)}`;
}

// Collect all panes from the layout tree
function collectPanes(node: LayoutNode): PaneNode[] {
  if (node.type === 'pane') {
    return [node];
  }
  return node.children.flatMap(collectPanes);
}

// Find a pane by ID and return its path
function findPanePath(node: LayoutNode, paneId: string, path: number[] = []): number[] | null {
  if (node.type === 'pane') {
    return node.id === paneId ? path : null;
  }
  for (let i = 0; i < node.children.length; i++) {
    const result = findPanePath(node.children[i], paneId, [...path, i]);
    if (result) return result;
  }
  return null;
}

// Get node at path
function getNodeAtPath(node: LayoutNode, path: number[]): LayoutNode {
  if (path.length === 0) return node;
  if (node.type === 'pane') return node;
  return getNodeAtPath(node.children[path[0]], path.slice(1));
}

// Get parent split node and index of child
function getParentAndIndex(root: LayoutNode, path: number[]): { parent: SplitNode; index: number } | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const parent = getNodeAtPath(root, parentPath);
  if (parent.type !== 'split') return null;
  return { parent, index };
}

// Deep clone layout
function cloneLayout(node: LayoutNode): LayoutNode {
  if (node.type === 'pane') {
    return { ...node };
  }
  return {
    ...node,
    children: node.children.map(cloneLayout),
    sizes: [...node.sizes],
  };
}

// Replace node at path
function replaceAtPath(root: LayoutNode, path: number[], newNode: LayoutNode): LayoutNode {
  if (path.length === 0) return newNode;
  
  if (root.type === 'pane') return root;
  
  const newRoot = cloneLayout(root) as SplitNode;
  let current = newRoot;
  
  for (let i = 0; i < path.length - 1; i++) {
    current = current.children[path[i]] as SplitNode;
  }
  
  current.children[path[path.length - 1]] = newNode;
  return newRoot;
}

// Remove node at path and clean up
function removeAtPath(root: LayoutNode, path: number[]): LayoutNode | null {
  if (path.length === 0) return null; // Can't remove root
  
  const newRoot = cloneLayout(root);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  
  // Navigate to parent
  let parent: LayoutNode = newRoot;
  for (const i of parentPath) {
    if (parent.type !== 'split') return newRoot;
    parent = parent.children[i];
  }
  
  if (parent.type !== 'split') return newRoot;
  
  // Remove the child
  parent.children.splice(index, 1);
  parent.sizes.splice(index, 1);
  
  // Normalize sizes
  const total = parent.sizes.reduce((a, b) => a + b, 0);
  if (total > 0) {
    parent.sizes = parent.sizes.map(s => s / total);
  }
  
  // If parent has only one child, replace parent with that child
  if (parent.children.length === 1) {
    const onlyChild = parent.children[0];
    if (parentPath.length === 0) {
      return onlyChild;
    }
    return replaceAtPath(newRoot, parentPath, onlyChild);
  }
  
  return newRoot;
}

// Update pane slot ID
function updatePaneSlotAtPath(root: LayoutNode, paneId: string, slotId: string): LayoutNode {
  if (root.type === 'pane') {
    return root.id === paneId ? { ...root, slotId } : root;
  }
  return {
    ...root,
    children: root.children.map((child) => updatePaneSlotAtPath(child, paneId, slotId)),
  };
}

// Update sizes at path
function updateSizesAtPath(root: LayoutNode, path: number[], sizes: number[]): LayoutNode {
  const newRoot = cloneLayout(root);
  
  let current: LayoutNode = newRoot;
  for (const i of path) {
    if (current.type !== 'split') return newRoot;
    current = current.children[i];
  }
  
  if (current.type === 'split') {
    current.sizes = sizes;
  }
  
  return newRoot;
}

// Create default layout for a workspace
function createDefaultLayout(): LayoutNode {
  return {
    type: 'pane',
    id: generatePaneId(),
    slotId: 'default',
  };
}

export function usePanes({
  workspace,
  workspaceIds,
  tabId,
  tabIdsByWorkspace,
  initialLayout = null,
  initialFocusedPaneId = null,
  onCreateSlot,
  onCloseSlot,
}: UsePanesOptions): UsePanesReturn {
  // Use ref for synchronous layout storage, state for triggering re-renders
  const layoutsRef = useRef<Record<string, Record<string, LayoutNode>>>({});
  const focusedPanesRef = useRef<Record<string, Record<string, string | null>>>({});
  
  // State just to trigger re-renders
  const [, forceUpdate] = useState(0);
  const triggerUpdate = useCallback(() => forceUpdate(n => n + 1), []);
  
  const workspaceId = workspace?.id ?? null;
  const activeTabId = tabId;
  
  // Clean up layouts for closed workspaces/tabs
  const validWorkspaceIds = new Set(workspaceIds);
  for (const id of Object.keys(layoutsRef.current)) {
    if (!validWorkspaceIds.has(id)) {
      delete layoutsRef.current[id];
      delete focusedPanesRef.current[id];
      continue;
    }
    const validTabs = new Set(tabIdsByWorkspace[id] || []);
    const workspaceLayouts = layoutsRef.current[id] || {};
    const workspaceFocus = focusedPanesRef.current[id] || {};
    for (const tabKey of Object.keys(workspaceLayouts)) {
      if (!validTabs.has(tabKey)) {
        delete workspaceLayouts[tabKey];
      }
    }
    for (const tabKey of Object.keys(workspaceFocus)) {
      if (!validTabs.has(tabKey)) {
        delete workspaceFocus[tabKey];
      }
    }
    layoutsRef.current[id] = workspaceLayouts;
    focusedPanesRef.current[id] = workspaceFocus;
  }
  
  // Get or create layout for current workspace/tab (synchronous)
  const getLayout = useCallback((): LayoutNode => {
    if (!workspaceId || !activeTabId) {
      return { type: 'pane', id: 'no-workspace', slotId: 'default' };
    }
    const workspaceLayouts = layoutsRef.current[workspaceId] || {};
    if (!workspaceLayouts[activeTabId]) {
      workspaceLayouts[activeTabId] = initialLayout ?? createDefaultLayout();
    }
    layoutsRef.current[workspaceId] = workspaceLayouts;
    return workspaceLayouts[activeTabId];
  }, [workspaceId, activeTabId, initialLayout]);
  
  const layout = getLayout();
  
  // Get or compute focused pane for current workspace/tab
  const getFocusedPaneId = useCallback((): string | null => {
    if (!workspaceId || !activeTabId) return null;
    const currentLayout = getLayout();
    const workspaceFocus = focusedPanesRef.current[workspaceId] || {};
    if (workspaceFocus[activeTabId] === undefined) {
      const panes = collectPanes(currentLayout);
      workspaceFocus[activeTabId] = initialFocusedPaneId ?? panes[0]?.id ?? null;
    }
    focusedPanesRef.current[workspaceId] = workspaceFocus;
    return workspaceFocus[activeTabId];
  }, [workspaceId, activeTabId, getLayout, initialFocusedPaneId]);
  
  const focusedPaneId = getFocusedPaneId();
  
  // Setters
  const setLayout = useCallback((updater: LayoutNode | ((prev: LayoutNode) => LayoutNode)) => {
    if (!workspaceId || !activeTabId) return;
    const workspaceLayouts = layoutsRef.current[workspaceId];
    if (!workspaceLayouts) return;
    const currentLayout = workspaceLayouts[activeTabId];
    if (!currentLayout) return;
    const newLayout = typeof updater === 'function' ? updater(currentLayout) : updater;
    workspaceLayouts[activeTabId] = newLayout;
    layoutsRef.current[workspaceId] = workspaceLayouts;
    triggerUpdate();
  }, [workspaceId, activeTabId, triggerUpdate]);
  
  const setFocusedPaneId = useCallback((paneId: string | null) => {
    if (!workspaceId || !activeTabId) return;
    const workspaceFocus = focusedPanesRef.current[workspaceId] || {};
    workspaceFocus[activeTabId] = paneId;
    focusedPanesRef.current[workspaceId] = workspaceFocus;
    triggerUpdate();
  }, [workspaceId, activeTabId, triggerUpdate]);

  // Collect all panes with their slot data
  const panes: PaneData[] = useMemo(() => {
    const paneNodes = collectPanes(layout);
    return paneNodes.map(p => ({
      id: p.id,
      sessionSlotId: p.slotId,
      size: 1, // Size is handled by layout tree now
      slot: workspace?.slots[p.slotId] || null,
    }));
  }, [layout, workspace?.slots]);

  // Get focused slot ID
  const focusedSlotId = useMemo(() => {
    const paneNodes = collectPanes(layout);
    const focused = paneNodes.find(p => p.id === focusedPaneId);
    return focused?.slotId || null;
  }, [layout, focusedPaneId]);

  const focusPane = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
  }, [setFocusedPaneId]);

  const split = useCallback((direction: 'vertical' | 'horizontal') => {
    if (!workspaceId) return;
    
    const currentFocusedPaneId = getFocusedPaneId();
    if (!currentFocusedPaneId) return;
    
    const currentLayout = getLayout();
    
    // Count current panes
    const currentPanes = collectPanes(currentLayout);
    if (currentPanes.length >= 4) return;
    
    // Find the focused pane
    const path = findPanePath(currentLayout, currentFocusedPaneId);
    if (!path) return;
    
    // Create new slot - pass workspaceId explicitly to avoid race conditions
    const newSlotId = generateSlotId();
    onCreateSlot(workspaceId, newSlotId);
    
    // Create new pane
    const newPaneId = generatePaneId();
    const newPane: PaneNode = {
      type: 'pane',
      id: newPaneId,
      slotId: newSlotId,
    };
    
    // Get current pane
    const currentPane = getNodeAtPath(currentLayout, path) as PaneNode;
    
    // Check if parent is a split in the same direction
    const parentInfo = getParentAndIndex(currentLayout, path);
    
    if (parentInfo && currentLayout.type === 'split') {
      const parentNode = getNodeAtPath(currentLayout, path.slice(0, -1)) as SplitNode;
      const splitDir = direction === 'vertical' ? 'horizontal' : 'vertical';
      
      if (parentNode.direction === splitDir) {
        // Add to existing split
        setLayout(prev => {
          const newLayout = cloneLayout(prev);
          let parent: LayoutNode = newLayout;
          for (const i of path.slice(0, -1)) {
            if (parent.type !== 'split') return prev;
            parent = parent.children[i];
          }
          if (parent.type !== 'split') return prev;
          
          // Insert after current pane
          const idx = path[path.length - 1];
          parent.children.splice(idx + 1, 0, newPane);
          
          // Redistribute sizes equally
          const newSize = 1 / parent.children.length;
          parent.sizes = parent.children.map(() => newSize);
          
          return newLayout;
        });
        setFocusedPaneId(newPaneId);
        return;
      }
    }
    
    // Create new split node wrapping current pane and new pane
    const splitDir = direction === 'vertical' ? 'horizontal' : 'vertical';
    const newSplit: SplitNode = {
      type: 'split',
      direction: splitDir,
      children: [currentPane, newPane],
      sizes: [0.5, 0.5],
    };
    
    // Replace current pane with split
    setLayout(prev => replaceAtPath(prev, path, newSplit));
    setFocusedPaneId(newPaneId);
  }, [workspaceId, getLayout, getFocusedPaneId, onCreateSlot, setLayout, setFocusedPaneId]);

  const closePane = useCallback((paneId: string) => {
    if (!workspaceId) return;
    
    const currentLayout = getLayout();
    const currentPanes = collectPanes(currentLayout);
    if (currentPanes.length <= 1) return;
    
    const pane = currentPanes.find(p => p.id === paneId);
    if (!pane) return;
    
    // Close slot on server (unless default) - pass workspaceId explicitly
    if (pane.slotId !== 'default') {
      onCloseSlot(workspaceId, pane.slotId);
    }
    
    // Find and remove pane
    const path = findPanePath(currentLayout, paneId);
    if (!path) return;
    
    const newLayout = removeAtPath(currentLayout, path);
    if (newLayout) {
      setLayout(newLayout);
      
      // Update focus if needed
      const currentFocusedPaneId = getFocusedPaneId();
      if (currentFocusedPaneId === paneId) {
        const remainingPanes = collectPanes(newLayout);
        setFocusedPaneId(remainingPanes[0]?.id || null);
      }
    }
  }, [workspaceId, getLayout, getFocusedPaneId, onCloseSlot, setLayout, setFocusedPaneId]);

  const updatePaneSlot = useCallback((paneId: string, slotId: string) => {
    setLayout(prev => updatePaneSlotAtPath(prev, paneId, slotId));
  }, [setLayout]);

  const resizeNode = useCallback((path: number[], sizes: number[]) => {
    setLayout(prev => updateSizesAtPath(prev, path, sizes));
  }, [setLayout]);

  return {
    panes,
    layout,
    focusedPaneId,
    focusedSlotId,
    focusPane,
    split,
    closePane,
    updatePaneSlot,
    resizeNode,
  };
}
