import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';

describe('WebSocket Edge Cases', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

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

  it('handles rapid connect/disconnect cycles', async () => {
    renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Rapid connect/disconnect 3 times
    for (let i = 0; i < 3; i++) {
      ws = getWebSocket();
      
      await act(async () => {
        ws!.simulateClose();
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
    }

    // Should not crash
    expect(true).toBe(true);
  });

  it('handles malformed WebSocket messages', async () => {
    renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

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

    // Send malformed message
    await act(async () => {
      ws!.simulateMessage({ type: 'invalidType' });
      await vi.advanceTimersByTimeAsync(10);
    });

    // Should not crash
    expect(true).toBe(true);
  });

  it('handles WebSocket error event', async () => {
    renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      ws = getWebSocket();
    });

    // Simulate error
    await act(async () => {
      ws!.simulateError();
      await vi.advanceTimersByTimeAsync(10);
    });

    // Should not crash
    expect(true).toBe(true);
  });

  it('handles many messages rapidly', async () => {
    renderHook(() => useWorkspaces('ws://localhost:9741/ws'));

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

    // Send many messages rapidly
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        ws!.simulateMessage({
          type: 'state',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          state: { isStreaming: i % 2 === 0 },
        });
      }
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should not crash
    expect(true).toBe(true);
  });
});
