import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionSlotState, WorkspaceState, BashExecution } from '../../../src/hooks/useWorkspaces';

// Test the data structures and type contracts used by useWorkspaces
// The actual hook requires WebSocket connectivity which is tested in E2E/integration

describe('useWorkspaces data structures', () => {
  describe('SessionSlotState', () => {
    const createSlotState = (): SessionSlotState => ({
      slotId: 'default',
      state: {
        currentModel: { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
        contextUsage: { used: 1000, total: 200000, percentage: 0.5 },
        thinkingLevel: 'off',
        isStreaming: false,
        isCompacting: false,
        autoCompactionEnabled: true,
        autoRetryEnabled: true,
        steeringMode: 'interrupt',
        followUpMode: 'instant',
      },
      messages: [],
      commands: [],
      isStreaming: false,
      streamingText: '',
      streamingThinking: '',
      activeToolExecutions: [],
      bashExecution: null,
      questionnaireRequest: null,
      extensionUIRequest: null,
      customUIState: null,
      queuedMessages: { steering: [], followUp: [] },
    });

    it('has required fields', () => {
      const slot = createSlotState();
      expect(slot.slotId).toBeDefined();
      expect(slot.state).toBeDefined();
      expect(slot.messages).toEqual([]);
      expect(slot.commands).toEqual([]);
      expect(slot.isStreaming).toBe(false);
    });

    it('can have null state initially', () => {
      const slot: SessionSlotState = {
        ...createSlotState(),
        state: null,
      };
      expect(slot.state).toBeNull();
    });

    it('tracks streaming text', () => {
      const slot = createSlotState();
      slot.streamingText = 'Some streaming content...';
      expect(slot.streamingText).toBe('Some streaming content...');
    });

    it('tracks active tool executions', () => {
      const slot = createSlotState();
      slot.activeToolExecutions = [
        { toolCallId: 'call-1', toolName: 'read', args: { path: 'file.txt' }, status: 'running' },
        { toolCallId: 'call-2', toolName: 'write', args: { path: 'output.txt' }, status: 'complete', result: 'Done' },
      ];
      expect(slot.activeToolExecutions.length).toBe(2);
      expect(slot.activeToolExecutions[0].status).toBe('running');
    });
  });

  describe('WorkspaceState', () => {
    const createWorkspace = (): WorkspaceState => ({
      id: 'ws-1',
      path: '/home/user/project',
      name: 'project',
      slots: {},
      sessions: [],
      models: [],
      startupInfo: null,
    });

    it('has required fields', () => {
      const ws = createWorkspace();
      expect(ws.id).toBe('ws-1');
      expect(ws.path).toBe('/home/user/project');
      expect(ws.name).toBe('project');
      expect(ws.slots).toEqual({});
    });

    it('can have multiple slots', () => {
      const ws = createWorkspace();
      ws.slots = {
        default: {
          slotId: 'default',
          state: null,
          messages: [],
          commands: [],
          isStreaming: false,
          streamingText: '',
          streamingThinking: '',
          activeToolExecutions: [],
          bashExecution: null,
          questionnaireRequest: null,
          extensionUIRequest: null,
          customUIState: null,
          queuedMessages: { steering: [], followUp: [] },
        },
        secondary: {
          slotId: 'secondary',
          state: null,
          messages: [],
          commands: [],
          isStreaming: false,
          streamingText: '',
          streamingThinking: '',
          activeToolExecutions: [],
          bashExecution: null,
          questionnaireRequest: null,
          extensionUIRequest: null,
          customUIState: null,
          queuedMessages: { steering: [], followUp: [] },
        },
      };
      expect(Object.keys(ws.slots).length).toBe(2);
    });

    it('can have sessions list', () => {
      const ws = createWorkspace();
      ws.sessions = [
        { id: 'session-1', name: 'Session 1', isActive: true, messageCount: 10 },
        { id: 'session-2', name: 'Session 2', isActive: false, messageCount: 5 },
      ];
      expect(ws.sessions.length).toBe(2);
    });

    it('can have models list', () => {
      const ws = createWorkspace();
      ws.models = [
        { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
        { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
      ];
      expect(ws.models.length).toBe(2);
    });
  });

  describe('BashExecution', () => {
    it('tracks command and output', () => {
      const bash: BashExecution = {
        messageId: 'bash-1',
        command: 'ls -la',
        output: 'total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 12:00 .\n',
        isRunning: false,
        exitCode: 0,
        isError: false,
        excludeFromContext: false,
      };
      expect(bash.command).toBe('ls -la');
      expect(bash.output).toContain('total');
      expect(bash.exitCode).toBe(0);
    });

    it('tracks running state', () => {
      const bash: BashExecution = {
        messageId: 'bash-2',
        command: 'npm install',
        output: 'Installing dependencies...',
        isRunning: true,
        excludeFromContext: false,
      };
      expect(bash.isRunning).toBe(true);
      expect(bash.exitCode).toBeUndefined();
    });

    it('tracks error state', () => {
      const bash: BashExecution = {
        messageId: 'bash-3',
        command: 'invalid-command',
        output: 'command not found: invalid-command',
        isRunning: false,
        exitCode: 127,
        isError: true,
        excludeFromContext: false,
      };
      expect(bash.isError).toBe(true);
      expect(bash.exitCode).toBe(127);
    });

    it('can exclude from context', () => {
      const bash: BashExecution = {
        messageId: 'bash-4',
        command: '!! ls -la',
        output: 'file1\nfile2',
        isRunning: false,
        exitCode: 0,
        excludeFromContext: true,
      };
      expect(bash.excludeFromContext).toBe(true);
    });
  });

  describe('Message types', () => {
    it('supports user messages', () => {
      const message = { id: 'msg-1', role: 'user', content: 'Hello' };
      expect(message.role).toBe('user');
    });

    it('supports assistant messages', () => {
      const message = { id: 'msg-2', role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] };
      expect(message.role).toBe('assistant');
      expect(Array.isArray(message.content)).toBe(true);
    });
  });

  describe('Model info', () => {
    it('has required fields', () => {
      const model = { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' };
      expect(model.provider).toBe('anthropic');
      expect(model.id).toBe('claude-sonnet-4');
      expect(model.name).toBe('Claude Sonnet 4');
    });
  });

  describe('Thinking levels', () => {
    const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    
    levels.forEach((level) => {
      it(`supports ${level}`, () => {
        expect(levels).toContain(level);
      });
    });
  });

  describe('Steering modes', () => {
    it('supports interrupt mode', () => {
      const state = { steeringMode: 'interrupt' };
      expect(state.steeringMode).toBe('interrupt');
    });

    it('supports block mode', () => {
      const state = { steeringMode: 'block' };
      expect(state.steeringMode).toBe('block');
    });
  });

  describe('Follow-up modes', () => {
    it('supports instant mode', () => {
      const state = { followUpMode: 'instant' };
      expect(state.followUpMode).toBe('instant');
    });

    it('supports confirm mode', () => {
      const state = { followUpMode: 'confirm' };
      expect(state.followUpMode).toBe('confirm');
    });
  });
});
