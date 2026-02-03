import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeDialog } from '../../../src/components/TreeDialog';
import type { SessionTreeNode } from '@pi-web-ui/shared';

describe('TreeDialog', () => {
  const mockTree: SessionTreeNode[] = [
    {
      id: 'root',
      type: 'root',
      role: 'system',
      text: 'Session start',
      children: [
        {
          id: 'msg-1',
          type: 'message',
          role: 'user',
          text: 'First user message',
          children: [
            {
              id: 'msg-2',
              type: 'message',
              role: 'assistant',
              text: 'Assistant response',
              children: [],
            },
          ],
        },
      ],
    },
  ];

  const defaultProps = {
    isOpen: true,
    tree: mockTree,
    currentLeafId: 'msg-2',
    onNavigate: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<TreeDialog {...defaultProps} isOpen={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when open', () => {
      render(<TreeDialog {...defaultProps} />);
      expect(screen.getByText('Session Tree')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('shows dialog title', () => {
      render(<TreeDialog {...defaultProps} />);
      expect(screen.getByText('Session Tree')).toBeInTheDocument();
    });

    it('shows git branch icon', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      const icon = container.querySelector('.lucide-git-branch');
      expect(icon).toBeInTheDocument();
    });

    it('has close button', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      const closeIcon = container.querySelector('.lucide-x');
      expect(closeIcon).toBeInTheDocument();
    });
  });

  describe('Tree Rendering', () => {
    it('renders tree nodes', () => {
      render(<TreeDialog {...defaultProps} />);
      
      expect(screen.getByText('Session start')).toBeInTheDocument();
      expect(screen.getByText('First user message')).toBeInTheDocument();
      expect(screen.getByText('Assistant response')).toBeInTheDocument();
    });

    it('shows empty state when no tree', () => {
      render(<TreeDialog {...defaultProps} tree={[]} />);
      
      expect(screen.getByText('No session history')).toBeInTheDocument();
    });

    it('shows different icons for user vs assistant messages', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      
      // User messages have MessageSquare icon
      const userIcons = container.querySelectorAll('.lucide-message-square');
      expect(userIcons.length).toBeGreaterThan(0);
      
      // Assistant messages have Zap icon
      const assistantIcons = container.querySelectorAll('.lucide-zap');
      expect(assistantIcons.length).toBeGreaterThan(0);
    });

    it('highlights current leaf node', () => {
      render(<TreeDialog {...defaultProps} currentLeafId="msg-2" />);
      
      // Current node should have accent color indicator
      const currentIndicator = screen.getByText('●');
      expect(currentIndicator).toHaveClass('text-pi-accent');
    });
  });

  describe('Node Expansion', () => {
    it('nodes with children show expand/collapse chevron', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      
      const chevrons = container.querySelectorAll('.lucide-chevron-down, .lucide-chevron-right');
      expect(chevrons.length).toBeGreaterThan(0);
    });

    it('children are visible by default (expanded)', () => {
      render(<TreeDialog {...defaultProps} />);
      
      // All nodes should be visible initially
      expect(screen.getByText('First user message')).toBeInTheDocument();
      expect(screen.getByText('Assistant response')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('initially selects current leaf', () => {
      const { container } = render(<TreeDialog {...defaultProps} currentLeafId="msg-2" />);
      
      // The selected node should have ring styling
      const selectedNode = container.querySelector('.ring-pi-accent');
      expect(selectedNode).toBeInTheDocument();
    });

    it('clicking a node selects it', () => {
      render(<TreeDialog {...defaultProps} />);
      
      fireEvent.click(screen.getByText('First user message'));
      
      // Node should now be selected
    });
  });

  describe('Keyboard Navigation', () => {
    it('Enter navigates to selected node', () => {
      const onNavigate = vi.fn();
      render(<TreeDialog {...defaultProps} onNavigate={onNavigate} currentLeafId="msg-1" />);
      
      // Select a different node first
      fireEvent.click(screen.getByText('Assistant response'));
      
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(onNavigate).toHaveBeenCalledWith('msg-2');
    });

    it('Enter does nothing if current node is selected', () => {
      const onNavigate = vi.fn();
      render(<TreeDialog {...defaultProps} onNavigate={onNavigate} currentLeafId="msg-2" />);
      
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('Escape closes dialog', () => {
      const onClose = vi.fn();
      render(<TreeDialog {...defaultProps} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Footer Buttons', () => {
    it('shows Cancel button', () => {
      render(<TreeDialog {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows Navigate button', () => {
      render(<TreeDialog {...defaultProps} />);
      expect(screen.getByText('Navigate')).toBeInTheDocument();
    });

    it('Cancel button closes dialog', () => {
      const onClose = vi.fn();
      render(<TreeDialog {...defaultProps} onClose={onClose} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Navigate button is disabled when current node is selected', () => {
      render(<TreeDialog {...defaultProps} currentLeafId="msg-2" />);
      
      const navigateButton = screen.getByText('Navigate');
      expect(navigateButton).toBeDisabled();
    });

    it('Navigate button calls onNavigate when different node selected', () => {
      const onNavigate = vi.fn();
      render(<TreeDialog {...defaultProps} onNavigate={onNavigate} currentLeafId="msg-1" />);
      
      // Select a different node
      fireEvent.click(screen.getByText('Assistant response'));
      
      fireEvent.click(screen.getByText('Navigate'));
      
      expect(onNavigate).toHaveBeenCalledWith('msg-2');
    });
  });

  describe('Click Actions', () => {
    it('clicking backdrop closes dialog', () => {
      const onClose = vi.fn();
      const { container } = render(<TreeDialog {...defaultProps} onClose={onClose} />);
      
      const backdrop = container.querySelector('.bg-black\\/50');
      fireEvent.click(backdrop!);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking close button closes dialog', () => {
      const onClose = vi.fn();
      const { container } = render(<TreeDialog {...defaultProps} onClose={onClose} />);
      
      const closeButton = container.querySelector('.lucide-x')?.closest('button');
      fireEvent.click(closeButton!);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard Hints', () => {
    it('shows keyboard shortcut hints in footer', () => {
      render(<TreeDialog {...defaultProps} />);
      
      expect(screen.getByText(/Click to select/)).toBeInTheDocument();
      expect(screen.getByText(/Enter to navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Esc to cancel/)).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('dialog is centered on screen', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      
      const dialog = container.querySelector('.fixed.top-1\\/2.left-1\\/2');
      expect(dialog).toBeInTheDocument();
    });

    it('dialog has max height with scroll', () => {
      const { container } = render(<TreeDialog {...defaultProps} />);
      
      const dialog = container.querySelector('.max-h-\\[70vh\\]');
      expect(dialog).toBeInTheDocument();
    });
  });
});
