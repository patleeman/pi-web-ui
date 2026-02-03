import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '../../../src/components/StatusBar';

describe('StatusBar', () => {
  const defaultProps = {
    cwd: '/Users/test/project',
    gitBranch: 'main',
    gitChangedFiles: 3,
    runningCount: 0,
    compactingCount: 0,
    errorCount: 0,
    contextPercent: 25,
  };

  it('renders the current working directory', () => {
    render(<StatusBar {...defaultProps} />);
    expect(screen.getByText('/Users/test/project')).toBeInTheDocument();
  });

  it('shows git branch name', () => {
    render(<StatusBar {...defaultProps} />);
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('shows changed files count when there are changes', () => {
    render(<StatusBar {...defaultProps} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('does not show changed files when count is 0', () => {
    render(<StatusBar {...defaultProps} gitChangedFiles={0} />);
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  it('shows context usage percentage', () => {
    render(<StatusBar {...defaultProps} />);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('shows running count when there are running sessions', () => {
    render(<StatusBar {...defaultProps} runningCount={2} />);
    expect(screen.getByText('2 running')).toBeInTheDocument();
  });

  it('shows compacting indicator when compacting', () => {
    render(<StatusBar {...defaultProps} compactingCount={1} />);
    expect(screen.getByText('Compacting...')).toBeInTheDocument();
  });

  it('shows error count when there are errors', () => {
    render(<StatusBar {...defaultProps} errorCount={1} />);
    expect(screen.getByText('1 error')).toBeInTheDocument();
  });

  it('hides when keyboard is visible', () => {
    const { container } = render(<StatusBar {...defaultProps} isKeyboardVisible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show git info when gitBranch is null', () => {
    render(<StatusBar {...defaultProps} gitBranch={null} />);
    expect(screen.queryByText('main')).not.toBeInTheDocument();
  });
});
