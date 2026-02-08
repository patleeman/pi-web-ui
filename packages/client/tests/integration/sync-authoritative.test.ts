import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('sync-authoritative workspace state', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

  const mockSessionState: SessionState = {
    sessionId: 'session-1',
    sessionFile: '/path/to/session.json',
    model: { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
    thinkingLevel: 'off',
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    steeringMode: 'all',
    followUpMode: 'all',
    contextUsage: { used: 1000, total: 200000, percentage: 0.5 },
  };

  const mockWorkspaceInfo: WorkspaceInfo = {
    id: 'ws-1',
    path: '/home/user/project',
    name: 'project',
    isActive: true,
    state: mockSessionState,
  };

  const mockStartupInfo: StartupInfo = {
    version: '1.0.0',
    contextFiles: [],
    extensions: [],
    themes: [],
    skills: [],
    resources: [],
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    MockWS = installMockWebSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const getWebSocket = (): MockWebSocket => {
    const instance = MockWS.getInstance();
    if (!instance) throw new Error('WebSocket not created');
    return instance;
  };

  it('applies snapshot UI + queue slices and ignores legacy queued event replay', async () => {
    const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      ws = getWebSocket();

      ws.simulateMessage({
        type: 'connected',
        workspaces: [],
        allowedRoots: ['/home'],
        homeDirectory: '/home',
        recentWorkspaces: [],
        uiState: null,
      });

      ws.simulateMessage({
        type: 'workspaceOpened',
        workspace: mockWorkspaceInfo,
        state: mockSessionState,
        messages: [],
        startupInfo: mockStartupInfo,
      });

      // Snapshot from sync protocol (authoritative)
      ws.simulateMessage({
        type: 'snapshot',
        version: 12,
        state: {
          id: 'ws-1',
          path: '/home/user/project',
          rightPaneOpen: true,
          paneTabs: [
            {
              id: 'tab-1',
              label: 'Main',
              layout: { type: 'pane', id: 'pane-1', slotId: 'default' },
              focusedPaneId: 'pane-1',
            },
          ],
          activePaneTab: 'tab-1',
          slots: {
            default: {
              queuedMessages: {
                steering: ['focus'],
                followUp: ['finish docs'],
              },
            },
          },
        },
      } as unknown as import('@pi-deck/shared').WsServerEvent);

      await vi.advanceTimersByTimeAsync(20);
    });

    expect(result.current.paneTabsByWorkspace['/home/user/project']?.[0]?.id).toBe('tab-1');
    expect(result.current.activePaneTabByWorkspace['/home/user/project']).toBe('tab-1');
    expect(result.current.rightPaneByWorkspace['/home/user/project']).toBe(true);
    expect(result.current.getSlot('default')?.queuedMessages).toEqual({
      steering: ['focus'],
      followUp: ['finish docs'],
    });

    // Legacy queuedMessages should be ignored once workspace is sync-authoritative
    await act(async () => {
      ws!.simulateMessage({
        type: 'queuedMessages',
        workspaceId: 'ws-1',
        sessionSlotId: 'default',
        steering: ['legacy-should-be-ignored'],
        followUp: [],
      });
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.getSlot('default')?.queuedMessages).toEqual({
      steering: ['focus'],
      followUp: ['finish docs'],
    });
  });

  it('applies slot create/delete deltas from sync', async () => {
    const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      ws = getWebSocket();
      ws.simulateMessage({
        type: 'connected',
        workspaces: [],
        allowedRoots: ['/home'],
        homeDirectory: '/home',
        recentWorkspaces: [],
        uiState: null,
      });
      ws.simulateMessage({
        type: 'workspaceOpened',
        workspace: mockWorkspaceInfo,
        state: mockSessionState,
        messages: [],
        startupInfo: mockStartupInfo,
      });

      ws.simulateMessage({
        type: 'delta',
        version: 20,
        deltas: [
          { type: 'slotCreate', workspaceId: 'ws-1', slotId: 'secondary' },
          {
            type: 'queuedMessagesUpdate',
            workspaceId: 'ws-1',
            slotId: 'secondary',
            queuedMessages: { steering: ['a'], followUp: ['b'] },
          },
        ],
      } as unknown as import('@pi-deck/shared').WsServerEvent);

      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.getSlot('secondary')).toBeTruthy();
    expect(result.current.getSlot('secondary')?.queuedMessages).toEqual({
      steering: ['a'],
      followUp: ['b'],
    });

    await act(async () => {
      ws!.simulateMessage({
        type: 'delta',
        version: 21,
        deltas: [
          { type: 'slotDelete', workspaceId: 'ws-1', slotId: 'secondary' },
        ],
      } as unknown as import('@pi-deck/shared').WsServerEvent);
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.getSlot('secondary')).toBeNull();
  });
});
