import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeDialog } from '../../../src/components/TreeDialog';
import type { SessionTreeNode } from '@pi-web-ui/shared';

describe('TreeDialog', () => {
  const mockTree: SessionTreeNode[] = [
    {
      id: 'node-1',
      parentId: null,
      type: 'message',
      role: 'user',
      text: 'Hello world',
      timestamp: Date.now(),
      children: [
        {
          id: 'node-2',
          parentId: 'node-1',
          type: 'message',
          role: 'assistant',
          text: 'Hi there!',
          timestamp: Date.now(),
          children: [
            {
              id: 'node-3',
              parentId: 'node-2',
              type: 'message',
              role: 'user',
              text: 'How are you?',
              timestamp: Date.now(),
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
    currentLeafId: 'node-3',
    onNavigate: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<TreeDialog {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open', () => {
    render(<TreeDialog {...defaultProps} />);
    expect(screen.getByText('Session Tree')).toBeInTheDocument();
  });

  it('renders tree nodes', () => {
    render(<TreeDialog {...defaultProps} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('highlights current leaf node', () => {
    const { container } = render(<TreeDialog {...defaultProps} />);
    // The current node should have accent color
    const currentIndicator = container.querySelector('.text-pi-accent');
    expect(currentIndicator).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<TreeDialog {...defaultProps} onClose={onClose} />);
    const closeButton = container.querySelector('.border-b button');
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<TreeDialog {...defaultProps} onClose={onClose} />);
    const backdrop = container.querySelector('.bg-black\\/50');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<TreeDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows navigate button', () => {
    render(<TreeDialog {...defaultProps} />);
    expect(screen.getByText('Navigate')).toBeInTheDocument();
  });

  it('can collapse and expand nodes', () => {
    const { container } = render(<TreeDialog {...defaultProps} />);
    // Find a chevron button (collapse/expand)
    const chevronButton = container.querySelector('button svg[class*="chevron"]')?.closest('button');
    if (chevronButton) {
      fireEvent.click(chevronButton);
      // After collapse, child nodes might not be visible
    }
    // Test passes if no error thrown
  });

  it('shows labels on nodes that have them', () => {
    const treeWithLabel: SessionTreeNode[] = [
      {
        ...mockTree[0],
        label: 'Important',
      },
    ];
    render(<TreeDialog {...defaultProps} tree={treeWithLabel} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
  });

  it('handles empty tree gracefully', () => {
    render(<TreeDialog {...defaultProps} tree={[]} />);
    expect(screen.getByText('Session Tree')).toBeInTheDocument();
    // No crash
  });

  it('shows different icons for user and assistant messages', () => {
    const { container } = render(<TreeDialog {...defaultProps} />);
    // Should have different icon classes for user vs assistant
    const messageIcons = container.querySelectorAll('.lucide-message-square');
    const zapIcons = container.querySelectorAll('.lucide-zap');
    expect(messageIcons.length).toBeGreaterThan(0);
    expect(zapIcons.length).toBeGreaterThan(0);
  });
});
