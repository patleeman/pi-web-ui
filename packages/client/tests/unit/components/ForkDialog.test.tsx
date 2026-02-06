import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForkDialog } from '../../../src/components/ForkDialog';

describe('ForkDialog', () => {
  const mockMessages = [
    { entryId: 'entry-1', text: 'First user message' },
    { entryId: 'entry-2', text: 'Second user message with more content' },
    { entryId: 'entry-3', text: 'Third message' },
  ];

  const defaultProps = {
    messages: mockMessages,
    selectedIndex: 2,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header', () => {
    it('shows dialog title', () => {
      render(<ForkDialog {...defaultProps} />);
      expect(screen.getByText('Fork from message')).toBeInTheDocument();
    });

    it('shows git branch icon', () => {
      const { container } = render(<ForkDialog {...defaultProps} />);
      const icon = container.querySelector('.lucide-git-branch');
      expect(icon).toBeInTheDocument();
    });

    it('shows keyboard shortcut hints in header', () => {
      render(<ForkDialog {...defaultProps} />);
      expect(screen.getByText(/↑↓ navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Enter select/)).toBeInTheDocument();
      expect(screen.getByText(/Esc cancel/)).toBeInTheDocument();
    });
  });

  describe('Message List', () => {
    it('renders all messages', () => {
      render(<ForkDialog {...defaultProps} />);
      
      expect(screen.getByText('First user message')).toBeInTheDocument();
      expect(screen.getByText('Second user message with more content')).toBeInTheDocument();
      expect(screen.getByText('Third message')).toBeInTheDocument();
    });

    it('shows message numbers', () => {
      render(<ForkDialog {...defaultProps} />);
      
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('shows empty state when no messages', () => {
      render(<ForkDialog {...defaultProps} messages={[]} />);
      
      expect(screen.getByText('No messages to fork from')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('highlights the selected index', () => {
      const { container } = render(<ForkDialog {...defaultProps} selectedIndex={1} />);
      
      const items = container.querySelectorAll('[class*="cursor-pointer"]');
      expect(items[1]).toHaveClass('bg-pi-surface');
      expect(items[0]).not.toHaveClass('bg-pi-surface');
      expect(items[2]).not.toHaveClass('bg-pi-surface');
    });
  });

  describe('Click Actions', () => {
    it('calls onSelect when message is clicked', () => {
      const onSelect = vi.fn();
      render(<ForkDialog {...defaultProps} onSelect={onSelect} />);
      
      fireEvent.click(screen.getByText('First user message'));
      
      expect(onSelect).toHaveBeenCalledWith('entry-1');
    });
  });

  describe('Styling', () => {
    it('renders as absolute positioned menu above input', () => {
      const { container } = render(<ForkDialog {...defaultProps} />);
      
      const menu = container.firstChild as HTMLElement;
      expect(menu.className).toContain('absolute');
      expect(menu.className).toContain('bottom-full');
    });

    it('has max height with scroll', () => {
      const { container } = render(<ForkDialog {...defaultProps} />);
      
      const menu = container.firstChild as HTMLElement;
      expect(menu.className).toContain('max-h-[200px]');
      expect(menu.className).toContain('overflow-y-auto');
    });
  });
});
