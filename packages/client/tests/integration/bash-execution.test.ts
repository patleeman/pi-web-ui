import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Bash Execution Integration', () => {
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

  describe('Send Bash Command', () => {
    it('sends bash message with command', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.executeBash('default', 'ls -la');
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const bashMsg = messages.find(m => m.type === 'bash');
      expect(bashMsg).toBeDefined();
      expect(bashMsg?.command).toBe('ls -la');
    });

    it('sets bash execution immediately for feedback', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        result.current.executeBash('default', 'ls -la');
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution?.command).toBe('ls -la');
      expect(slot.bashExecution?.isRunning).toBe(true);
      expect(slot.bashExecution?.excludeFromContext).toBe(false);
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.command).toBe('ls -la');
      expect(bashMessage?.exitCode).toBeNull();
    });

    it('sends bash message with excludeFromContext flag', async () => {
      const { result } = await setupWorkspace();
      ws!.clearSentMessages();

      await act(async () => {
        result.current.executeBash('default', 'npm test', true);
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const bashMsg = messages.find(m => m.type === 'bash');
      expect(bashMsg?.excludeFromContext).toBe(true);
    });
  });

  describe('Bash Start', () => {
    it('receives bashStart event', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'npm test',
          excludeFromContext: false,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution).not.toBeNull();
      expect(slot.bashExecution?.command).toBe('npm test');
      expect(slot.bashExecution?.isRunning).toBe(true);
      expect(slot.bashExecution?.output).toBe('');
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.command).toBe('npm test');
      expect(bashMessage?.exitCode).toBeNull();
    });

    it('sets excludeFromContext flag', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'cat /var/log/huge.log',
          excludeFromContext: true,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution?.excludeFromContext).toBe(true);
    });
  });

  describe('Bash Output', () => {
    it('receives bashOutput event and accumulates output', async () => {
      const { result } = await setupWorkspace();

      // Start bash
      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'echo hello',
          excludeFromContext: false,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Receive output (uses 'chunk' not 'output')
      await act(async () => {
        ws!.simulateMessage({
          type: 'bashOutput',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          chunk: 'hello\n',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution?.output).toBe('hello\n');
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.output).toBe('hello\n');
    });

    it('accumulates multiple output chunks', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'npm test',
          excludeFromContext: false,
        });
        ws!.simulateMessage({
          type: 'bashOutput',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          chunk: 'Running tests...\n',
        });
        ws!.simulateMessage({
          type: 'bashOutput',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          chunk: 'Test 1 passed\n',
        });
        ws!.simulateMessage({
          type: 'bashOutput',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          chunk: 'Test 2 passed\n',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution?.output).toBe('Running tests...\nTest 1 passed\nTest 2 passed\n');
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.output).toBe('Running tests...\nTest 1 passed\nTest 2 passed\n');
    });
  });

  describe('Bash End', () => {
    it('receives bashEnd event with exit code 0 (success)', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'echo hello',
          excludeFromContext: false,
        });
        ws!.simulateMessage({
          type: 'bashOutput',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          chunk: 'hello\n',
        });
        ws!.simulateMessage({
          type: 'bashEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          result: {
            stdout: 'hello\n',
            stderr: '',
            exitCode: 0,
            signal: null,
            timedOut: false,
            truncated: false,
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.bashExecution).toBeNull();
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.command).toBe('echo hello');
      expect(bashMessage?.exitCode).toBe(0);
      expect(bashMessage?.isError).toBe(false);
    });

    it('receives bashEnd event with non-zero exit code (error)', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'exit 1',
          excludeFromContext: false,
        });
        ws!.simulateMessage({
          type: 'bashEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          result: {
            stdout: '',
            stderr: 'Error: command failed',
            exitCode: 1,
            signal: null,
            timedOut: false,
            truncated: false,
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.exitCode).toBe(1);
      expect(bashMessage?.isError).toBe(true);
    });

    it('falls back to stdout/stderr when no bashOutput chunks arrive', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'echo hello',
          excludeFromContext: false,
        });
        ws!.simulateMessage({
          type: 'bashEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          result: {
            stdout: 'hello\n',
            stderr: '',
            exitCode: 0,
            signal: null,
            timedOut: false,
            truncated: false,
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      const bashMessage = slot.messages.find(m => m.role === 'bashExecution');
      expect(bashMessage?.output).toBe('hello\n');
    });
  });

  describe('Bash Lifecycle', () => {
    it('clears bash execution on messages event (session switch)', async () => {
      const { result } = await setupWorkspace();

      // Start bash
      await act(async () => {
        ws!.simulateMessage({
          type: 'bashStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          command: 'sleep 10',
          excludeFromContext: false,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].bashExecution).not.toBeNull();

      // Receive messages event (e.g., from session switch)
      await act(async () => {
        ws!.simulateMessage({
          type: 'messages',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].bashExecution).toBeNull();
    });
  });
});
