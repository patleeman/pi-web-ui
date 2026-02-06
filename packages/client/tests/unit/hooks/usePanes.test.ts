import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanes } from '../../../src/hooks/usePanes';
import type { WorkspaceState, SessionSlotState } from '../../../src/hooks/useWorkspaces';

describe('usePanes', () => {
  const mockSlot: SessionSlotState = {
    slotId: 'default',
    state: null,
    messages: [],
    commands: [],
    isStreaming: false,
    streamingText: '',
    streamingThinking: '',
    activeToolExecutions: [],
    bashExecution: null,
    questionnaireRequest: null,
    extensionUIRequest: null,
    customUIState: null,
  };

  const mockWorkspace: WorkspaceState = {
    id: 'ws-1',
    path: '/test/project',
    name: 'project',
    slots: { default: mockSlot },
    sessions: [],
    models: [],
    startupInfo: null,
  };

  const defaultOptions = {
    workspace: mockWorkspace,
    workspaceIds: ['ws-1'],
    onCreateSlot: vi.fn(),
    onCloseSlot: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with one pane', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    expect(result.current.panes.length).toBe(1);
    expect(result.current.layout.type).toBe('pane');
  });

  it('has a focused pane on init', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    expect(result.current.focusedPaneId).toBeTruthy();
  });

  it('can focus a different pane', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    const paneId = result.current.panes[0].id;
    
    act(() => {
      result.current.focusPane(paneId);
    });
    
    expect(result.current.focusedPaneId).toBe(paneId);
  });

  it('can split vertically', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    
    act(() => {
      result.current.split('vertical');
    });
    
    expect(result.current.panes.length).toBe(2);
    expect(result.current.layout.type).toBe('split');
    if (result.current.layout.type === 'split') {
      expect(result.current.layout.direction).toBe('horizontal'); // vertical split = horizontal direction
    }
  });

  it('can split horizontally', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    
    act(() => {
      result.current.split('horizontal');
    });
    
    expect(result.current.panes.length).toBe(2);
    expect(result.current.layout.type).toBe('split');
    if (result.current.layout.type === 'split') {
      expect(result.current.layout.direction).toBe('vertical'); // horizontal split = vertical direction
    }
  });

  it('calls onCreateSlot when splitting', () => {
    const onCreateSlot = vi.fn();
    const { result } = renderHook(() => usePanes({ ...defaultOptions, onCreateSlot }));
    
    act(() => {
      result.current.split('vertical');
    });
    
    expect(onCreateSlot).toHaveBeenCalledWith('ws-1', expect.any(String));
  });

  it('can close a pane', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    
    // First split to have 2 panes
    act(() => {
      result.current.split('vertical');
    });
    
    const paneToClose = result.current.panes[1].id;
    
    act(() => {
      result.current.closePane(paneToClose);
    });
    
    expect(result.current.panes.length).toBe(1);
    expect(result.current.layout.type).toBe('pane');
  });

  it('calls onCloseSlot when closing a pane', () => {
    const onCloseSlot = vi.fn();
    const { result } = renderHook(() => usePanes({ ...defaultOptions, onCloseSlot }));
    
    // First split to have 2 panes
    act(() => {
      result.current.split('vertical');
    });
    
    const paneToClose = result.current.panes[1];
    
    act(() => {
      result.current.closePane(paneToClose.id);
    });
    
    expect(onCloseSlot).toHaveBeenCalledWith('ws-1', paneToClose.sessionSlotId);
  });

  it('does not close the last pane', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    const paneId = result.current.panes[0].id;
    
    act(() => {
      result.current.closePane(paneId);
    });
    
    // Should still have one pane
    expect(result.current.panes.length).toBe(1);
  });

  it('returns slot data with pane', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    const pane = result.current.panes[0];
    
    expect(pane.slot).toBeTruthy();
    expect(pane.slot?.slotId).toBe('default');
  });

  it('handles null workspace', () => {
    const { result } = renderHook(() => usePanes({ ...defaultOptions, workspace: null }));
    
    // Should still have layout structure
    expect(result.current.panes.length).toBe(1);
    // But slots should be null
    expect(result.current.panes[0].slot).toBeNull();
  });

  it('can resize split nodes', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    
    act(() => {
      result.current.split('vertical');
    });
    
    act(() => {
      result.current.resizeNode([], [30, 70]);
    });
    
    if (result.current.layout.type === 'split') {
      expect(result.current.layout.sizes).toEqual([30, 70]);
    }
  });

  it('focuses the new pane after split', () => {
    const { result } = renderHook(() => usePanes(defaultOptions));
    const originalPaneId = result.current.panes[0].id;
    
    act(() => {
      result.current.split('vertical');
    });
    
    // The new pane should be focused
    expect(result.current.focusedPaneId).not.toBe(originalPaneId);
  });
});
