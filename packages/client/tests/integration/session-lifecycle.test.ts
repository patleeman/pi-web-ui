import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo, ChatMessage } from '@pi-deck/shared';

describe('Session Lifecycle Integration', () => {
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
    const hook = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));
    
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

  describe('Create Session', () => {
    it('sends newSession message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.newSession('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const newSessionMsg = messages.find(m => m.type === 'newSession');
      expect(newSessionMsg).toBeDefined();
      expect(newSessionMsg?.sessionSlotId).toBe('default');
    });
  });

  describe('Prompt Flow', () => {
    it('sends prompt and receives agentStart', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.sendPrompt('default', 'Hello, Claude!');
        await vi.advanceTimersByTimeAsync(10);
      });

      // Verify prompt was sent
      const messages = ws!.getSentMessages();
      const promptMsg = messages.find(m => m.type === 'prompt');
      expect(promptMsg).toBeDefined();
      expect(promptMsg?.message).toBe('Hello, Claude!');

      // Simulate agentStart
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.isStreaming).toBe(true);
    });

    it('receives streaming text updates', async () => {
      const { result } = await setupWorkspace();

      // Start streaming
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Receive streaming text
      await act(async () => {
        ws!.simulateMessage({
          type: 'messageUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          update: { type: 'textDelta', delta: 'Hello, ' },
        });
        // Wait for streaming throttle (50ms) + flush
        await vi.advanceTimersByTimeAsync(60);
      });

      let slot = result.current.workspaces[0].slots['default'];
      expect(slot.streamingText).toBe('Hello, ');

      // Receive more text
      await act(async () => {
        ws!.simulateMessage({
          type: 'messageUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          update: { type: 'textDelta', delta: 'how can I help?' },
        });
        // Wait for streaming throttle (50ms) + flush
        await vi.advanceTimersByTimeAsync(60);
      });

      slot = result.current.workspaces[0].slots['default'];
      expect(slot.streamingText).toBe('Hello, how can I help?');
    });

    it('receives streaming thinking updates', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      await act(async () => {
        ws!.simulateMessage({
          type: 'messageUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          update: { type: 'thinkingDelta', delta: 'Let me think about this...' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      await waitFor(() => {
        const slot = result.current.workspaces[0].slots['default'];
        expect(slot.streamingThinking).toBe('Let me think about this...');
      });
    });

    it('receives agentEnd and clears streaming state', async () => {
      const { result } = await setupWorkspace();

      // Start streaming
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        ws!.simulateMessage({
          type: 'messageUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          update: { type: 'textDelta', delta: 'Some text' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].isStreaming).toBe(true);

      // End streaming
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.isStreaming).toBe(false);
      expect(slot.streamingText).toBe('');
    });
  });

  describe('Message Events', () => {
    it('receives messageStart event', async () => {
      const { result } = await setupWorkspace();

      const userMessage: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      };

      await act(async () => {
        ws!.simulateMessage({
          type: 'messageStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message: userMessage,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.messages.length).toBe(1);
      expect(slot.messages[0].id).toBe('msg-1');
    });

    it('receives messageEnd event', async () => {
      const { result } = await setupWorkspace();

      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, human!' }],
      };

      await act(async () => {
        ws!.simulateMessage({
          type: 'messageStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message: { ...message, content: [] },
        });
        ws!.simulateMessage({
          type: 'messageEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.messages.length).toBe(1);
      expect(slot.messages[0].content).toEqual([{ type: 'text', text: 'Hello, human!' }]);
    });
  });

  describe('Switch Session', () => {
    it('sends switchSession message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.switchSession('default', 'other-session.json');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const switchMsg = messages.find(m => m.type === 'switchSession');
      expect(switchMsg).toBeDefined();
      expect(switchMsg?.sessionId).toBe('other-session.json');
    });

    it('receives new state after switching', async () => {
      const { result } = await setupWorkspace();

      const newState = {
        ...mockSessionState,
        sessionId: 'session-2',
        sessionFile: '/path/to/other.json',
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
      expect(slot.state?.sessionId).toBe('session-2');
    });
  });

  describe('Abort', () => {
    it('sends abort message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.abort('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const abortMsg = messages.find(m => m.type === 'abort');
      expect(abortMsg).toBeDefined();
    });
  });

  describe('Compaction', () => {
    it('sends compact message', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.compact('default');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const compactMsg = messages.find(m => m.type === 'compact');
      expect(compactMsg).toBeDefined();
    });

    it('receives compactionStart event', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'compactionStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Should update state to show compacting
      // The actual state update happens via state event
    });
  });
});
