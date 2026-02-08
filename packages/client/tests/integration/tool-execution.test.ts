import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo } from '@pi-deck/shared';

describe('Tool Execution Integration', () => {
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

  describe('Tool Start', () => {
    it('receives toolStart event and tracks execution', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/src/file.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.activeToolExecutions.length).toBe(1);
      expect(slot.activeToolExecutions[0].toolCallId).toBe('call-1');
      expect(slot.activeToolExecutions[0].toolName).toBe('Read');
      expect(slot.activeToolExecutions[0].status).toBe('running');
    });

    it('tracks multiple concurrent tools', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/file1.ts' },
        });
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-2',
          toolName: 'Read',
          args: { path: '/file2.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.activeToolExecutions.length).toBe(2);
    });
  });

  describe('Tool Update', () => {
    it('receives toolUpdate event with partial result', async () => {
      const { result } = await setupWorkspace();

      // Start tool
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/file.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Update with partial result
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolUpdate',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          partialResult: 'const x = 1;',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      const tool = slot.activeToolExecutions.find(t => t.toolCallId === 'call-1');
      expect(tool?.result).toBe('const x = 1;');
    });
  });

  describe('Tool End', () => {
    it('removes tool from activeToolExecutions on toolEnd', async () => {
      const { result } = await setupWorkspace();

      // Start tool
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/file.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].activeToolExecutions.length).toBe(1);

      // End with result - tool is removed (result goes into message content)
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          result: 'File contents here',
          isError: false,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Tool should be removed from active executions
      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.activeToolExecutions.length).toBe(0);
    });

    it('removes correct tool when multiple are running', async () => {
      const { result } = await setupWorkspace();

      // Start multiple tools
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/file1.ts' },
        });
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-2',
          toolName: 'Read',
          args: { path: '/file2.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].activeToolExecutions.length).toBe(2);

      // End first tool
      await act(async () => {
        ws!.simulateMessage({
          type: 'toolEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          result: 'Contents 1',
          isError: false,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.activeToolExecutions.length).toBe(1);
      expect(slot.activeToolExecutions[0].toolCallId).toBe('call-2');
    });
  });

  describe('Tool Lifecycle', () => {
    it('clears tool executions on agentEnd', async () => {
      const { result } = await setupWorkspace();

      // Start tools
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/file.ts' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].activeToolExecutions.length).toBe(1);

      // End agent turn
      await act(async () => {
        ws!.simulateMessage({
          type: 'agentEnd',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.activeToolExecutions.length).toBe(0);
    });
  });

  describe('Common Tool Patterns', () => {
    it('handles Read tool execution', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'read-1',
          toolName: 'Read',
          args: { path: '/src/index.ts', limit: 100 },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      const tool = slot.activeToolExecutions[0];
      expect(tool.toolName).toBe('Read');
      expect(tool.args).toEqual({ path: '/src/index.ts', limit: 100 });
    });

    it('handles Write tool execution', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'write-1',
          toolName: 'Write',
          args: { path: '/src/new.ts', content: 'export const x = 1;' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const tool = result.current.workspaces[0].slots['default'].activeToolExecutions[0];
      expect(tool.toolName).toBe('Write');
    });

    it('handles Bash tool execution', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'bash-1',
          toolName: 'Bash',
          args: { command: 'npm test' },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const tool = result.current.workspaces[0].slots['default'].activeToolExecutions[0];
      expect(tool.toolName).toBe('Bash');
      expect(tool.args).toEqual({ command: 'npm test' });
    });

    it('handles Edit tool execution', async () => {
      const { result } = await setupWorkspace();

      await act(async () => {
        ws!.simulateMessage({
          type: 'toolStart',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          toolCallId: 'edit-1',
          toolName: 'Edit',
          args: { 
            path: '/src/file.ts',
            oldText: 'const x = 1',
            newText: 'const x = 2',
          },
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const tool = result.current.workspaces[0].slots['default'].activeToolExecutions[0];
      expect(tool.toolName).toBe('Edit');
    });
  });
});
