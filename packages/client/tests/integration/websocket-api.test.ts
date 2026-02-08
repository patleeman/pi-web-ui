import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('WebSocket API Integration', () => {
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

  const connectedEvent = {
    type: 'connected' as const,
    workspaces: [] as WorkspaceInfo[],
    allowedRoots: ['/home'],
    homeDirectory: '/home',
    recentWorkspaces: [] as string[],
    uiState: null,
  };

  const workspaceOpenedEvent = {
    type: 'workspaceOpened' as const,
    workspace: mockWorkspaceInfo,
    state: mockSessionState,
    messages: [],
    startupInfo: mockStartupInfo,
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

  const setupWorkspace = async (hook: ReturnType<typeof renderHook<ReturnType<typeof useWorkspaces>, unknown>>) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      ws = getWebSocket();
      ws.simulateMessage(connectedEvent);
      ws.simulateMessage(workspaceOpenedEvent);
      await vi.advanceTimersByTimeAsync(10);
    });
    return ws!;
  };

  describe('Connection', () => {
    it('connects to WebSocket server', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      ws = getWebSocket();
      expect(ws.url).toBe('ws://localhost:3001/ws');
      expect(ws.readyState).toBe(MockWebSocket.OPEN);
    });

    it('receives connected event with initial state', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.allowedRoots).toEqual(['/home']);
    });

    it('handles disconnection', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.isConnected).toBe(true);

      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Workspace Operations', () => {
    it('sends openWorkspace message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      await act(async () => {
        result.current.openWorkspace('/home/user/project');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const openMsg = messages.find(m => m.type === 'openWorkspace');
      expect(openMsg).toBeDefined();
      expect(openMsg?.path).toBe('/home/user/project');
    });

    it('receives workspaceOpened event', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);

      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].path).toBe('/home/user/project');
      expect(result.current.activeWorkspaceId).toBe('ws-1');
    });

    it('sends closeWorkspace message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);
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
  });

  describe('Directory Browsing', () => {
    it('sends browseDirectory message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      ws!.clearSentMessages();

      await act(async () => {
        result.current.browseDirectory('/home/user');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const browseMsg = messages.find(m => m.type === 'browseDirectory');
      expect(browseMsg).toBeDefined();
      expect(browseMsg?.path).toBe('/home/user');
    });

    it('receives directoryList event', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      await act(async () => {
        ws!.simulateMessage({
          type: 'directoryList',
          path: '/home/user',
          entries: [
            { name: 'project', isDirectory: true, path: '/home/user/project' },
            { name: 'file.txt', isDirectory: false, path: '/home/user/file.txt' },
          ],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.currentBrowsePath).toBe('/home/user');
      expect(result.current.directoryEntries.length).toBe(2);
    });
  });

  describe('Session State', () => {
    it('receives state event and updates slot', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);

      const updatedState = { ...mockSessionState, isStreaming: true };

      await act(async () => {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: updatedState,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.state?.isStreaming).toBe(true);
      expect(slot.isStreaming).toBe(true);
    });
  });

  describe('Model Operations', () => {
    it('sends setModel message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);
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

    it('sends setThinkingLevel message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);
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
  });

  describe('Prompt and Streaming', () => {
    it('sends prompt message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);
      ws!.clearSentMessages();

      await act(async () => {
        result.current.sendPrompt('default', 'Hello world');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const promptMsg = messages.find(m => m.type === 'prompt');
      expect(promptMsg).toBeDefined();
      expect(promptMsg?.message).toBe('Hello world');
    });

    it('sends abort message', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));
      
      await setupWorkspace({ result } as any);
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
});
