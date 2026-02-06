import type { LayoutNode } from '../hooks/usePanes';
import { paneIdForSlot } from '../utils/panes';

const ROUTE_STATE_VERSION = 1;
const WORKSPACE_ROUTE_STATE_VERSION = 1;

type RouteDirection = 'horizontal' | 'vertical';

export interface RoutePaneNode {
  type: 'pane';
  slotId: string;
}

export interface RouteSplitNode {
  type: 'split';
  direction: RouteDirection;
  children: RouteLayoutNode[];
  sizes: number[];
}

export type RouteLayoutNode = RoutePaneNode | RouteSplitNode;

export interface RouteState {
  version: number;
  layout: RouteLayoutNode;
  focusedSlotId: string | null;
  sessions: Record<string, string>;
}

export interface WorkspaceRouteTab {
  id: string;
  label?: string;
  state: RouteState;
}

export interface WorkspaceRouteState {
  version: number;
  activeTabId: string | null;
  tabs: WorkspaceRouteTab[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoutePaneNode(value: unknown): value is RoutePaneNode {
  if (!isPlainObject(value)) return false;
  return value.type === 'pane' && typeof value.slotId === 'string';
}

function isRouteSplitNode(value: unknown): value is RouteSplitNode {
  if (!isPlainObject(value)) return false;
  if (value.type !== 'split') return false;
  if (value.direction !== 'horizontal' && value.direction !== 'vertical') return false;
  if (!Array.isArray(value.children) || value.children.length < 2) return false;
  if (!Array.isArray(value.sizes) || value.sizes.length !== value.children.length) return false;
  if (!value.children.every((child) => isRouteLayoutNode(child))) return false;
  return value.sizes.every((size) => typeof size === 'number' && Number.isFinite(size));
}

function isRouteLayoutNode(value: unknown): value is RouteLayoutNode {
  return isRoutePaneNode(value) || isRouteSplitNode(value);
}

function normalizeSizes(sizes: number[], count: number): number[] {
  if (count <= 0) return [];
  if (sizes.length !== count) {
    return Array.from({ length: count }, () => 1 / count);
  }
  const sanitized = sizes.map((size) => (Number.isFinite(size) && size > 0 ? size : 0));
  const total = sanitized.reduce((sum, size) => sum + size, 0);
  if (total <= 0) {
    return Array.from({ length: count }, () => 1 / count);
  }
  return sanitized.map((size) => size / total);
}

function parseRouteStateObject(value: unknown): RouteState | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== ROUTE_STATE_VERSION) return null;
  if (!isRouteLayoutNode(value.layout)) return null;

  const focusedSlotId = typeof value.focusedSlotId === 'string' ? value.focusedSlotId : null;

  const sessions: Record<string, string> = {};
  if (isPlainObject(value.sessions)) {
    for (const [key, sessionValue] of Object.entries(value.sessions)) {
      if (typeof sessionValue === 'string') {
        sessions[key] = sessionValue;
      }
    }
  }

  return {
    version: ROUTE_STATE_VERSION,
    layout: value.layout,
    focusedSlotId,
    sessions,
  };
}

export function serializeRouteState(state: RouteState | null): string | null {
  if (!state) return null;
  return JSON.stringify(state);
}

export function parseRouteState(raw: string | null): RouteState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parseRouteStateObject(parsed);
  } catch {
    return null;
  }
}

export function layoutToRouteLayout(layout: LayoutNode): RouteLayoutNode {
  if (layout.type === 'pane') {
    return { type: 'pane', slotId: layout.slotId };
  }

  return {
    type: 'split',
    direction: layout.direction,
    sizes: [...layout.sizes],
    children: layout.children.map(layoutToRouteLayout),
  };
}

export function buildRouteState(
  layout: LayoutNode,
  focusedSlotId: string | null,
  sessions: Record<string, string>
): RouteState {
  return {
    version: ROUTE_STATE_VERSION,
    layout: layoutToRouteLayout(layout),
    focusedSlotId,
    sessions,
  };
}

export function createSinglePaneRouteState(slotId: string): RouteState {
  return {
    version: ROUTE_STATE_VERSION,
    layout: { type: 'pane', slotId },
    focusedSlotId: slotId,
    sessions: {},
  };
}

export function routeLayoutToLayout(routeLayout: RouteLayoutNode): LayoutNode {
  if (routeLayout.type === 'pane') {
    return {
      type: 'pane',
      id: paneIdForSlot(routeLayout.slotId),
      slotId: routeLayout.slotId,
    };
  }

  const children = routeLayout.children.map(routeLayoutToLayout);
  return {
    type: 'split',
    direction: routeLayout.direction,
    children,
    sizes: normalizeSizes(routeLayout.sizes, children.length),
  };
}

export function collectRouteSlotIds(routeLayout: RouteLayoutNode, slots = new Set<string>()): Set<string> {
  if (routeLayout.type === 'pane') {
    slots.add(routeLayout.slotId);
    return slots;
  }

  for (const child of routeLayout.children) {
    collectRouteSlotIds(child, slots);
  }
  return slots;
}

function parseWorkspaceRouteTab(value: unknown): WorkspaceRouteTab | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;

  const state = parseRouteStateObject(value.state);
  if (!state) return null;

  const label = typeof value.label === 'string' && value.label.trim() ? value.label : undefined;

  return {
    id: value.id,
    label,
    state,
  };
}

export function serializeWorkspaceRouteState(state: WorkspaceRouteState | null): string | null {
  if (!state) return null;
  return JSON.stringify(state);
}

export function parseWorkspaceRouteState(raw: string | null): WorkspaceRouteState | null {
  if (!raw) return null;

  const singleTabState = parseRouteState(raw);
  if (singleTabState) {
    return {
      version: WORKSPACE_ROUTE_STATE_VERSION,
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', label: 'Tab 1', state: singleTabState }],
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (parsed.version !== WORKSPACE_ROUTE_STATE_VERSION) return null;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;

    const tabs: WorkspaceRouteTab[] = [];
    const seenTabIds = new Set<string>();
    for (const tabValue of parsed.tabs) {
      const tab = parseWorkspaceRouteTab(tabValue);
      if (!tab) return null;
      if (seenTabIds.has(tab.id)) return null;
      seenTabIds.add(tab.id);
      tabs.push(tab);
    }

    const activeTabId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null;
    const resolvedActiveTabId = activeTabId && seenTabIds.has(activeTabId)
      ? activeTabId
      : tabs[0].id;

    return {
      version: WORKSPACE_ROUTE_STATE_VERSION,
      activeTabId: resolvedActiveTabId,
      tabs,
    };
  } catch {
    return null;
  }
}
