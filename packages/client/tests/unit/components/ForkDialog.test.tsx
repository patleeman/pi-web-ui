import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForkDialog } from '../../../src/components/ForkDialog';

describe('ForkDialog', () => {
  const mockMessages = [
    { entryId: 'entry-1', text: 'First message' },
    { entryId: 'entry-2', text: 'Second message' },
    { entryId: 'entry-3', text: 'Third message' },
  ];

  const defaultProps = {
    isOpen: true,
    messages: mockMessages,
    onFork: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ForkDialog {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open', () => {
    render(<ForkDialog {...defaultProps} />);
    expect(screen.getByText('Fork from message')).toBeInTheDocument();
  });

  it('renders all messages', () => {
    render(<ForkDialog {...defaultProps} />);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Third message')).toBeInTheDocument();
  });

  it('calls onFork when message is clicked', () => {
    const onFork = vi.fn();
    render(<ForkDialog {...defaultProps} onFork={onFork} />);
    fireEvent.click(screen.getByText('Second message'));
    expect(onFork).toHaveBeenCalledWith('entry-2');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<ForkDialog {...defaultProps} onClose={onClose} />);
    // Find the close button (the one in the header with X icon)
    const closeButton = container.querySelector('.border-b button');
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<ForkDialog {...defaultProps} onClose={onClose} />);
    const backdrop = container.querySelector('.bg-black\\/50');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<ForkDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates with arrow keys', () => {
    const onFork = vi.fn();
    render(<ForkDialog {...defaultProps} onFork={onFork} />);
    
    // By default, last message is selected
    // Navigate up twice to get to first message
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onFork).toHaveBeenCalledWith('entry-1');
  });

  it('forks on Enter key', () => {
    const onFork = vi.fn();
    render(<ForkDialog {...defaultProps} onFork={onFork} />);
    
    // Last message is selected by default
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onFork).toHaveBeenCalledWith('entry-3');
  });

  it('selects last message by default', () => {
    const onFork = vi.fn();
    render(<ForkDialog {...defaultProps} onFork={onFork} />);
    
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onFork).toHaveBeenCalledWith('entry-3');
  });

  it('handles empty messages array', () => {
    const { container } = render(<ForkDialog {...defaultProps} messages={[]} />);
    // Should still render but be empty
    expect(screen.getByText('Fork from message')).toBeInTheDocument();
  });

  it('truncates long messages', () => {
    const longMessage = [
      { entryId: 'entry-1', text: 'A'.repeat(200) },
    ];
    const { container } = render(<ForkDialog {...defaultProps} messages={longMessage} />);
    // Message should be truncated (component uses truncate class)
    const messageEl = container.querySelector('.truncate');
    expect(messageEl).toBeTruthy();
  });
});
