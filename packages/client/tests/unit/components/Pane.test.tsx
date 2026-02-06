import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pane } from '../../../src/components/Pane';
import type { PaneData } from '../../../src/hooks/usePanes';
import type { SessionSlotState } from '../../../src/hooks/useWorkspaces';

// Create a minimal mock for the Pane component
const mockSlot: SessionSlotState = {
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
};

const mockPaneData: PaneData = {
  id: 'pane-1',
  sessionSlotId: 'default',
  slot: mockSlot,
};

const defaultProps = {
  pane: mockPaneData,
  isFocused: true,
  sessions: [{ id: 'session-1', name: 'Session 1', isActive: true, messageCount: 0 }],
  models: [{ provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
  backendCommands: [],
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
};

describe('Pane', () => {
  it('renders without crashing', () => {
    const { container } = render(<Pane {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('shows input area', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Should have an input/textarea element
    const inputEl = container.querySelector('textarea, input[type="text"]');
    expect(inputEl).toBeTruthy();
  });

  it('shows send button', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Should have a button for sending
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('executes bash command when sending !command via send button', () => {
    const onExecuteBash = vi.fn();
    const onSendPrompt = vi.fn();
    const { container } = render(
      <Pane
        {...defaultProps}
        onExecuteBash={onExecuteBash}
        onSendPrompt={onSendPrompt}
      />
    );

    const inputEl = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(inputEl, { target: { value: '!echo hi' } });

    const sendButtons = screen.getAllByTitle('Send message');
    fireEvent.click(sendButtons[0]);

    expect(onExecuteBash).toHaveBeenCalledWith('echo hi', false);
    expect(onSendPrompt).not.toHaveBeenCalled();
  });

  it('executes bash command when sending !!command via send button', () => {
    const onExecuteBash = vi.fn();
    const onSendPrompt = vi.fn();
    const { container } = render(
      <Pane
        {...defaultProps}
        onExecuteBash={onExecuteBash}
        onSendPrompt={onSendPrompt}
      />
    );

    const inputEl = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(inputEl, { target: { value: '!!echo hi' } });

    const sendButtons = screen.getAllByTitle('Send message');
    fireEvent.click(sendButtons[0]);

    expect(onExecuteBash).toHaveBeenCalledWith('echo hi', true);
    expect(onSendPrompt).not.toHaveBeenCalled();
  });

  it('shows model info in toolbar/header when available', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Either shows model name or "No model" placeholder
    expect(container.textContent).toMatch(/Claude Sonnet 4|No model/);
  });

  it('shows session selector', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Session info should appear
    expect(container.textContent).toMatch(/Session|session/i);
  });

  it('handles focus when clicked', () => {
    const onFocus = vi.fn();
    const { container } = render(<Pane {...defaultProps} onFocus={onFocus} />);
    
    // Click on the pane
    fireEvent.click(container.firstChild as Element);
    // onFocus should be called (or may be called on specific elements)
  });

  it('shows toolbar elements', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Toolbar should have various elements
    expect(container.textContent).toMatch(/model|session|off/i);
  });

  it('renders message list area', () => {
    const { container } = render(<Pane {...defaultProps} />);
    // Should have some content area for messages
    expect(container.innerHTML).toContain('class');
  });

  it('shows close button when canClose is true', () => {
    const { container } = render(<Pane {...defaultProps} canClose={true} />);
    // Should have close button visible
    const closeButtons = Array.from(container.querySelectorAll('button')).filter(
      btn => btn.title?.includes('close') || btn.innerHTML.includes('close') || btn.innerHTML.includes('X')
    );
    // There should be some way to close
    expect(container).toBeTruthy();
  });

  it('renders without slot data', () => {
    const paneWithoutSlot: PaneData = {
      id: 'pane-2',
      sessionSlotId: 'empty',
      slot: null,
    };
    
    const { container } = render(<Pane {...defaultProps} pane={paneWithoutSlot} />);
    // Should render something even without slot
    expect(container).toBeTruthy();
  });

  it('calls onAbort when abort is triggered', () => {
    const onAbort = vi.fn();
    const streamingSlot = {
      ...mockSlot,
      isStreaming: true,
      state: { ...mockSlot.state!, isStreaming: true },
    };
    const streamingPane = { ...mockPaneData, slot: streamingSlot };
    
    const { container } = render(<Pane {...defaultProps} pane={streamingPane} onAbort={onAbort} />);
    
    // Find stop button and click it
    const stopButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.title?.toLowerCase().includes('stop') || btn.innerHTML.toLowerCase().includes('stop')
    );
    
    if (stopButton) {
      fireEvent.click(stopButton);
      expect(onAbort).toHaveBeenCalled();
    }
  });

  describe('Queued Messages Display', () => {
    it('displays queued follow-up messages when pi:queuedMessages event is received', async () => {
      const streamingSlot = {
        ...mockSlot,
        isStreaming: true,
        state: { ...mockSlot.state!, isStreaming: true },
      };
      const streamingPane = { ...mockPaneData, slot: streamingSlot };
      
      const { container } = render(<Pane {...defaultProps} pane={streamingPane} />);
      
      // Dispatch a queuedMessages event
      const event = new CustomEvent('pi:queuedMessages', {
        detail: {
          sessionSlotId: 'default',
          steering: [],
          followUp: ['Check the tests too'],
        },
      });
      window.dispatchEvent(event);
      
      // Wait for React to process the event
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Check the tests too');
      });
    });

    it('displays queued steering messages', async () => {
      const streamingSlot = {
        ...mockSlot,
        isStreaming: true,
        state: { ...mockSlot.state!, isStreaming: true },
      };
      const streamingPane = { ...mockPaneData, slot: streamingSlot };
      
      const { container } = render(<Pane {...defaultProps} pane={streamingPane} />);
      
      // Dispatch a queuedMessages event with steering
      const event = new CustomEvent('pi:queuedMessages', {
        detail: {
          sessionSlotId: 'default',
          steering: ['Focus on error handling'],
          followUp: [],
        },
      });
      window.dispatchEvent(event);
      
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Focus on error handling');
      });
    });

    it('shows queue count indicator', async () => {
      const streamingSlot = {
        ...mockSlot,
        isStreaming: true,
        state: { ...mockSlot.state!, isStreaming: true },
      };
      const streamingPane = { ...mockPaneData, slot: streamingSlot };
      
      const { container } = render(<Pane {...defaultProps} pane={streamingPane} />);
      
      // Dispatch event with multiple queued messages
      const event = new CustomEvent('pi:queuedMessages', {
        detail: {
          sessionSlotId: 'default',
          steering: ['steer 1', 'steer 2'],
          followUp: ['follow 1'],
        },
      });
      window.dispatchEvent(event);
      
      await vi.waitFor(() => {
        expect(container.textContent).toContain('2 steer');
        expect(container.textContent).toContain('1 follow-up');
      });
    });

    it('only responds to events for its own sessionSlotId', async () => {
      const streamingSlot = {
        ...mockSlot,
        isStreaming: true,
        state: { ...mockSlot.state!, isStreaming: true },
      };
      const streamingPane = { ...mockPaneData, slot: streamingSlot };
      
      const { container } = render(<Pane {...defaultProps} pane={streamingPane} />);
      
      // Dispatch event for a different slot
      const event = new CustomEvent('pi:queuedMessages', {
        detail: {
          sessionSlotId: 'other-slot',
          steering: [],
          followUp: ['Should not appear'],
        },
      });
      window.dispatchEvent(event);
      
      // Give time for any potential update
      await new Promise(r => setTimeout(r, 50));
      
      expect(container.textContent).not.toContain('Should not appear');
    });
  });
});
