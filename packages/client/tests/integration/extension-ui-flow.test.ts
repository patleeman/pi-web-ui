import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Extension UI Flow Integration', () => {
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

  const setupWorkspace = async () => {
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
      await vi.advanceTimersByTimeAsync(10);
    });

    return hook;
  };

  describe('Extension UI Request', () => {
    it('receives extensionUIRequest select event', async () => {
      await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'extensionUIRequest',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          request: {
            requestId: 'req-1',
            method: 'select',
            title: 'Choose an option',
            options: ['Option A', 'Option B'],
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Event should be received without error
    });

    it('receives extensionUIRequest confirm event', async () => {
      await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'extensionUIRequest',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          request: {
            requestId: 'req-2',
            method: 'confirm',
            title: 'Confirm',
            message: 'Are you sure?',
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });
    });

    it('receives extensionUIRequest input event', async () => {
      await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'extensionUIRequest',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          request: {
            requestId: 'req-3',
            method: 'input',
            title: 'Enter text',
            placeholder: 'Type here...',
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });
    });
  });

  describe('Extension UI Response', () => {
    it('sends extensionUIResponse with value', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.sendExtensionUIResponse('default', {
          requestId: 'req-1',
          cancelled: false,
          value: 'Option A',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const respMsg = messages.find(m => m.type === 'extensionUIResponse');
      expect(respMsg).toBeDefined();
      expect(respMsg?.response).toEqual({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option A',
      });
    });

    it('sends extensionUIResponse cancelled', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.sendExtensionUIResponse('default', {
          requestId: 'req-1',
          cancelled: true,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const respMsg = messages.find(m => m.type === 'extensionUIResponse');
      expect(respMsg?.response.cancelled).toBe(true);
    });

    it('sends confirm response with boolean value', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.sendExtensionUIResponse('default', {
          requestId: 'req-2',
          cancelled: false,
          value: true,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const respMsg = messages.find(m => m.type === 'extensionUIResponse');
      expect(respMsg?.response.value).toBe(true);
    });
  });

  describe('Extension Notification', () => {
    it('receives extensionNotification event', async () => {
      await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'extensionNotification',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message: 'Operation completed',
          notificationType: 'info',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Notification should be received without error
    });
  });
});
