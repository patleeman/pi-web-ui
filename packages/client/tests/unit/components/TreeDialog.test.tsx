import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeMenu, flattenTree } from '../../../src/components/TreeDialog';
import type { SessionTreeNode } from '@pi-web-ui/shared';

describe('flattenTree', () => {
  const mockTree: SessionTreeNode[] = [
    {
      id: 'root',
      parentId: null,
      type: 'other',
      text: 'Session start',
      timestamp: 1000,
      children: [
        {
          id: 'msg-1',
          parentId: 'root',
          type: 'message',
          role: 'user',
          text: 'First user message',
          timestamp: 2000,
          children: [
            {
              id: 'msg-2',
              parentId: 'msg-1',
              type: 'message',
              role: 'assistant',
              text: 'Assistant response',
              timestamp: 3000,
              children: [],
            },
          ],
        },
      ],
    },
  ];

  it('flattens tree into a linear list', () => {
    const items = flattenTree(mockTree, 'msg-2');
    // Should include user and assistant messages but not the root 'other' node
    expect(items.length).toBe(2);
    expect(items[0].text).toBe('First user message');
    expect(items[1].text).toBe('Assistant response');
  });

  it('marks the current leaf', () => {
    const items = flattenTree(mockTree, 'msg-2');
    expect(items[1].isCurrent).toBe(true);
    expect(items[0].isCurrent).toBe(false);
  });

  it('skips model_change nodes (matching TUI behavior)', () => {
    const tree: SessionTreeNode[] = [{
      id: 'mc', parentId: null, type: 'model_change', text: '[Model Change]',
      timestamp: 1000, children: [],
    }];
    const items = flattenTree(tree, null);
    expect(items.length).toBe(0);
  });

  it('includes labeled nodes', () => {
    const tree: SessionTreeNode[] = [{
      id: 'other', parentId: null, type: 'other', text: 'Something',
      label: 'important', timestamp: 1000, children: [],
    }];
    const items = flattenTree(tree, null);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('important');
  });

  it('returns empty for empty tree', () => {
    expect(flattenTree([], null)).toEqual([]);
  });
});

describe('TreeMenu', () => {
  const mockTree: SessionTreeNode[] = [
    {
      id: 'root',
      parentId: null,
      type: 'other',
      text: 'Session start',
      timestamp: 1000,
      children: [
        {
          id: 'msg-1',
          parentId: 'root',
          type: 'message',
          role: 'user',
          text: 'First user message',
          timestamp: 2000,
          children: [
            {
              id: 'msg-2',
              parentId: 'msg-1',
              type: 'message',
              role: 'assistant',
              text: 'Assistant response',
              timestamp: 3000,
              children: [],
            },
          ],
        },
      ],
    },
  ];

  const defaultProps = {
    tree: mockTree,
    currentLeafId: 'msg-2',
    selectedIndex: 1,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header', () => {
    it('shows menu title', () => {
      render(<TreeMenu {...defaultProps} />);
      expect(screen.getByText('Session Tree')).toBeInTheDocument();
    });

    it('shows git branch icon', () => {
      const { container } = render(<TreeMenu {...defaultProps} />);
      const icon = container.querySelector('.lucide-git-branch');
      expect(icon).toBeInTheDocument();
    });

    it('shows keyboard hints', () => {
      render(<TreeMenu {...defaultProps} />);
      expect(screen.getByText(/↑↓ navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Enter select/)).toBeInTheDocument();
      expect(screen.getByText(/Esc cancel/)).toBeInTheDocument();
    });
  });

  describe('Flat rendering', () => {
    it('renders messages as a flat list', () => {
      render(<TreeMenu {...defaultProps} />);

      expect(screen.getByText('First user message')).toBeInTheDocument();
      expect(screen.getByText('Assistant response')).toBeInTheDocument();
    });

    it('shows empty state when no tree', () => {
      render(<TreeMenu {...defaultProps} tree={[]} />);
      expect(screen.getByText('No session history')).toBeInTheDocument();
    });

    it('shows icons for user vs assistant messages', () => {
      const { container } = render(<TreeMenu {...defaultProps} />);
      expect(container.querySelectorAll('.lucide-message-square').length).toBeGreaterThan(0);
      expect(container.querySelectorAll('.lucide-zap').length).toBeGreaterThan(0);
    });

    it('highlights current leaf node', () => {
      render(<TreeMenu {...defaultProps} currentLeafId="msg-2" />);
      const indicator = screen.getByText('●');
      expect(indicator).toHaveClass('text-pi-accent');
    });
  });

  describe('Selection', () => {
    it('highlights selected index', () => {
      const { container } = render(<TreeMenu {...defaultProps} selectedIndex={0} />);
      const items = container.querySelectorAll('[class*="cursor-pointer"]');
      expect(items[0]).toHaveClass('bg-pi-surface');
    });

    it('clicking a node calls onSelect', () => {
      const onSelect = vi.fn();
      render(<TreeMenu {...defaultProps} onSelect={onSelect} />);
      fireEvent.click(screen.getByText('First user message'));
      expect(onSelect).toHaveBeenCalledWith('msg-1');
    });
  });

  describe('Styling', () => {
    it('renders as absolute positioned menu above input', () => {
      const { container } = render(<TreeMenu {...defaultProps} />);
      const menu = container.firstChild as HTMLElement;
      expect(menu.className).toContain('absolute');
      expect(menu.className).toContain('bottom-full');
    });

    it('has max height with scroll', () => {
      const { container } = render(<TreeMenu {...defaultProps} />);
      const menu = container.firstChild as HTMLElement;
      expect(menu.className).toContain('max-h-[200px]');
      expect(menu.className).toContain('overflow-y-auto');
    });
  });
});
