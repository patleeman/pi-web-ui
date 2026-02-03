import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from '../../../src/components/ConnectionStatus';

describe('ConnectionStatus', () => {
  describe('When Connected', () => {
    it('renders nothing when connected and no error', () => {
      const { container } = render(<ConnectionStatus isConnected={true} error={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when connected with empty error string', () => {
      const { container } = render(<ConnectionStatus isConnected={true} error="" />);
      // Empty string is falsy, should still render (but show "disconnected" message)
      // Actually checking the logic: error || 'disconnected...' means empty string shows default
      // But isConnected && !error = true && !'' = true && true = true, so returns null
      expect(container.firstChild).toBeNull();
    });
  });

  describe('When Disconnected', () => {
    it('shows disconnected message when not connected', () => {
      render(<ConnectionStatus isConnected={false} error={null} />);
      expect(screen.getByText(/disconnected, reconnecting/)).toBeInTheDocument();
    });

    it('shows error prefix [!]', () => {
      render(<ConnectionStatus isConnected={false} error={null} />);
      expect(screen.getByText(/\[!\]/)).toBeInTheDocument();
    });
  });

  describe('With Error', () => {
    it('shows error message when error is present', () => {
      render(<ConnectionStatus isConnected={false} error="Connection failed: timeout" />);
      expect(screen.getByText(/Connection failed: timeout/)).toBeInTheDocument();
    });

    it('shows error even when connected (edge case)', () => {
      render(<ConnectionStatus isConnected={true} error="Warning: connection unstable" />);
      // isConnected && !error = true && false = false, so shows banner
      expect(screen.getByText(/Warning: connection unstable/)).toBeInTheDocument();
    });

    it('shows custom error instead of default disconnected message', () => {
      render(<ConnectionStatus isConnected={false} error="Server unavailable" />);
      expect(screen.getByText(/Server unavailable/)).toBeInTheDocument();
      expect(screen.queryByText(/disconnected, reconnecting/)).not.toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('uses error background color', () => {
      const { container } = render(<ConnectionStatus isConnected={false} error={null} />);
      expect(container.firstChild).toHaveClass('bg-pi-error/10');
    });

    it('uses error border color', () => {
      const { container } = render(<ConnectionStatus isConnected={false} error={null} />);
      expect(container.firstChild).toHaveClass('border-pi-error/30');
    });

    it('uses error text color', () => {
      const { container } = render(<ConnectionStatus isConnected={false} error={null} />);
      expect(container.firstChild).toHaveClass('text-pi-error');
    });

    it('uses monospace font', () => {
      const { container } = render(<ConnectionStatus isConnected={false} error={null} />);
      expect(container.firstChild).toHaveClass('font-mono');
    });

    it('uses small text size', () => {
      const { container } = render(<ConnectionStatus isConnected={false} error={null} />);
      expect(container.firstChild).toHaveClass('text-xs');
    });
  });
});
