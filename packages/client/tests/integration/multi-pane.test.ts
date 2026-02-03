import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanes, PaneData } from '../../src/hooks/usePanes';
import type { SessionSlotState, WorkspaceState } from '../../src/hooks/useWorkspaces';

describe('Multi-Pane Integration', () => {
  const createMockSlot = (id: string): SessionSlotState => ({
    slotId: id,
    state: {
      currentModel: { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      contextUsage: { used: 1000, total: 200000, percentage: 0.5 },
      thinkingLevel: 'off',
      isStreaming: false,
      isCompacting: false,
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      steeringMode: 'interrupt',
      followUpMode: 'instant',
    },
    messages: [],
    commands: [],
    isStreaming: false,
    streamingText: '',
    streamingThinking: '',
    activeToolExecutions: [],
    bashExecution: null,
  });

  const createMockWorkspace = (slots: Record<string, SessionSlotState>): WorkspaceState => ({
    id: 'ws-1',
    path: '/test/project',
    name: 'project',
    slots,
    sessions: [],
    models: [],
    startupInfo: null,
  });

  it('creates initial pane', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    expect(result.current.panes.length).toBe(1);
  });

  it('can split pane vertically', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    act(() => {
      result.current.split('vertical');
    });

    expect(result.current.panes.length).toBe(2);
    expect(onCreateSlot).toHaveBeenCalled();
  });

  it('can split pane horizontally', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    act(() => {
      result.current.split('horizontal');
    });

    expect(result.current.panes.length).toBe(2);
  });

  it('maintains layout tree structure after split', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    act(() => {
      result.current.split('vertical');
    });

    expect(result.current.layout).toBeTruthy();
    expect(result.current.layout.type).toBe('split');
  });

  it('tracks focused pane', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    expect(result.current.focusedPaneId).toBeTruthy();
  });

  it('can change focus to different pane', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    // Split to get two panes
    act(() => {
      result.current.split('vertical');
    });

    const pane1Id = result.current.panes[0].id;
    const pane2Id = result.current.panes[1].id;

    act(() => {
      result.current.focusPane(pane1Id);
    });

    expect(result.current.focusedPaneId).toBe(pane1Id);

    act(() => {
      result.current.focusPane(pane2Id);
    });

    expect(result.current.focusedPaneId).toBe(pane2Id);
  });

  it('can close a pane', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    // Split to get two panes
    act(() => {
      result.current.split('vertical');
    });

    expect(result.current.panes.length).toBe(2);

    const paneToClose = result.current.panes[1].id;

    act(() => {
      result.current.closePane(paneToClose);
    });

    expect(result.current.panes.length).toBe(1);
    expect(onCloseSlot).toHaveBeenCalled();
  });

  it('tracks focusedSlotId', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    expect(result.current.focusedSlotId).toBeTruthy();
  });

  it('can resize split nodes', () => {
    const workspace = createMockWorkspace({ default: createMockSlot('default') });
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace,
        workspaceIds: ['ws-1'],
        onCreateSlot,
        onCloseSlot,
      })
    );

    // Split to get two panes
    act(() => {
      result.current.split('vertical');
    });

    // Resize - should not throw
    act(() => {
      result.current.resizeNode([], [60, 40]);
    });

    expect(result.current.layout).toBeTruthy();
  });

  it('handles null workspace', () => {
    const onCreateSlot = vi.fn();
    const onCloseSlot = vi.fn();
    
    const { result } = renderHook(() => 
      usePanes({
        workspace: null,
        workspaceIds: [],
        onCreateSlot,
        onCloseSlot,
      })
    );

    // Should still work with default state
    expect(result.current.panes).toBeDefined();
    expect(result.current.layout).toBeDefined();
  });
});
