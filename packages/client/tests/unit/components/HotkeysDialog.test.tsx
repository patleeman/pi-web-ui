import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HotkeysDialog } from '../../../src/components/HotkeysDialog';

describe('HotkeysDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<HotkeysDialog isOpen={false} onClose={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when open', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
  });

  describe('Dialog Structure', () => {
    it('has a title "Keyboard Shortcuts"', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard Shortcuts');
    });

    it('has a close button', () => {
      render(<HotkeysDialog {...defaultProps} />);
      const closeButton = screen.getByRole('button');
      expect(closeButton).toBeInTheDocument();
    });

    it('has a backdrop overlay', () => {
      const { container } = render(<HotkeysDialog {...defaultProps} />);
      const backdrop = container.querySelector('.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('Required Categories', () => {
    it('shows Input category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Input')).toBeInTheDocument();
    });

    it('shows Models & Thinking category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Models & Thinking')).toBeInTheDocument();
    });

    it('shows Display category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Display')).toBeInTheDocument();
    });

    it('shows Session category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Session')).toBeInTheDocument();
    });

    it('shows Panes category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Panes')).toBeInTheDocument();
    });

    it('shows Navigation category', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Navigation')).toBeInTheDocument();
    });
  });

  describe('Input Shortcuts', () => {
    it('shows Enter to send message', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Send message')).toBeInTheDocument();
      expect(screen.getByText('Enter')).toBeInTheDocument();
    });

    it('shows Escape to abort/clear', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Abort agent / clear input')).toBeInTheDocument();
      expect(screen.getAllByText('Escape').length).toBeGreaterThanOrEqual(1);
    });

    it('shows ! prefix for bash commands', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('!cmd')).toBeInTheDocument();
      expect(screen.getByText('Run bash & send to LLM')).toBeInTheDocument();
    });

    it('shows !! prefix for silent bash commands', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('!!cmd')).toBeInTheDocument();
      expect(screen.getByText('Run bash (no LLM)')).toBeInTheDocument();
    });

    it('shows @ for file reference', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('@')).toBeInTheDocument();
      expect(screen.getByText('Reference file')).toBeInTheDocument();
    });
  });

  describe('Model Shortcuts', () => {
    it('shows Ctrl+L for model selector', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Ctrl+L')).toBeInTheDocument();
      expect(screen.getByText('Open model selector')).toBeInTheDocument();
    });

    it('shows Ctrl+P for next model', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Ctrl+P')).toBeInTheDocument();
      expect(screen.getByText('Next model')).toBeInTheDocument();
    });

    it('shows Shift+Tab for thinking level', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Shift+Tab')).toBeInTheDocument();
      expect(screen.getByText('Cycle thinking level')).toBeInTheDocument();
    });
  });

  describe('Pane Shortcuts', () => {
    it('shows Ctrl+\\ for vertical split', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Ctrl+\\')).toBeInTheDocument();
      expect(screen.getByText('Split vertical')).toBeInTheDocument();
    });

    it('shows Ctrl+W for close pane', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Ctrl+W')).toBeInTheDocument();
      expect(screen.getByText('Close pane')).toBeInTheDocument();
    });
  });

  describe('Session Shortcuts', () => {
    it('shows Ctrl+. for abort', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText('Ctrl+.')).toBeInTheDocument();
      expect(screen.getByText('Abort agent (always)')).toBeInTheDocument();
    });
  });

  describe('Footer', () => {
    it('shows slash command hint in footer', () => {
      render(<HotkeysDialog {...defaultProps} />);
      expect(screen.getByText(/to see all slash commands/)).toBeInTheDocument();
    });

    it('shows / key in footer', () => {
      render(<HotkeysDialog {...defaultProps} />);
      const footer = screen.getByText(/to see all slash commands/).parentElement;
      expect(footer?.textContent).toContain('/');
    });
  });

  describe('Interaction', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<HotkeysDialog isOpen={true} onClose={onClose} />);
      
      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(<HotkeysDialog isOpen={true} onClose={onClose} />);
      
      const backdrop = container.querySelector('.bg-black\\/50');
      fireEvent.click(backdrop!);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<HotkeysDialog isOpen={true} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not respond to Escape when closed', () => {
      const onClose = vi.fn();
      render(<HotkeysDialog isOpen={false} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('uses kbd elements for keyboard shortcuts', () => {
      const { container } = render(<HotkeysDialog {...defaultProps} />);
      const kbdElements = container.querySelectorAll('kbd');
      expect(kbdElements.length).toBeGreaterThan(10); // Many shortcuts
    });

    it('dialog has proper z-index for overlay', () => {
      const { container } = render(<HotkeysDialog {...defaultProps} />);
      const backdrop = container.querySelector('.bg-black\\/50');
      expect(backdrop).toHaveClass('z-50');
    });
  });
});
