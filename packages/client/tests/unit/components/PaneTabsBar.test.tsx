import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PaneTabsBar } from '../../../src/components/PaneTabsBar';

describe('PaneTabsBar', () => {
  const tabs = [
    { id: 'tab-1', label: 'First tab', isActive: true, isStreaming: false },
    { id: 'tab-2', label: 'Second tab', isActive: false, isStreaming: true },
    { id: 'tab-3', label: 'Third tab', isActive: false, isStreaming: false },
  ];

  const defaultProps = {
    tabs,
    onSelectTab: vi.fn(),
    onAddTab: vi.fn(),
    onCloseTab: vi.fn(),
    onRenameTab: vi.fn(),
    onReorderTabs: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs and add button', () => {
    render(<PaneTabsBar {...defaultProps} />);

    expect(screen.getByText('First tab')).toBeInTheDocument();
    expect(screen.getByText('Second tab')).toBeInTheDocument();
    expect(screen.getByTitle('New tab')).toBeInTheDocument();
  });

  it('calls onSelectTab when a tab is clicked', () => {
    const onSelectTab = vi.fn();
    render(<PaneTabsBar {...defaultProps} onSelectTab={onSelectTab} />);

    fireEvent.click(screen.getByText('Second tab'));

    expect(onSelectTab).toHaveBeenCalledWith('tab-2');
  });

  it('supports renaming via double click + enter', () => {
    const onRenameTab = vi.fn();
    render(<PaneTabsBar {...defaultProps} onRenameTab={onRenameTab} />);

    fireEvent.doubleClick(screen.getByText('First tab'));

    const input = screen.getByLabelText('Rename tab');
    fireEvent.change(input, { target: { value: 'Renamed tab' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameTab).toHaveBeenCalledWith('tab-1', 'Renamed tab');
  });

  it('cancels renaming with escape', () => {
    const onRenameTab = vi.fn();
    render(<PaneTabsBar {...defaultProps} onRenameTab={onRenameTab} />);

    fireEvent.doubleClick(screen.getByText('First tab'));

    const input = screen.getByLabelText('Rename tab');
    fireEvent.change(input, { target: { value: 'Ignored name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRenameTab).not.toHaveBeenCalled();
  });

  it('calls onCloseTab when close button is clicked', () => {
    const onCloseTab = vi.fn();
    render(<PaneTabsBar {...defaultProps} onCloseTab={onCloseTab} />);

    const closeButtons = screen.getAllByTitle('Close tab');
    fireEvent.click(closeButtons[1]);

    expect(onCloseTab).toHaveBeenCalledWith('tab-2');
  });

  it('shows close button even with only one tab', () => {
    const onCloseTab = vi.fn();
    const singleTab = [{ id: 'tab-1', label: 'Only tab', isActive: true, isStreaming: false }];
    render(<PaneTabsBar {...defaultProps} tabs={singleTab} onCloseTab={onCloseTab} />);

    const closeButton = screen.getByTitle('Close tab');
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    expect(onCloseTab).toHaveBeenCalledWith('tab-1');
  });

  it('calls onReorderTabs when dragged and dropped on another tab', () => {
    const onReorderTabs = vi.fn();
    render(<PaneTabsBar {...defaultProps} onReorderTabs={onReorderTabs} />);

    const source = screen.getByText('First tab').closest('div[draggable="true"]');
    const target = screen.getByText('Third tab').closest('div[draggable="true"]');

    expect(source).toBeTruthy();
    expect(target).toBeTruthy();

    fireEvent.dragStart(source!);
    fireEvent.dragOver(target!);
    fireEvent.drop(target!);

    expect(onReorderTabs).toHaveBeenCalledWith('tab-1', 'tab-3');
  });
});
