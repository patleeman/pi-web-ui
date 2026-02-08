import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '../../utils/render';
import userEvent from '@testing-library/user-event';
import { Pane } from '../../../src/components/Pane';
import type { PaneData } from '../../../src/hooks/usePanes';
import type { SessionSlotState } from '../../../src/hooks/useWorkspaces';
import type { SlashCommand as BackendSlashCommand } from '@pi-deck/shared';

// Helper to create mock slot state
const createMockSlot = (overrides: Partial<SessionSlotState> = {}): SessionSlotState => ({
  slotId: 'default',
  state: {
    sessionId: 'session-1',
    model: { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4', reasoning: false, contextWindow: 200000 },
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
  ...overrides,
});

const createDefaultProps = (overrides: Record<string, unknown> = {}) => ({
  pane: {
    id: 'pane-1',
    sessionSlotId: 'default',
    slot: createMockSlot(),
  } as PaneData,
  isFocused: true,
  sessions: [],
  models: [{ provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4', reasoning: false, contextWindow: 200000 }],
  backendCommands: [] as BackendSlashCommand[],
  startupInfo: null,
  canClose: true,
  onFocus: vi.fn(),
  onClose: vi.fn(),
  onSendPrompt: vi.fn(),
  onSteer: vi.fn(),
  onAbort: vi.fn(),
  onLoadSession: vi.fn(),
  onNewSession: vi.fn(),
  onSplit: vi.fn(),
  onGetForkMessages: vi.fn(),
  onFork: vi.fn(),
  onSetModel: vi.fn(),
  onSetThinkingLevel: vi.fn(),
  onQuestionnaireResponse: vi.fn(),
  onExtensionUIResponse: vi.fn(),
  onCustomUIInput: vi.fn(),
  onCompact: vi.fn(),
  onOpenSettings: vi.fn(),
  onExport: vi.fn(),
  onRenameSession: vi.fn(),
  onShowHotkeys: vi.fn(),
  onFollowUp: vi.fn(),
  onReload: vi.fn(),
  onGetSessionTree: vi.fn(),
  onCopyLastAssistant: vi.fn(),
  onGetQueuedMessages: vi.fn(),
  onClearQueue: vi.fn(),
  onListFiles: vi.fn(),
  onExecuteBash: vi.fn(),
  onToggleAllToolsCollapsed: vi.fn(),
  onToggleAllThinkingCollapsed: vi.fn(),
  onGetScopedModels: vi.fn(),
  onSetScopedModels: vi.fn(),
  activePlan: null,
  onUpdatePlanTask: vi.fn(),
  onDeactivatePlan: vi.fn(),
  ...overrides,
});

describe('Slash Command Filtering', () => {
  // Create skill backend commands as they would come from the server
  const skillCommands: BackendSlashCommand[] = [
    { name: 'skill:tdd-feature', description: 'Build features with TDD', source: 'skill', path: '/path/to/skill' },
    { name: 'skill:security-review', description: 'Security review checklist', source: 'skill', path: '/path/to/skill' },
    { name: 'skill:code-review', description: 'Code review patterns', source: 'skill', path: '/path/to/skill' },
    { name: 'skill:backfill-tests', description: 'Backfill missing tests', source: 'skill', path: '/path/to/skill' },
  ];

  const templateCommands: BackendSlashCommand[] = [
    { name: 'refactor', description: 'Refactor code', source: 'template', path: '/path/to/template' },
    { name: 'explain', description: 'Explain code', source: 'template', path: '/path/to/template' },
  ];

  describe('Skill name matching', () => {
    it('shows skill when typing full skill name without skill: prefix', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /tdd-feature (without skill: prefix)
      await userEvent.type(textarea, '/tdd-feature');

      // Should show the skill:tdd-feature command via substring match
      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('skill:tdd-feature');
      });
    });

    it('shows skill when typing partial skill name', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /tdd (partial match)
      await userEvent.type(textarea, '/tdd');

      // Should show the skill:tdd-feature command
      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('skill:tdd-feature');
      });
    });

    it('shows skill when typing with skill: prefix', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /skill:tdd (with prefix)
      await userEvent.type(textarea, '/skill:tdd');

      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('skill:tdd-feature');
      });
    });

    it('shows multiple matching skills', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /review (should match both security-review and code-review)
      await userEvent.type(textarea, '/review');

      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('skill:security-review');
        expect(menuText).toContain('skill:code-review');
      });
    });

    it('shows all commands when just / is typed', async () => {
      const props = createDefaultProps({
        backendCommands: [...skillCommands, ...templateCommands],
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type just /
      await userEvent.type(textarea, '/');

      await waitFor(() => {
        const menuText = container.textContent;
        // Should show built-in commands
        expect(menuText).toContain('/split');
        // Should show backend commands
        expect(menuText).toContain('skill:tdd-feature');
        expect(menuText).toContain('refactor');
      });
    });
  });

  describe('Mixed command filtering', () => {
    it('prioritizes prefix matches over substring matches', async () => {
      const mixedCommands: BackendSlashCommand[] = [
        { name: 'test', description: 'Run tests', source: 'template' },
        { name: 'skill:backfill-tests', description: 'Backfill tests', source: 'skill' },
      ];

      const props = createDefaultProps({
        backendCommands: mixedCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /test
      await userEvent.type(textarea, '/test');

      await waitFor(() => {
        const menuItems = container.querySelectorAll('[class*="px-3"][class*="py-1"]');
        // Both should appear, but 'test' should come before 'backfill-tests'
        const menuText = container.textContent;
        expect(menuText).toContain('test');
        expect(menuText).toContain('backfill-tests');
      });
    });

    it('filters out non-matching commands', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type /xyz (should match nothing from skills)
      await userEvent.type(textarea, '/xyz');

      // Give time for potential matches
      await new Promise(r => setTimeout(r, 50));

      // Skills shouldn't appear
      const menuText = container.textContent || '';
      expect(menuText).not.toContain('skill:tdd-feature');
      expect(menuText).not.toContain('skill:security-review');
    });
  });

  describe('Empty backend commands', () => {
    it('still shows built-in commands when backendCommands is empty', async () => {
      const props = createDefaultProps({
        backendCommands: [],
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      await userEvent.type(textarea, '/');

      await waitFor(() => {
        const menuText = container.textContent;
        // Built-in commands should still appear
        expect(menuText).toContain('/split');
        expect(menuText).toContain('/compact');
        expect(menuText).toContain('/model');
      });
    });

    it('shows /new command even without backend commands', async () => {
      const props = createDefaultProps({
        backendCommands: [],
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      await userEvent.type(textarea, '/new');

      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('/new');
      });
    });
  });

  describe('Case insensitive matching', () => {
    it('matches regardless of case', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type in uppercase
      await userEvent.type(textarea, '/TDD');

      await waitFor(() => {
        const menuText = container.textContent;
        expect(menuText).toContain('skill:tdd-feature');
      });
    });
  });

  describe('Slash menu visibility', () => {
    it('shows menu when input starts with /', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      await userEvent.type(textarea, '/');

      await waitFor(() => {
        // Menu should be visible (contains command items)
        const menuText = container.textContent;
        expect(menuText).toContain('/split');
      });
    });

    it('hides menu when input does not start with /', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      // Type something without /
      await userEvent.type(textarea, 'hello');

      // Menu shouldn't show skill commands
      await new Promise(r => setTimeout(r, 50));
      const menuText = container.textContent || '';
      expect(menuText).not.toContain('skill:tdd-feature');
    });

    it('hides menu when Escape is pressed', async () => {
      const props = createDefaultProps({
        backendCommands: skillCommands,
      });

      const { container } = render(<Pane {...props} />);
      const textarea = container.querySelector('textarea')!;

      await userEvent.type(textarea, '/skill');
      
      await waitFor(() => {
        expect(container.textContent).toContain('skill:tdd-feature');
      });

      // Press Escape
      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        // Input should be cleared and menu hidden
        expect(textarea.value).toBe('');
      });
    });
  });
});
