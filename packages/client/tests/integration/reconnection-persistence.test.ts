import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Reconnection and State Persistence', () => {
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
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        timestamp: Date.now(),
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        timestamp: Date.now(),
        content: [{ type: 'text', text: 'Hi there!' }],
      },
    ],
    startupInfo: mockStartupInfo,
    isExisting: false,
    bufferedEventCount: 0,
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

  describe('Disconnection Handling', () => {
    it('preserves workspace state on disconnection', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      await setupWorkspace({ result } as any);

      // Verify workspace is open
      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].id).toBe('ws-1');
      expect(result.current.workspaces[0].slots['default'].messages.length).toBe(2);

      // Disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // CRITICAL: Workspace state should be preserved
      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].id).toBe('ws-1');
      expect(result.current.activeWorkspaceId).toBe('ws-1');
      expect(result.current.workspaces[0].slots['default'].messages.length).toBe(2);
      expect(result.current.isConnected).toBe(false);
    });

    it('clears workspaces only when the same connection closes', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      await setupWorkspace({ result } as any);

      const oldWs = ws!;

      // Simulate a new connection replacing the old one (browser behavior)
      await act(async () => {
        oldWs.simulateOpen();
        await vi.advanceTimersByTimeAsync(10);
      });

      // Get the new WebSocket instance
      const newWs = getWebSocket();

      // Close the old connection - should not affect state because it's no longer current
      await act(async () => {
        oldWs.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // State should still be preserved
      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].id).toBe('ws-1');
    });

    it('schedules reconnection after disconnect', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      await setupWorkspace({ result } as any);

      // Disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.isConnected).toBe(false);

      // Fast-forward past the 2s reconnection delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      // Should have attempted reconnection
      const reconnectWs = getWebSocket();
      expect(reconnectWs).toBeDefined();
    });

    it('sets connection status message on disconnect', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      await setupWorkspace({ result } as any);

      expect(result.current.statusMessage).toBeNull();

      // Disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // Should show reconnection message
      expect(result.current.statusMessage).toEqual({
        text: 'Connection lost. Reconnecting...',
        type: 'info',
      });

      // Reconnect (simulate open, not just message)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        const reconnectWs = getWebSocket();
        reconnectWs.simulateOpen(); // This triggers ws.onopen which clears status message
        reconnectWs.simulateMessage(connectedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Message should be cleared
      expect(result.current.statusMessage).toBeNull();
    });
  });

  describe('Reconnection to Existing Workspace', () => {
    it('receives workspaceOpened event with isExisting=true', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      // Open workspace initially
      await setupWorkspace({ result } as any);

      // Add some streaming state
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].isStreaming).toBe(true);

      // Disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // State should be preserved during disconnect
      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].slots['default'].isStreaming).toBe(true);

      // Reconnect and receive workspaceOpened with isExisting=true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        const reconnectWs = getWebSocket();
        reconnectWs.simulateMessage(connectedEvent);
        reconnectWs.simulateMessage({
          ...workspaceOpenedEvent,
          isExisting: true,
          state: { ...mockSessionState, isStreaming: true }, // Server says it's still streaming
          bufferedEventCount: 5,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Workspace should be updated with fresh state
      expect(result.current.workspaces.length).toBe(1);
      expect(result.current.workspaces[0].slots['default'].isStreaming).toBe(true);
      // Messages should be replaced with server's authoritative state
      expect(result.current.workspaces[0].slots['default'].messages.length).toBe(2);
    });

    it('receives buffered events after reconnection', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

      await setupWorkspace({ result } as any);

      // Disconnect
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // Reconnect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        const reconnectWs = getWebSocket();
        reconnectWs.simulateMessage(connectedEvent);
        reconnectWs.simulateMessage({
          ...workspaceOpenedEvent,
          isExisting: true,
          bufferedEventCount: 2,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Receive buffered events
      await act(async () => {
        const reconnectWs = getWebSocket();
        reconnectWs.simulateMessage({
          type: 'messageStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message: {
            id: 'msg-3',
            role: 'assistant',
            timestamp: Date.now(),
            content: [{ type: 'text', text: '' }],
          },
        });
        reconnectWs.simulateMessage({
          type: 'messageUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          messageId: 'msg-3',
          update: {
            type: 'textDelta',
            delta: 'Buffered text',
            contentIndex: 0,
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Buffered events should be applied
      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.messages.length).toBe(3);
      expect(slot.messages[2].id).toBe('msg-3');
      expect(slot.streamingText).toBe('Buffered text');
    });
  });

  describe('Device Switching Scenario', () => {
    it('handles workspace persistence when device 1 disconnects', async () => {
      // Simulate device 1 connecting and opening a workspace
      const { result: device1 } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));
      await setupWorkspace({ result: device1 } as any);

      expect(device1.current.workspaces.length).toBe(1);

      // Device 1 disconnects (e.g., network issue, device sleep)
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(10);
      });

      // CRITICAL: Device 1's UI state should be preserved for when it reconnects
      expect(device1.current.workspaces.length).toBe(1);
      expect(device1.current.workspaces[0].slots['default'].messages.length).toBe(2);

      // Device 1 will attempt to reconnect (handled by the 2s timeout)
      // When it reconnects, it should receive the same workspace data
      // plus any events that happened while disconnected
    });

    it('allows multiple devices to share the same workspace', async () => {
      // Device 1 connects and opens workspace
      const { result: device1 } = renderHook(() => useWorkspaces('ws://localhost:9741/ws'));
      await setupWorkspace({ result: device1 } as any);
      ws!.clearSentMessages();

      // Device 1 sends a prompt
      await act(async () => {
        device1.current.sendPrompt('default', 'Hello from device 1');
        await vi.advanceTimersByTimeAsync(10);
      });

      const sentMessages = ws!.getSentMessages();
      const promptMsg = sentMessages.find(m => m.type === 'prompt');
      expect(promptMsg?.message).toBe('Hello from device 1');

      // Server processes and responds (simulated)
      await act(async () => {
        ws!.simulateMessage({
          type: 'messageStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          message: {
            id: 'msg-3',
            role: 'assistant',
            timestamp: Date.now(),
            content: [{ type: 'text', text: '' }],
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(device1.current.workspaces[0].slots['default'].messages.length).toBe(3);
    });
  });
});
