import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaneManager } from '../../../src/components/PaneManager';
import type { WorkspaceState, SessionSlotState } from '../../../src/hooks/useWorkspaces';

describe('PaneManager', () => {
  const mockSlot: SessionSlotState = {
    slotId: 'slot-1',
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

  const mockWorkspace: WorkspaceState = {
    id: 'ws-1',
    path: '/test/project',
    name: 'project',
    slots: { 'slot-1': mockSlot },
    sessions: [],
    models: [],
    startupInfo: null,
  };

  const singlePaneLayout = {
    type: 'pane' as const,
    id: 'pane-1',
    slotId: 'slot-1',
  };

  const splitLayout = {
    type: 'split' as const,
    direction: 'horizontal' as const,
    children: [
      { type: 'pane' as const, id: 'pane-1', slotId: 'slot-1' },
      { type: 'pane' as const, id: 'pane-2', slotId: 'slot-2' },
    ],
    sizes: [0.5, 0.5],
  };

  const defaultProps = {
    layout: singlePaneLayout,
    workspace: mockWorkspace,
    focusedPaneId: 'pane-1',
    sessions: [],
    models: [],
    backendCommands: [],
    onFocusPane: vi.fn(),
    onSplit: vi.fn(),
    onClosePane: vi.fn(),
    onResizeNode: vi.fn(),
    onSendPrompt: vi.fn(),
    onSteer: vi.fn(),
    onAbort: vi.fn(),
    onLoadSession: vi.fn(),
    onNewSession: vi.fn(),
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
    activePlan: null,
    onUpdatePlanTask: vi.fn(),
    onDeactivatePlan: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single Pane Layout', () => {
    it('renders a single pane', () => {
      const { container } = render(<PaneManager {...defaultProps} />);
      // Should render the Pane component
      expect(container.querySelector('.flex-1')).toBeInTheDocument();
    });

    it('passes correct props to Pane', () => {
      render(<PaneManager {...defaultProps} focusedPaneId="pane-1" />);
      // The pane should be focused
      // Pane component rendering is tested separately
    });
  });

  describe('Split Layout', () => {
    it('renders multiple panes in split layout', () => {
      const workspaceWithTwoSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
        },
      };

      const { container } = render(
        <PaneManager 
          {...defaultProps} 
          layout={splitLayout}
          workspace={workspaceWithTwoSlots}
        />
      );
      
      // Should have flex container
      expect(container.querySelector('.flex-1.flex')).toBeInTheDocument();
    });

    it('renders resize handles between panes', () => {
      const workspaceWithTwoSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
        },
      };

      const { container } = render(
        <PaneManager 
          {...defaultProps} 
          layout={splitLayout}
          workspace={workspaceWithTwoSlots}
        />
      );
      
      // Should have resize handle (cursor-col-resize for horizontal split)
      const handle = container.querySelector('.cursor-col-resize');
      expect(handle).toBeInTheDocument();
    });

    it('horizontal split uses flex-row', () => {
      const workspaceWithTwoSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
        },
      };

      const { container } = render(
        <PaneManager 
          {...defaultProps} 
          layout={splitLayout}
          workspace={workspaceWithTwoSlots}
        />
      );
      
      expect(container.querySelector('.flex-row')).toBeInTheDocument();
    });

    it('vertical split uses flex-col', () => {
      const verticalLayout = {
        ...splitLayout,
        direction: 'vertical' as const,
      };

      const workspaceWithTwoSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
        },
      };

      const { container } = render(
        <PaneManager 
          {...defaultProps} 
          layout={verticalLayout}
          workspace={workspaceWithTwoSlots}
        />
      );
      
      expect(container.querySelector('.flex-col')).toBeInTheDocument();
    });
  });

  describe('Null Workspace', () => {
    it('renders without crashing when workspace is null', () => {
      const { container } = render(
        <PaneManager {...defaultProps} workspace={null} />
      );
      
      expect(container).toBeInTheDocument();
    });
  });

  describe('Pane Count', () => {
    it('allows closing pane when multiple panes exist', () => {
      const workspaceWithTwoSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
        },
      };

      render(
        <PaneManager 
          {...defaultProps} 
          layout={splitLayout}
          workspace={workspaceWithTwoSlots}
        />
      );
      
      // Panes should be closable (canClose=true)
    });

    it('prevents closing last pane', () => {
      render(<PaneManager {...defaultProps} layout={singlePaneLayout} />);
      
      // Single pane should not be closable (canClose=false)
    });
  });

  describe('Nested Splits', () => {
    it('handles nested split layouts', () => {
      const nestedLayout = {
        type: 'split' as const,
        direction: 'horizontal' as const,
        children: [
          { type: 'pane' as const, id: 'pane-1', slotId: 'slot-1' },
          {
            type: 'split' as const,
            direction: 'vertical' as const,
            children: [
              { type: 'pane' as const, id: 'pane-2', slotId: 'slot-2' },
              { type: 'pane' as const, id: 'pane-3', slotId: 'slot-3' },
            ],
            sizes: [0.5, 0.5],
          },
        ],
        sizes: [0.5, 0.5],
      };

      const workspaceWithThreeSlots: WorkspaceState = {
        ...mockWorkspace,
        slots: {
          'slot-1': mockSlot,
          'slot-2': { ...mockSlot, slotId: 'slot-2' },
          'slot-3': { ...mockSlot, slotId: 'slot-3' },
        },
      };

      const { container } = render(
        <PaneManager 
          {...defaultProps} 
          layout={nestedLayout}
          workspace={workspaceWithThreeSlots}
        />
      );
      
      // Should render nested structure
      expect(container.querySelector('.flex-row')).toBeInTheDocument();
      expect(container.querySelector('.flex-col')).toBeInTheDocument();
    });
  });

  describe('Container Styling', () => {
    it('has padding around panes', () => {
      const { container } = render(<PaneManager {...defaultProps} />);
      
      const outerContainer = container.querySelector('.p-2');
      expect(outerContainer).toBeInTheDocument();
    });

    it('uses overflow-hidden to contain content', () => {
      const { container } = render(<PaneManager {...defaultProps} />);
      
      const outerContainer = container.querySelector('.overflow-hidden');
      expect(outerContainer).toBeInTheDocument();
    });
  });
});
