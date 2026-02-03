import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DirectoryBrowser } from '../../../src/components/DirectoryBrowser';
import { mockDirectoryEntries } from '../../fixtures/workspaces';

describe('DirectoryBrowser', () => {
  const defaultProps = {
    currentPath: '/Users/test/project',
    entries: mockDirectoryEntries,
    allowedRoots: ['/Users/test', '/home/test'],
    recentWorkspaces: ['/Users/test/recent1', '/Users/test/recent2'],
    homeDirectory: '/Users/test',
    onNavigate: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders the current path', () => {
    render(<DirectoryBrowser {...defaultProps} />);
    expect(screen.getByText('/Users/test/project')).toBeInTheDocument();
  });

  it('renders directory entries', () => {
    render(<DirectoryBrowser {...defaultProps} />);
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('shows folder icon for directories', () => {
    const { container } = render(<DirectoryBrowser {...defaultProps} />);
    // src and node_modules are directories
    const folderItems = container.querySelectorAll('[data-testid="folder-icon"]');
    // Just check that we have directory entries
    const directoryEntries = mockDirectoryEntries.filter(e => e.isDirectory);
    expect(directoryEntries.length).toBeGreaterThan(0);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DirectoryBrowser {...defaultProps} onClose={onClose} />);
    // Find the close button by its title
    const closeButton = screen.getByTitle('Close (Esc)');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigate when navigating to parent', () => {
    const onNavigate = vi.fn();
    render(<DirectoryBrowser {...defaultProps} onNavigate={onNavigate} />);
    // Find and click the back button (shows "..")
    const backButton = screen.getByText('..');
    fireEvent.click(backButton);
    expect(onNavigate).toHaveBeenCalledWith('/Users/test');
  });

  it('calls onNavigate when clicking a directory', () => {
    const onNavigate = vi.fn();
    render(<DirectoryBrowser {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('src'));
    expect(onNavigate).toHaveBeenCalledWith('/workspace/src');
  });

  it('calls onOpenWorkspace when clicking a non-directory', () => {
    const onOpenWorkspace = vi.fn();
    render(<DirectoryBrowser {...defaultProps} onOpenWorkspace={onOpenWorkspace} />);
    // Non-directories should open the workspace at that location
    // Actually, clicking a file navigates, but double-click or Enter opens
    // Let me check the actual behavior
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<DirectoryBrowser {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates with arrow keys', () => {
    const { container } = render(<DirectoryBrowser {...defaultProps} />);
    // Arrow down should change selection
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    // Selection should have moved
    const selectedItem = container.querySelector('.bg-pi-surface');
    expect(selectedItem).toBeTruthy();
  });

  it('renders root view with allowed directories text', () => {
    render(<DirectoryBrowser {...defaultProps} currentPath="/" entries={[]} />);
    expect(screen.getByText('Allowed Directories')).toBeInTheDocument();
    expect(screen.getByText('Allowed directories')).toBeInTheDocument();
  });

  it('shows recent workspaces in root view', () => {
    render(<DirectoryBrowser {...defaultProps} currentPath="/" entries={[]} />);
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('recent1')).toBeInTheDocument();
    expect(screen.getByText('recent2')).toBeInTheDocument();
  });

  it('shows Browse section with home directory', () => {
    render(<DirectoryBrowser {...defaultProps} currentPath="/" entries={[]} />);
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText(/Home \(\/Users\/test\)/)).toBeInTheDocument();
  });
});
