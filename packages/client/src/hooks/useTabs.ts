import { useMemo } from 'react';
import type { PaneTabPageState } from '@pi-deck/shared';
import type { SessionSlotState, WorkspaceState } from './useWorkspaces';

/** Tab data with slot information or file information */
export interface TabData {
  id: string;
  slotId?: string;
  slot: SessionSlotState | null;
  filePath?: string;
  fileViewMode?: 'file' | 'diff';
}

interface UseTabsOptions {
  workspace: WorkspaceState | null;
  /** Active tab ID for the current workspace */
  tabId: string | null;
  /** All tabs for the current workspace */
  tabs: PaneTabPageState[];
}

interface UseTabsReturn {
  tab: TabData | null;
  focusedSlotId: string | null;
}

export function useTabs({
  workspace,
  tabId,
  tabs,
}: UseTabsOptions): UseTabsReturn {
  const tab = useMemo(() => {
    if (!workspace || !tabId) return null;
    
    // Find the tab definition
    const tabDef = tabs.find(t => t.id === tabId);
    if (!tabDef) return null;
    
    // Handle file tabs
    if (tabDef.filePath) {
      return {
        id: tabId,
        filePath: tabDef.filePath,
        fileViewMode: tabDef.fileViewMode,
        slot: null,
      };
    }
    
    // Handle session tabs
    const slot = tabDef.slotId ? workspace.slots[tabDef.slotId] || null : null;
    
    return {
      id: tabId,
      slotId: tabDef.slotId,
      slot,
      filePath: tabDef.filePath,
      fileViewMode: tabDef.fileViewMode,
    };
  }, [workspace, tabId, tabs]);

  const focusedSlotId = tab?.slotId || null;

  return {
    tab,
    focusedSlotId,
  };
}
