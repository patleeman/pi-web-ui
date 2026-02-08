import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Queued Messages Integration', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

  const mockSessionState: SessionState = {
    sessionId: 'session-1',
    sessionFile: '/path/to/session.json',
    model: { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
    thinkingLevel: 'off',
    isStreaming: true, // Agent is running
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    steeringMode: 'interrupt',
    followUpMode: 'instant',
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

  const setupStreamingWorkspace = async () => {
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
      ws.simulateMessage({
        type: 'workspaceOpened',
        workspace: mockWorkspaceInfo,
        state: mockSessionState,
        messages: [],
        startupInfo: mockStartupInfo,
      });
      // Simulate agent is streaming
      ws.simulateMessage({
        type: 'agentStart',
        workspaceId: 'ws-1',
        sessionSlotId: 'default',
      });
      await vi.advanceTimersByTimeAsync(10);
    });

    return hook;
  };

  describe('Follow-up Message Flow', () => {
    it('sends followUp message when agent is streaming', async () => {
      const { result } = await setupStreamingWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.followUp('default', 'Also check the tests');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const followUpMsg = messages.find(m => m.type === 'followUp');
      expect(followUpMsg).toBeDefined();
      expect(followUpMsg?.message).toBe('Also check the tests');
    });

    it('updates slot queued messages when server responds', async () => {
      const { result } = await setupStreamingWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'queuedMessages',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          steering: [],
          followUp: ['Also check the tests'],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.getSlot('default');
      expect(slot?.queuedMessages.followUp).toEqual(['Also check the tests']);
      expect(slot?.queuedMessages.steering).toEqual([]);
    });

    it('keeps queued messages scoped to the correct slot', async () => {
      const { result } = await setupStreamingWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'sessionSlotCreated',
          workspaceId: 'ws-1',
          sessionSlotId: 'secondary',
          state: mockSessionState,
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);

        ws!.simulateMessage({
          type: 'queuedMessages',
          workspaceId: 'ws-1',
          sessionSlotId: 'secondary',
          steering: ['steer message'],
          followUp: ['follow-up message'],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.getSlot('secondary')?.queuedMessages.steering).toEqual(['steer message']);
      expect(result.current.getSlot('secondary')?.queuedMessages.followUp).toEqual(['follow-up message']);
      expect(result.current.getSlot('default')?.queuedMessages.steering).toEqual([]);
      expect(result.current.getSlot('default')?.queuedMessages.followUp).toEqual([]);
    });
  });

  describe('Steer Message Flow', () => {
    it('sends steer message when agent is streaming', async () => {
      const { result } = await setupStreamingWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.steer('default', 'Focus on error handling');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const steerMsg = messages.find(m => m.type === 'steer');
      expect(steerMsg).toBeDefined();
      expect(steerMsg?.message).toBe('Focus on error handling');
    });
  });

  describe('Get Queued Messages', () => {
    it('sends getQueuedMessages request', async () => {
      const { result } = await setupStreamingWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.getQueuedMessages('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const getQueueMsg = messages.find(m => m.type === 'getQueuedMessages');
      expect(getQueueMsg).toBeDefined();
    });
  });

  describe('Clear Queue', () => {
    it('sends clearQueue request', async () => {
      const { result } = await setupStreamingWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.clearQueue('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const clearQueueMsg = messages.find(m => m.type === 'clearQueue');
      expect(clearQueueMsg).toBeDefined();
    });
  });
});
