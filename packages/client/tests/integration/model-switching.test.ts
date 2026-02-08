import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo, ModelInfo } from '@pi-deck/shared';

describe('Model Switching Integration', () => {
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

  const mockModels: ModelInfo[] = [
    { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { provider: 'anthropic', id: 'claude-opus-4', name: 'Claude Opus 4' },
    { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
  ];

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
      ws.simulateMessage({
        type: 'models',
        workspaceId: 'ws-1',
        models: mockModels,
      });
      await vi.advanceTimersByTimeAsync(10);
    });

    return hook;
  };

  describe('Set Model', () => {
    it('sends setModel message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.setModel('default', 'anthropic', 'claude-opus-4');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const modelMsg = messages.find(m => m.type === 'setModel');
      expect(modelMsg).toBeDefined();
      expect(modelMsg?.provider).toBe('anthropic');
      expect(modelMsg?.modelId).toBe('claude-opus-4');
    });

    it('receives updated state after model change', async () => {
      const { result } = await setupWorkspace();

      const newState = {
        ...mockSessionState,
        model: { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic' },
      };

      await act(async () => {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: newState,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.model?.id).toBe('claude-opus-4');
    });
  });

  describe('Set Thinking Level', () => {
    it('sends setThinkingLevel message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.setThinkingLevel('default', 'high');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const thinkingMsg = messages.find(m => m.type === 'setThinkingLevel');
      expect(thinkingMsg).toBeDefined();
      expect(thinkingMsg?.level).toBe('high');
    });

    it('receives updated state after thinking level change', async () => {
      const { result } = await setupWorkspace();

      const newState = { ...mockSessionState, thinkingLevel: 'high' as const };

      await act(async () => {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: newState,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.thinkingLevel).toBe('high');
    });
  });

  describe('Models List', () => {
    it('receives models event', async () => {
      const { result } = await setupWorkspace();

      expect(result.current.workspaces[0].models).toEqual(mockModels);
    });

    it('updates models list on models event', async () => {
      const { result } = await setupWorkspace();

      const newModels: ModelInfo[] = [
        ...mockModels,
        { provider: 'google', id: 'gemini-pro', name: 'Gemini Pro' },
      ];

      await act(async () => {
        ws!.simulateMessage({
          type: 'models',
          workspaceId: 'ws-1',
          models: newModels,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].models.length).toBe(4);
    });
  });

  describe('Scoped Models', () => {
    it('sends getScopedModels message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.getScopedModels('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const scopedMsg = messages.find(m => m.type === 'getScopedModels');
      expect(scopedMsg).toBeDefined();
    });

    it('sends setScopedModels message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      const scopedModels = [
        { provider: 'anthropic', modelId: 'claude-sonnet-4', thinkingLevel: 'off' as const },
        { provider: 'anthropic', modelId: 'claude-opus-4', thinkingLevel: 'high' as const },
      ];

      await act(async () => {
        result.current.setScopedModels('default', scopedModels);
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const scopedMsg = messages.find(m => m.type === 'setScopedModels');
      expect(scopedMsg).toBeDefined();
      expect(scopedMsg?.models).toEqual(scopedModels);
    });
  });
});
