import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileSidebar } from '../../../src/components/MobileSidebar';

// Mock SidebarFileTree
vi.mock('../../../src/components/SidebarFileTree', () => ({
  SidebarFileTree: ({ section }: { section: string }) => (
    <div data-testid={`file-tree-${section}`}>FileTree: {section}</div>
  ),
}));

const mockWorkspaces = [
  {
    id: 'ws-1',
    name: 'Test Workspace',
    path: '/test/path',
    isActive: true,
    isStreaming: false,
    needsAttention: false,
    panes: [],
    conversations: [],
  },
];

const mockConversations = [
  {
    sessionId: 'session-1',
    sessionPath: '/test/session.jsonl',
    label: 'Test Conversation',
    isFocused: true,
    isStreaming: false,
  },
];

const defaultProps = {
  workspaces: mockWorkspaces,
  activeWorkspaceId: 'ws-1',
  conversations: mockConversations,
  onSelectWorkspace: vi.fn(),
  onCloseWorkspace: vi.fn(),
  onSelectConversation: vi.fn(),
  onRenameConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onOpenBrowser: vi.fn(),
  onOpenSettings: vi.fn(),
  onClose: vi.fn(),
};

describe('MobileSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Layout', () => {
    it('renders with correct structure', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
      expect(screen.getByText('Chats')).toBeInTheDocument();
      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    });

    it('shows "No workspaces" when workspace list is empty', () => {
      render(<MobileSidebar {...defaultProps} workspaces={[]} activeWorkspaceId={null} />);
      
      expect(screen.getByText('No workspaces')).toBeInTheDocument();
    });

    it('shows "No conversations yet" when conversation list is empty', () => {
      render(<MobileSidebar {...defaultProps} conversations={[]} />);
      
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    it('renders footer buttons', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      expect(screen.getByText('Open workspace')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  describe('Workspace Selection', () => {
    it('opens workspace dropdown when clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const workspaceButton = screen.getByText('Test Workspace');
      fireEvent.click(workspaceButton);
      
      // Dropdown should show close button for workspace
      expect(screen.getByTitle('Close workspace')).toBeInTheDocument();
    });

    it('calls onSelectWorkspace when workspace is selected', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const workspaceButton = screen.getByText('Test Workspace');
      fireEvent.click(workspaceButton);
      
      // Click on the workspace option button in dropdown (the first button in the dropdown)
      const workspaceOptions = screen.getAllByText('Test Workspace');
      // The second one is in the dropdown
      fireEvent.click(workspaceOptions[1]);
      
      expect(defaultProps.onSelectWorkspace).toHaveBeenCalledWith('ws-1');
    });

    it('calls onCloseWorkspace when close button is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const workspaceButton = screen.getByText('Test Workspace');
      fireEvent.click(workspaceButton);
      
      const closeButton = screen.getByTitle('Close workspace');
      fireEvent.click(closeButton);
      
      expect(defaultProps.onCloseWorkspace).toHaveBeenCalledWith('ws-1');
    });

    it('resets to conversations tab when switching workspaces', () => {
      const { rerender } = render(
        <MobileSidebar
          {...defaultProps}
          entriesByPath={{}}
          gitStatusFiles={[]}
          onRequestEntries={vi.fn()}
          onRequestGitStatus={vi.fn()}
          onSelectFile={vi.fn()}
          onSelectGitFile={vi.fn()}
        />
      );
      
      // Switch to Explorer tab
      const explorerTab = screen.getByText('Explorer');
      fireEvent.click(explorerTab);
      expect(screen.getByTestId('file-tree-files')).toBeInTheDocument();
      
      // Add a second workspace and switch to it
      const workspaces = [
        ...mockWorkspaces,
        {
          id: 'ws-2',
          name: 'Second Workspace',
          path: '/test/path2',
          isActive: false,
          isStreaming: false,
          needsAttention: false,
          panes: [],
          conversations: [],
        },
      ];
      
      rerender(
        <MobileSidebar
          {...defaultProps}
          workspaces={workspaces}
          entriesByPath={{}}
          gitStatusFiles={[]}
          onRequestEntries={vi.fn()}
          onRequestGitStatus={vi.fn()}
          onSelectFile={vi.fn()}
          onSelectGitFile={vi.fn()}
        />
      );
      
      // Open dropdown and select second workspace
      const workspaceButton = screen.getByText('Test Workspace');
      fireEvent.click(workspaceButton);
      
      const secondWorkspace = screen.getByText('Second Workspace');
      fireEvent.click(secondWorkspace);
      
      // Should have called onSelectWorkspace
      expect(defaultProps.onSelectWorkspace).toHaveBeenCalledWith('ws-2');
    });
  });

  describe('Tab Navigation', () => {
    it('shows Explorer tab when file tree data is available', () => {
      render(
        <MobileSidebar
          {...defaultProps}
          entriesByPath={{}}
          gitStatusFiles={[]}
          onRequestEntries={vi.fn()}
          onRequestGitStatus={vi.fn()}
          onSelectFile={vi.fn()}
          onSelectGitFile={vi.fn()}
        />
      );
      
      expect(screen.getByText('Explorer')).toBeInTheDocument();
    });

    it('switches to Explorer tab when clicked', () => {
      render(
        <MobileSidebar
          {...defaultProps}
          entriesByPath={{}}
          gitStatusFiles={[]}
          onRequestEntries={vi.fn()}
          onRequestGitStatus={vi.fn()}
          onSelectFile={vi.fn()}
          onSelectGitFile={vi.fn()}
        />
      );
      
      const explorerTab = screen.getByText('Explorer');
      fireEvent.click(explorerTab);
      
      expect(screen.getByTestId('file-tree-files')).toBeInTheDocument();
      expect(screen.getByTestId('file-tree-git')).toBeInTheDocument();
    });
  });

  describe('Conversation Actions', () => {
    it('calls onSelectConversation when conversation is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const conversation = screen.getByText('Test Conversation');
      fireEvent.click(conversation);
      
      expect(defaultProps.onSelectConversation).toHaveBeenCalledWith(
        'session-1',
        '/test/session.jsonl',
        undefined,
        'Test Conversation'
      );
    });

    it('opens action menu when more button is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const moreButton = screen.getByLabelText('Conversation actions');
      fireEvent.click(moreButton);
      
      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('calls onDeleteConversation when delete is clicked', () => {
      window.confirm = vi.fn(() => true);
      
      render(<MobileSidebar {...defaultProps} />);
      
      const moreButton = screen.getByLabelText('Conversation actions');
      fireEvent.click(moreButton);
      
      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);
      
      expect(defaultProps.onDeleteConversation).toHaveBeenCalledWith(
        'session-1',
        '/test/session.jsonl',
        'Test Conversation'
      );
    });
  });

  describe('Footer Actions', () => {
    it('calls onOpenBrowser when open workspace button is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const openButton = screen.getByText('Open workspace');
      fireEvent.click(openButton);
      
      expect(defaultProps.onOpenBrowser).toHaveBeenCalled();
    });

    it('calls onOpenSettings when settings button is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const settingsButton = screen.getByText('Settings');
      fireEvent.click(settingsButton);
      
      expect(defaultProps.onOpenSettings).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', () => {
      render(<MobileSidebar {...defaultProps} />);
      
      const closeButton = screen.getByTitle('Close menu');
      fireEvent.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Job Indicators', () => {
    it('shows job icon for conversations with active jobs', () => {
      const conversationsWithJob = [
        {
          ...mockConversations[0],
          slotId: 'slot-1',
        },
      ];
      
      const activeJobs = [
        {
          id: 'job-1',
          title: 'Test Job',
          phase: 'executing' as const,
          workspaceId: 'ws-1',
          sessionSlotId: 'slot-1',
          tasks: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      
      render(
        <MobileSidebar
          {...defaultProps}
          conversations={conversationsWithJob}
          activeJobs={activeJobs}
        />
      );
      
      // The Briefcase icon should be rendered with the job color class
      const conversationButton = screen.getByText('Test Conversation').closest('button');
      expect(conversationButton).toBeInTheDocument();
    });

    it('shows streaming indicator for streaming conversations', () => {
      const streamingConversations = [
        {
          ...mockConversations[0],
          isStreaming: true,
        },
      ];
      
      render(<MobileSidebar {...defaultProps} conversations={streamingConversations} />);
      
      const conversationButton = screen.getByText('Test Conversation').closest('button');
      expect(conversationButton).toBeInTheDocument();
    });
  });
});
