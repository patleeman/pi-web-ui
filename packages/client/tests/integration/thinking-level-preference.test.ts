import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo, ThinkingLevel } from '@pi-web-ui/shared';

describe('Thinking Level Preference Integration', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

  const createMockSessionState = (thinkingLevel: ThinkingLevel = 'off'): SessionState => ({
    sessionId: 'session-1',
    sessionFile: '/path/to/session.json',
    model: { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic', reasoning: false, contextWindow: 200000 },
    thinkingLevel,
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    steeringMode: 'all',
    followUpMode: 'all',
    messageCount: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    contextWindowPercent: 0,
    git: { branch: 'main', changedFiles: 0 },
  });

  const mockWorkspaceInfo: WorkspaceInfo = {
    id: 'ws-1',
    path: '/home/user/project',
    name: 'project',
    isActive: true,
    state: null,
  };

  const mockStartupInfo: StartupInfo = {
    version: '1.0.0',
    contextFiles: [],
    extensions: [],
    themes: [],
    skills: [],
    shortcuts: [],
  };

  const connectedEvent = {
    type: 'connected' as const,
    workspaces: [] as WorkspaceInfo[],
    allowedRoots: ['/home'],
    homeDirectory: '/home',
    uiState: {
      openWorkspaces: [],
      activeWorkspacePath: null,
      draftInputs: {},
      sidebarWidth: 224,
      themeId: null,
      activeSessions: {},
      activeModels: {},
      thinkingLevels: {},
    },
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

  const setupConnection = async (hook: ReturnType<typeof renderHook<ReturnType<typeof useWorkspaces>, unknown>>) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      ws = getWebSocket();
      ws.simulateMessage(connectedEvent);
      await vi.advanceTimersByTimeAsync(10);
    });
    return ws!;
  };

  describe('Workspace opens with stored thinking level', () => {
    it('receives workspaceOpened with applied thinking level', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // Simulate server sending workspaceOpened with thinking level applied
      const sessionStateWithThinking = createMockSessionState('high');
      
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: sessionStateWithThinking,
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces.length).toBe(1);
      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.thinkingLevel).toBe('high');
    });

    it('thinking level is off when no preference stored', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // Simulate server sending workspaceOpened with default thinking level
      const sessionState = createMockSessionState('off');
      
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: sessionState,
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.thinkingLevel).toBe('off');
    });
  });

  describe('New session slot inherits thinking level', () => {
    it('receives sessionSlotCreated with applied thinking level', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // First open workspace
      const sessionState = createMockSessionState('medium');
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: sessionState,
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Then create new slot (split pane) - should inherit thinking level
      const newSlotState = createMockSessionState('medium');
      await act(async () => {
        ws!.simulateMessage({
          type: 'sessionSlotCreated',
          workspaceId: 'ws-1',
          sessionSlotId: 'slot-2',
          state: newSlotState,
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const newSlot = result.current.workspaces[0].slots['slot-2'];
      expect(newSlot).toBeDefined();
      expect(newSlot.state?.thinkingLevel).toBe('medium');
    });
  });

  describe('Changing thinking level', () => {
    it('sends setThinkingLevel message when user changes level', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // Open workspace
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: createMockSessionState('off'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      ws!.clearSentMessages();

      // User changes thinking level
      await act(async () => {
        result.current.setThinkingLevel('default', 'high');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const thinkingMsg = messages.find(m => m.type === 'setThinkingLevel');
      expect(thinkingMsg).toBeDefined();
      expect(thinkingMsg?.level).toBe('high');
      expect(thinkingMsg?.sessionSlotId).toBe('default');
    });

    it('updates slot state when server confirms thinking level change', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // Open workspace
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: createMockSessionState('off'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Simulate server responding with updated state
      await act(async () => {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: createMockSessionState('xhigh'),
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.thinkingLevel).toBe('xhigh');
    });
  });

  describe('All thinking levels', () => {
    const allLevels: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

    allLevels.forEach((level) => {
      it(`correctly handles thinking level: ${level}`, async () => {
        const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
        
        await setupConnection({ result } as any);

        await act(async () => {
          ws!.simulateMessage({
            type: 'workspaceOpened',
            workspace: mockWorkspaceInfo,
            state: createMockSessionState(level),
            messages: [],
            startupInfo: mockStartupInfo,
          });
          await vi.advanceTimersByTimeAsync(10);
        });

        const slot = result.current.workspaces[0].slots['default'];
        expect(slot.state?.thinkingLevel).toBe(level);
      });
    });
  });

  describe('Reconnection preserves thinking level', () => {
    it('workspace state includes thinking level after reconnect', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupConnection({ result } as any);

      // Open workspace with high thinking level
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: mockWorkspaceInfo,
          state: createMockSessionState('high'),
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].state?.thinkingLevel).toBe('high');

      // Simulate disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.isConnected).toBe(false);

      // Simulate reconnect
      await act(async () => {
        // Trigger reconnection by advancing timers (usually 3 seconds)
        await vi.advanceTimersByTimeAsync(3100);
        
        // Get new WebSocket instance
        ws = MockWS.getInstance();
        if (ws) {
          ws.simulateMessage(connectedEvent);
          await vi.advanceTimersByTimeAsync(10);
        }
      });

      // Reattach to workspace - server would preserve thinking level
      await act(async () => {
        ws!.simulateMessage({
          type: 'workspaceOpened',
          workspace: { ...mockWorkspaceInfo, id: 'ws-1' },
          state: createMockSessionState('high'), // Server preserved the setting
          messages: [],
          startupInfo: mockStartupInfo,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.thinkingLevel).toBe('high');
    });
  });
});
