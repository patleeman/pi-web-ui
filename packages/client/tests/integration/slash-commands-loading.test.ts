import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/hooks/useWorkspaces';
import { MockWebSocket, installMockWebSocket } from '../mocks/websocket';
import type { SessionState, WorkspaceInfo, StartupInfo, SlashCommand } from '@pi-web-ui/shared';

describe('Slash Commands Loading', () => {
  let MockWS: ReturnType<typeof installMockWebSocket>;
  let ws: MockWebSocket | null;

  const mockSessionState: SessionState = {
    sessionId: 'session-1',
    sessionFile: '/path/to/session.json',
    model: { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic', reasoning: false, contextWindow: 200000 },
    thinkingLevel: 'off',
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    steeringMode: 'all',
    followUpMode: 'all',
    messageCount: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    contextWindowPercent: 0,
    git: { branch: 'main', changedFiles: 0 },
  };

  const mockWorkspaceInfo: WorkspaceInfo = {
    id: 'ws-1',
    path: '/home/user/project',
    name: 'project',
    isActive: true,
    state: null,
  };

  const mockStartupInfo: StartupInfo = {
    version: '1.0.0',
    contextFiles: [],
    extensions: [],
    themes: [],
    skills: [
      { name: 'tdd-feature', path: '/skills/tdd-feature', description: 'Build with TDD', scope: 'user' as const },
      { name: 'security-review', path: '/skills/security-review', description: 'Security audit', scope: 'user' as const },
    ],
    shortcuts: [],
  };

  const mockCommands: SlashCommand[] = [
    { name: 'skill:tdd-feature', description: 'Build features with TDD', source: 'skill' as const, path: '/skills/tdd-feature' },
    { name: 'skill:security-review', description: 'Security review checklist', source: 'skill' as const, path: '/skills/security-review' },
    { name: 'refactor', description: 'Refactor code', source: 'template' as const, path: '/templates/refactor' },
  ];

  const connectedEvent = {
    type: 'connected' as const,
    workspaces: [] as WorkspaceInfo[],
    allowedRoots: ['/home'],
    homeDirectory: '/home',
    uiState: {
      openWorkspaces: [],
      activeWorkspacePath: null,
      draftInputs: {},
      sidebarWidth: 224,
      themeId: null,
      activeSessions: {},
      activeModels: {},
      thinkingLevels: {},
      rightPaneByWorkspace: {},
    },
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

  describe('Commands loading on workspace open', () => {
    it('requests commands when workspace opens', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const getCommandsMsg = messages.find(m => m.type === 'getCommands');
      expect(getCommandsMsg).toBeDefined();
      expect(getCommandsMsg?.workspaceId).toBe('ws-1');
      expect(getCommandsMsg?.sessionSlotId).toBe('default');
    });

    it('stores commands when received', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Simulate server sending commands
      await act(async () => {
        ws!.simulateMessage({
          type: 'commands',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          commands: mockCommands,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      expect(slot.commands).toHaveLength(3);
      expect(slot.commands.map(c => c.name)).toContain('skill:tdd-feature');
      expect(slot.commands.map(c => c.name)).toContain('skill:security-review');
      expect(slot.commands.map(c => c.name)).toContain('refactor');
    });
  });

  describe('Commands loading for new session slots (split pane)', () => {
    it('requests commands when new slot is created', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Clear messages to see only new ones
      ws!.clearSentMessages();

      // Simulate new slot creation (split pane)
      await act(async () => {
        ws!.simulateMessage({
          type: 'sessionSlotCreated',
          workspaceId: 'ws-1',
          sessionSlotId: 'slot-2',
          state: mockSessionState,
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const messages = ws!.getSentMessages();
      const getCommandsMsg = messages.find(m => m.type === 'getCommands' && m.sessionSlotId === 'slot-2');
      expect(getCommandsMsg).toBeDefined();
      expect(getCommandsMsg?.workspaceId).toBe('ws-1');
    });

    it('copies commands from existing slot to new slot immediately', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Simulate server sending commands for default slot
      await act(async () => {
        ws!.simulateMessage({
          type: 'commands',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          commands: mockCommands,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // Verify default slot has commands
      expect(result.current.workspaces[0].slots['default'].commands).toHaveLength(3);

      // Simulate new slot creation
      await act(async () => {
        ws!.simulateMessage({
          type: 'sessionSlotCreated',
          workspaceId: 'ws-1',
          sessionSlotId: 'slot-2',
          state: mockSessionState,
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // New slot should immediately have commands copied from default slot
      const newSlot = result.current.workspaces[0].slots['slot-2'];
      expect(newSlot).toBeDefined();
      expect(newSlot.commands).toHaveLength(3);
      expect(newSlot.commands.map(c => c.name)).toContain('skill:tdd-feature');
    });

    it('new slot starts with empty commands if no existing slot has commands', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Don't send commands - simulate race condition where commands haven't loaded yet

      // Simulate new slot creation before commands are loaded
      await act(async () => {
        ws!.simulateMessage({
          type: 'sessionSlotCreated',
          workspaceId: 'ws-1',
          sessionSlotId: 'slot-2',
          state: mockSessionState,
          messages: [],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      // New slot should have empty commands initially (but server request was sent)
      const newSlot = result.current.workspaces[0].slots['slot-2'];
      expect(newSlot).toBeDefined();
      expect(newSlot.commands).toHaveLength(0);

      // Verify a getCommands request was sent for the new slot
      const messages = ws!.getSentMessages();
      const getCommandsMsg = messages.find(m => m.type === 'getCommands' && m.sessionSlotId === 'slot-2');
      expect(getCommandsMsg).toBeDefined();
    });
  });

  describe('Skills appear in commands list', () => {
    it('skills from startupInfo appear in commands with skill: prefix', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Simulate server sending commands
      await act(async () => {
        ws!.simulateMessage({
          type: 'commands',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          commands: mockCommands,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      const slot = result.current.workspaces[0].slots['default'];
      const skillCommands = slot.commands.filter(c => c.source === 'skill');
      
      expect(skillCommands.length).toBeGreaterThan(0);
      expect(skillCommands.every(c => c.name.startsWith('skill:'))).toBe(true);
    });
  });

  describe('Commands update on session switch', () => {
    it('can update commands when session changes', async () => {
      const { result } = renderHook(() => useWorkspaces('ws://localhost:3001/ws'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        ws = getWebSocket();
        ws.simulateMessage(connectedEvent);
        ws.simulateMessage(workspaceOpenedEvent);
        await vi.advanceTimersByTimeAsync(10);
      });

      // Initial commands
      await act(async () => {
        ws!.simulateMessage({
          type: 'commands',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          commands: mockCommands,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].commands).toHaveLength(3);

      // Updated commands (e.g., after session switch)
      const updatedCommands: SlashCommand[] = [
        ...mockCommands,
        { name: 'new-command', description: 'New command', source: 'extension' as const },
      ];

      await act(async () => {
        ws!.simulateMessage({
          type: 'commands',
          workspaceId: 'ws-1',
          sessionSlotId: 'default',
          commands: updatedCommands,
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.workspaces[0].slots['default'].commands).toHaveLength(4);
      expect(result.current.workspaces[0].slots['default'].commands.map(c => c.name)).toContain('new-command');
    });
  });
});
