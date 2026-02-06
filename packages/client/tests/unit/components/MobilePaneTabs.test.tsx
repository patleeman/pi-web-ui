import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobilePaneTabs } from '../../../src/components/MobilePaneTabs';

describe('MobilePaneTabs', () => {
  const defaultProps = {
    paneCount: 2,
    activeIndex: 0,
    onSelectPane: vi.fn(),
    onAddPane: vi.fn(),
    onClosePane: vi.fn(),
  };

  it('renders numbered tabs for each pane', () => {
    render(<MobilePaneTabs {...defaultProps} paneCount={3} />);
    
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('highlights active pane tab', () => {
    render(<MobilePaneTabs {...defaultProps} activeIndex={1} />);
    
    const tab2 = screen.getByText('2');
    expect(tab2.closest('button')).toHaveClass('bg-pi-accent');
    
    const tab1 = screen.getByText('1');
    expect(tab1.closest('button')).toHaveClass('bg-pi-bg');
  });

  it('calls onSelectPane when tab is clicked', () => {
    const onSelectPane = vi.fn();
    render(<MobilePaneTabs {...defaultProps} onSelectPane={onSelectPane} />);
    
    fireEvent.click(screen.getByText('2'));
    expect(onSelectPane).toHaveBeenCalledWith(1);
  });

  it('shows add button when under max panes', () => {
    render(<MobilePaneTabs {...defaultProps} paneCount={2} maxPanes={4} />);
    
    const addButton = screen.getByTitle('Add pane');
    expect(addButton).toBeInTheDocument();
  });

  it('hides add button when at max panes', () => {
    render(<MobilePaneTabs {...defaultProps} paneCount={4} maxPanes={4} />);
    
    expect(screen.queryByTitle('Add pane')).not.toBeInTheDocument();
  });

  it('calls onAddPane when add button is clicked', () => {
    const onAddPane = vi.fn();
    render(<MobilePaneTabs {...defaultProps} onAddPane={onAddPane} />);
    
    fireEvent.click(screen.getByTitle('Add pane'));
    expect(onAddPane).toHaveBeenCalled();
  });

  it('calls onClosePane on double-click when multiple panes', () => {
    const onClosePane = vi.fn();
    render(<MobilePaneTabs {...defaultProps} paneCount={2} onClosePane={onClosePane} />);
    
    fireEvent.doubleClick(screen.getByText('1'));
    expect(onClosePane).toHaveBeenCalledWith(0);
  });

  it('allows closing pane on double-click even with one pane (creates new session)', () => {
    const onClosePane = vi.fn();
    render(<MobilePaneTabs {...defaultProps} paneCount={1} onClosePane={onClosePane} />);
    
    fireEvent.doubleClick(screen.getByText('1'));
    expect(onClosePane).toHaveBeenCalledWith(0);
  });

  it('shows streaming indicator on streaming panes', () => {
    const { container } = render(
      <MobilePaneTabs 
        {...defaultProps} 
        paneCount={2} 
        streamingPanes={[true, false]} 
      />
    );
    
    // Find the streaming indicator (pulsing dot)
    const indicators = container.querySelectorAll('.animate-pulse');
    expect(indicators.length).toBe(1);
  });

  it('defaults to max 4 panes', () => {
    render(<MobilePaneTabs {...defaultProps} paneCount={3} />);
    
    // Should still show add button at 3 panes
    expect(screen.getByTitle('Add pane')).toBeInTheDocument();
  });
});
