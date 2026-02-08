import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Multi-Workspace Integration', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

  const createSessionState = (id: string): SessionState => ({
    sessionId: id,
    sessionFile: `/path/to/${id}.json`,
    model: { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
    thinkingLevel: 'off',
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    steeringMode: 'interrupt',
    followUpMode: 'instant',
    contextUsage: { used: 1000, total: 200000, percentage: 0.5 },
  });

  const createWorkspaceInfo = (id: string, path: string): WorkspaceInfo => ({
    id,
    path,
    name: path.split('/').pop() || id,
    isActive: true,
    state: createSessionState(`session-${id}`),
  });

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

  const connect = async () => {
    const hook = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
    
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
      await vi.advanceTimersByTimeAsync(10);
    });

    return hook;
  };

  describe('Open Multiple Workspaces', () => {
    it('can open multiple workspaces', async () => {
      const { result } = await connect();

      // Open first workspace
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.activeWorkspaceId).toBe('ws-1');

      // Open second workspace
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces.length).toBe(2);
      // Active workspace stays the same (first opened) unless explicitly switched
      expect(result.current.activeWorkspaceId).toBe('ws-1');
    });

    it('tracks workspaces by id', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws1 = result.current.workspaces.find(w => w.id === 'ws-1');
      const ws2 = result.current.workspaces.find(w => w.id === 'ws-2');

      expect(ws1?.path).toBe('/home/user/project1');
      expect(ws2?.path).toBe('/home/user/project2');
    });
  });

  describe('Switch Workspaces', () => {
    it('switches active workspace', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Starts with first workspace active
      expect(result.current.activeWorkspaceId).toBe('ws-1');

      await act(async () => {
        result.current.setActiveWorkspace('ws-2');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.activeWorkspaceId).toBe('ws-2');

      // Can switch back
      await act(async () => {
        result.current.setActiveWorkspace('ws-1');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.activeWorkspaceId).toBe('ws-1');
    });

    it('activeWorkspace returns correct workspace', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // First workspace is active
      expect(result.current.activeWorkspace?.path).toBe('/home/user/project1');

      await act(async () => {
        result.current.setActiveWorkspace('ws-2');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.activeWorkspace?.path).toBe('/home/user/project2');
    });
  });

  describe('Close Workspace', () => {
    it('sends closeWorkspace message', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      ws!.clearSentMessages();

      await act(async () => {
        result.current.closeWorkspace('ws-1');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const closeMsg = messages.find(m => m.type === 'closeWorkspace');
      expect(closeMsg).toBeDefined();
      expect(closeMsg?.workspaceId).toBe('ws-1');
    });

    it('removes workspace on workspaceClosed event', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces.length).toBe(2);

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceClosed',
          workspaceId: 'ws-1',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].id).toBe('ws-2');
    });

    it('switches to remaining workspace when active is closed', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Make ws-2 active first
      await act(async () => {
        result.current.setActiveWorkspace('ws-2');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.activeWorkspaceId).toBe('ws-2');

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceClosed',
          workspaceId: 'ws-2',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Active workspace is cleared (becomes null, then UI should pick another)
      // The hook sets activeWorkspaceId to null when the active one is closed
      expect(result.current.activeWorkspaceId).toBeNull();
    });
  });

  describe('Independent Workspace State', () => {
    it('each workspace has independent slots', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws1 = result.current.workspaces.find(w => w.id === 'ws-1');
      const ws2 = result.current.workspaces.find(w => w.id === 'ws-2');

      // Each workspace has its own default slot
      expect(ws1?.slots['default']).toBeDefined();
      expect(ws2?.slots['default']).toBeDefined();
    });

    it('state updates go to correct workspace', async () => {
      const { result } = await connect();

      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-1', '/home/user/project1'),
          state: createSessionState('session-1'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: createWorkspaceInfo('ws-2', '/home/user/project2'),
          state: createSessionState('session-2'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Update state for ws-1 only
      await act(async () => {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: { ...createSessionState('session-1'), isStreaming: true },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws1 = result.current.workspaces.find(w => w.id === 'ws-1');
      const ws2 = result.current.workspaces.find(w => w.id === 'ws-2');

      expect(ws1?.slots['default'].isStreaming).toBe(true);
      expect(ws2?.slots['default'].isStreaming).toBe(false);
    });
  });
});
