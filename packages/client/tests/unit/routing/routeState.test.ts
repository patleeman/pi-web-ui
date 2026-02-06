import { describe, it, expect } from 'vitest';
import {
  buildRouteState,
  parseRouteState,
  parseWorkspaceRouteState,
  routeLayoutToLayout,
  serializeRouteState,
  serializeWorkspaceRouteState,
} from '../../../src/routing/routeState';
import type { LayoutNode } from '../../../src/hooks/usePanes';
import { paneIdForSlot } from '../../../src/utils/panes';

describe('routeState', () => {
  it('serializes and parses route state', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.6, 0.4],
      children: [
        { type: 'pane', id: paneIdForSlot('default'), slotId: 'default' },
        { type: 'pane', id: paneIdForSlot('slot-1'), slotId: 'slot-1' },
      ],
    };

    const state = buildRouteState(layout, 'slot-1', {
      default: 'session-1',
      'slot-1': 'session-2',
    });

    const serialized = serializeRouteState(state);
    const parsed = parseRouteState(serialized);

    expect(parsed).toEqual(state);
  });

  it('converts route layout to pane layout with normalized sizes', () => {
    const layout = routeLayoutToLayout({
      type: 'split',
      direction: 'vertical',
      sizes: [2, 1],
      children: [
        { type: 'pane', slotId: 'default' },
        { type: 'pane', slotId: 'slot-2' },
      ],
    });

    expect(layout.type).toBe('split');
    if (layout.type === 'split') {
      expect(layout.sizes).toEqual([2 / 3, 1 / 3]);
      expect(layout.children[0]).toEqual({
        type: 'pane',
        id: paneIdForSlot('default'),
        slotId: 'default',
      });
    }
  });

  it('parses legacy single-tab route state as workspace route state', () => {
    const layout: LayoutNode = {
      type: 'pane',
      id: paneIdForSlot('default'),
      slotId: 'default',
    };
    const single = buildRouteState(layout, 'default', { default: 'session-1' });

    const parsed = parseWorkspaceRouteState(serializeRouteState(single));
    expect(parsed).toBeTruthy();
    expect(parsed?.tabs).toHaveLength(1);
    expect(parsed?.activeTabId).toBe(parsed?.tabs[0].id);
    expect(parsed?.tabs[0].state).toEqual(single);
  });

  it('serializes and parses workspace route state with tabs', () => {
    const layout: LayoutNode = {
      type: 'pane',
      id: paneIdForSlot('default'),
      slotId: 'default',
    };
    const tabState = buildRouteState(layout, 'default', { default: 'session-1' });

    const serialized = serializeWorkspaceRouteState({
      version: 1,
      activeTabId: 'tab-a',
      tabs: [
        { id: 'tab-a', label: 'Tab 1', state: tabState },
        { id: 'tab-b', label: 'Tab 2', state: tabState },
      ],
    });

    const parsed = parseWorkspaceRouteState(serialized);
    expect(parsed).toBeTruthy();
    expect(parsed?.tabs).toHaveLength(2);
    expect(parsed?.activeTabId).toBe('tab-a');
  });
});
