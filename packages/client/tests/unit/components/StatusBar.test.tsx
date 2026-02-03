import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StatusBar } from '../../../src/components/StatusBar';

describe('StatusBar', () => {
  const defaultProps = {
    cwd: '/home/user/project',
    gitBranch: 'main',
    gitChangedFiles: 0,
    runningCount: 0,
    compactingCount: 0,
    errorCount: 0,
  };

  describe('Current Working Directory', () => {
    it('displays the current working directory', () => {
      render(<StatusBar {...defaultProps} cwd="/home/user/my-project" />);
      expect(screen.getByText('/home/user/my-project')).toBeInTheDocument();
    });

    it('shows full path in title attribute for accessibility', () => {
      render(<StatusBar {...defaultProps} cwd="/home/user/very/long/path/to/project" />);
      const pathElement = screen.getByText('/home/user/very/long/path/to/project');
      expect(pathElement).toHaveAttribute('title', '/home/user/very/long/path/to/project');
    });

    it('truncates very long paths visually while keeping full path accessible', () => {
      render(<StatusBar {...defaultProps} cwd="/home/user/very/long/path" />);
      const pathElement = screen.getByText('/home/user/very/long/path');
      expect(pathElement).toHaveClass('truncate');
    });
  });

  describe('Git Branch', () => {
    it('displays the git branch name when provided', () => {
      render(<StatusBar {...defaultProps} gitBranch="feature-branch" />);
      expect(screen.getByText('feature-branch')).toBeInTheDocument();
    });

    it('does not show git section when branch is null', () => {
      render(<StatusBar {...defaultProps} gitBranch={null} />);
      expect(screen.queryByText('main')).not.toBeInTheDocument();
    });

    it('applies success color to git branch', () => {
      render(<StatusBar {...defaultProps} gitBranch="main" />);
      const branchElement = screen.getByText('main');
      expect(branchElement.closest('span')).toHaveClass('text-pi-success');
    });
  });

  describe('Git Changed Files', () => {
    it('shows changed files count when there are changes', () => {
      render(<StatusBar {...defaultProps} gitBranch="main" gitChangedFiles={5} />);
      expect(screen.getByText('+5')).toBeInTheDocument();
    });

    it('does not show changed files when count is 0', () => {
      render(<StatusBar {...defaultProps} gitBranch="main" gitChangedFiles={0} />);
      expect(screen.queryByText('+0')).not.toBeInTheDocument();
    });

    it('applies warning color to changed files count', () => {
      render(<StatusBar {...defaultProps} gitBranch="main" gitChangedFiles={3} />);
      const countElement = screen.getByText('+3');
      expect(countElement).toHaveClass('text-pi-warning');
    });

    it('does not show changed files indicator when no git branch', () => {
      render(<StatusBar {...defaultProps} gitBranch={null} gitChangedFiles={5} />);
      expect(screen.queryByText('+5')).not.toBeInTheDocument();
    });
  });

  describe('Running Sessions Count', () => {
    it('shows running count when sessions are running', () => {
      render(<StatusBar {...defaultProps} runningCount={2} />);
      expect(screen.getByText('2 running')).toBeInTheDocument();
    });

    it('does not show running indicator when count is 0', () => {
      render(<StatusBar {...defaultProps} runningCount={0} />);
      expect(screen.queryByText(/running/i)).not.toBeInTheDocument();
    });

    it('shows singular "running" for count of 1', () => {
      render(<StatusBar {...defaultProps} runningCount={1} />);
      expect(screen.getByText('1 running')).toBeInTheDocument();
    });

    // SPEC: running is always "running" (not pluralized as "runnings")
    it('shows "running" for multiple (not pluralized)', () => {
      render(<StatusBar {...defaultProps} runningCount={5} />);
      // "running" is a verb/participle, not a noun, so stays the same
      expect(screen.getByText('5 running')).toBeInTheDocument();
    });
  });

  describe('Compacting Indicator', () => {
    it('shows compacting indicator when compacting', () => {
      render(<StatusBar {...defaultProps} compactingCount={1} />);
      expect(screen.getByText('Compacting...')).toBeInTheDocument();
    });

    it('does not show compacting indicator when count is 0', () => {
      render(<StatusBar {...defaultProps} compactingCount={0} />);
      expect(screen.queryByText(/compacting/i)).not.toBeInTheDocument();
    });

    it('applies warning color to compacting indicator', () => {
      render(<StatusBar {...defaultProps} compactingCount={1} />);
      const compactingElement = screen.getByText('Compacting...');
      expect(compactingElement).toHaveClass('text-pi-warning');
    });
  });

  describe('Error Count', () => {
    it('shows error count when there are errors', () => {
      render(<StatusBar {...defaultProps} errorCount={1} />);
      expect(screen.getByText('1 error')).toBeInTheDocument();
    });

    it('does not show error indicator when count is 0', () => {
      render(<StatusBar {...defaultProps} errorCount={0} />);
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    it('applies error color to error count', () => {
      render(<StatusBar {...defaultProps} errorCount={2} />);
      const errorElement = screen.getByText('2 errors');
      expect(errorElement).toHaveClass('text-pi-error');
    });

    // SPEC: Should show "errors" plural when count > 1
    it('should show "errors" plural when count > 1', () => {
      render(<StatusBar {...defaultProps} errorCount={3} />);
      expect(screen.getByText('3 errors')).toBeInTheDocument();
    });
  });

  describe('Context Usage', () => {
    it('shows context percentage when provided', () => {
      render(<StatusBar {...defaultProps} contextPercent={45} />);
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('does not show context usage when undefined', () => {
      render(<StatusBar {...defaultProps} contextPercent={undefined} />);
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });

    it('rounds context percentage to nearest integer', () => {
      render(<StatusBar {...defaultProps} contextPercent={45.7} />);
      expect(screen.getByText('46%')).toBeInTheDocument();
    });

    it('renders a progress bar for context usage', () => {
      const { container } = render(<StatusBar {...defaultProps} contextPercent={50} />);
      const progressBar = container.querySelector('.bg-pi-border.rounded-full');
      expect(progressBar).toBeInTheDocument();
    });

    it('progress bar width matches percentage', () => {
      const { container } = render(<StatusBar {...defaultProps} contextPercent={75} />);
      const progressFill = container.querySelector('.h-full.transition-all');
      expect(progressFill).toHaveStyle({ width: '75%' });
    });
  });

  describe('Keyboard Visibility (Mobile)', () => {
    it('hides status bar when keyboard is visible', () => {
      const { container } = render(<StatusBar {...defaultProps} isKeyboardVisible={true} />);
      expect(container.firstChild).toBeNull();
    });

    it('shows status bar when keyboard is not visible', () => {
      const { container } = render(<StatusBar {...defaultProps} isKeyboardVisible={false} />);
      expect(container.firstChild).not.toBeNull();
    });

    it('shows status bar by default (isKeyboardVisible defaults to false)', () => {
      const { container } = render(<StatusBar {...defaultProps} />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  describe('Layout', () => {
    it('uses monospace font', () => {
      const { container } = render(<StatusBar {...defaultProps} />);
      expect(container.firstChild).toHaveClass('font-mono');
    });

    it('has border on top', () => {
      const { container } = render(<StatusBar {...defaultProps} />);
      expect(container.firstChild).toHaveClass('border-t');
    });
  });
});
