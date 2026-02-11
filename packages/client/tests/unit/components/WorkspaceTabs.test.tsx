import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceTabs } from '../../../src/components/WorkspaceTabs';

describe('WorkspaceTabs', () => {
  const mockTabs = [
    { id: 'ws-1', name: 'project-a', path: '/home/user/project-a', isStreaming: false, messageCount: 10 },
    { id: 'ws-2', name: 'project-b', path: '/home/user/project-b', isStreaming: true, messageCount: 5 },
    { id: 'ws-3', name: 'project-c', path: '/home/user/project-c', isStreaming: false, messageCount: 0, needsAttention: true },
  ];

  const defaultProps = {
    tabs: mockTabs,
    activeId: 'ws-1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onOpenBrowser: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tab Rendering', () => {
    it('renders all workspace tabs', () => {
      render(<WorkspaceTabs {...defaultProps} />);
      
      expect(screen.getByText('project-a')).toBeInTheDocument();
      expect(screen.getByText('project-b')).toBeInTheDocument();
      expect(screen.getByText('project-c')).toBeInTheDocument();
    });

    it('shows full path in title attribute for accessibility', () => {
      render(<WorkspaceTabs {...defaultProps} />);
      
      const tab = screen.getByText('project-a').closest('button');
      expect(tab).toHaveAttribute('title', '/home/user/project-a');
    });
  });

  describe('Active Tab', () => {
    it('highlights the active tab', () => {
      render(<WorkspaceTabs {...defaultProps} activeId="ws-1" />);
      
      const activeTab = screen.getByText('project-a').closest('button');
      expect(activeTab).toHaveClass('border-pi-border-focus');
      expect(activeTab).toHaveClass('text-pi-text');
    });

    it('non-active tabs have muted styling', () => {
      render(<WorkspaceTabs {...defaultProps} activeId="ws-1" />);
      
      const inactiveTab = screen.getByText('project-b').closest('button');
      expect(inactiveTab).toHaveClass('text-pi-muted');
      expect(inactiveTab).toHaveClass('border-transparent');
    });
  });

  describe('Streaming Indicator', () => {
    it('shows streaming indicator for streaming workspaces', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      // project-b is streaming - should have animated indicator
      const streamingIndicators = container.querySelectorAll('.status-running');
      expect(streamingIndicators.length).toBe(1);
    });

    it('streaming indicator has success color', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      const indicator = container.querySelector('.status-running');
      expect(indicator).toHaveClass('bg-pi-success');
    });
  });

  describe('Attention Indicator', () => {
    it('shows attention indicator for workspaces needing attention', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      // project-c needs attention (and is not streaming)
      // Should have a non-animated dot
      const attentionDots = container.querySelectorAll('.bg-pi-success:not(.status-running)');
      expect(attentionDots.length).toBe(1);
    });

    it('does not show attention indicator when streaming', () => {
      const tabsWithBothFlags = [
        { id: 'ws-1', name: 'test', path: '/test', isStreaming: true, messageCount: 0, needsAttention: true },
      ];
      
      const { container } = render(<WorkspaceTabs {...defaultProps} tabs={tabsWithBothFlags} />);
      
      // Should only show streaming indicator, not attention
      const streamingIndicators = container.querySelectorAll('.status-running');
      expect(streamingIndicators.length).toBe(1);
    });
  });

  describe('Tab Selection', () => {
    it('calls onSelect when tab is clicked', () => {
      const onSelect = vi.fn();
      render(<WorkspaceTabs {...defaultProps} onSelect={onSelect} />);
      
      fireEvent.click(screen.getByText('project-b'));
      
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('ws-2');
    });

    it('clicking active tab still calls onSelect', () => {
      const onSelect = vi.fn();
      render(<WorkspaceTabs {...defaultProps} onSelect={onSelect} activeId="ws-1" />);
      
      fireEvent.click(screen.getByText('project-a'));
      
      expect(onSelect).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('Close Button', () => {
    it('each tab has a close button', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      const closeButtons = container.querySelectorAll('[title="Close workspace"]');
      expect(closeButtons.length).toBe(mockTabs.length);
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(<WorkspaceTabs {...defaultProps} onClose={onClose} />);
      
      const closeButtons = container.querySelectorAll('[title="Close workspace"]');
      fireEvent.click(closeButtons[1]); // Close second tab
      
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith('ws-2');
    });

    it('clicking close button does not select the tab', () => {
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const { container } = render(<WorkspaceTabs {...defaultProps} onSelect={onSelect} onClose={onClose} />);
      
      const closeButtons = container.querySelectorAll('[title="Close workspace"]');
      fireEvent.click(closeButtons[0]);
      
      expect(onClose).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Add Button', () => {
    it('shows add button (+)', () => {
      render(<WorkspaceTabs {...defaultProps} />);
      
      expect(screen.getByText('+')).toBeInTheDocument();
    });

    it('add button has correct title', () => {
      render(<WorkspaceTabs {...defaultProps} />);
      
      const addButton = screen.getByText('+');
      expect(addButton).toHaveAttribute('title', 'Open directory (⌘O)');
    });

    it('calls onOpenBrowser when add button is clicked', () => {
      const onOpenBrowser = vi.fn();
      render(<WorkspaceTabs {...defaultProps} onOpenBrowser={onOpenBrowser} />);
      
      fireEvent.click(screen.getByText('+'));
      
      expect(onOpenBrowser).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty State', () => {
    it('renders only add button when no tabs', () => {
      render(<WorkspaceTabs {...defaultProps} tabs={[]} />);
      
      expect(screen.getByText('+')).toBeInTheDocument();
      expect(screen.queryByText('project-a')).not.toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('tabs container hides overflow', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('overflow-hidden');
    });

    it('tabs container has border at bottom', () => {
      const { container } = render(<WorkspaceTabs {...defaultProps} />);
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('border-b');
    });
  });
});
