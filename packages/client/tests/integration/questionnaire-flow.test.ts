import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Questionnaire Flow Integration', () => {
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

  describe('Questionnaire Request', () => {
    it('receives questionnaireRequest event', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'questionnaireRequest',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'quest-1',
          questions: [
            {
              id: 'q1',
              prompt: 'Choose a framework',
              options: [
                { value: 'react', label: 'React' },
                { value: 'vue', label: 'Vue' },
              ],
            },
          ],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // The slot should have a pending questionnaire
      // This is typically stored in slot state or a separate state
      // Test verifies the event is received without error
    });
  });

  describe('Questionnaire Response', () => {
    it('sends questionnaireResponse message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      const response = JSON.stringify({
        answers: [{ id: 'q1', value: 'react' }],
        cancelled: false,
      });

      await act(async () => {
        result.current.sendQuestionnaireResponse('default', 'quest-1', response);
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const respMsg = messages.find(m => m.type === 'questionnaireResponse');
      expect(respMsg).toBeDefined();
      expect(respMsg?.toolCallId).toBe('quest-1');
      expect(respMsg?.answers).toEqual([{ id: 'q1', value: 'react' }]);
    });

    it('sends cancelled questionnaire response', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      const response = JSON.stringify({
        answers: [],
        cancelled: true,
      });

      await act(async () => {
        result.current.sendQuestionnaireResponse('default', 'quest-1', response);
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const respMsg = messages.find(m => m.type === 'questionnaireResponse');
      expect(respMsg?.cancelled).toBe(true);
    });
  });
});
