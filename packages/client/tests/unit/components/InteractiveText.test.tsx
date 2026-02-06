import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders as render } from '../../utils/render';
import { InteractiveText } from '../../../src/components/InteractiveText';

describe('InteractiveText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('plain text', () => {
    it('renders plain text without links', () => {
      render(<InteractiveText content="Hello world" />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('preserves whitespace', () => {
      const { container } = render(<InteractiveText content="line 1\nline 2" />);
      expect(container.querySelector('.whitespace-pre-wrap')).toBeInTheDocument();
    });
  });

  describe('URL detection', () => {
    it('renders https URLs as links', () => {
      render(<InteractiveText content="Check https://example.com for details" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent('https://example.com');
    });

    it('renders http URLs as links', () => {
      render(<InteractiveText content="Visit http://localhost:3000/test" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'http://localhost:3000/test');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders www URLs with https prefix', () => {
      render(<InteractiveText content="Go to www.example.com" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://www.example.com');
      expect(link).toHaveTextContent('www.example.com');
    });

    it('handles multiple URLs in one text', () => {
      render(
        <InteractiveText content="See https://foo.com and https://bar.com" />
      );
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', 'https://foo.com');
      expect(links[1]).toHaveAttribute('href', 'https://bar.com');
    });

    it('strips trailing punctuation from URLs', () => {
      render(<InteractiveText content="Visit https://example.com." />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
    });
  });

  describe('file path detection', () => {
    it('renders absolute file paths as clickable buttons', () => {
      render(<InteractiveText content="Edit /src/components/App.tsx to fix it" />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('/src/components/App.tsx');
    });

    it('renders relative file paths as clickable buttons', () => {
      render(<InteractiveText content="See ./src/index.ts for details" />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('./src/index.ts');
    });

    it('renders parent-relative file paths as clickable', () => {
      render(<InteractiveText content="Check ../utils/helper.py please" />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('../utils/helper.py');
    });

    it('dispatches pi:openFile event on click', () => {
      const handler = vi.fn();
      window.addEventListener('pi:openFile', handler as EventListener);
      
      render(<InteractiveText content="Open /src/App.tsx" />);
      fireEvent.click(screen.getByRole('button'));
      
      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.path).toBe('/src/App.tsx');
      
      window.removeEventListener('pi:openFile', handler as EventListener);
    });

    it('does not match paths without known extensions', () => {
      render(<InteractiveText content="The word /hello is not a file" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not match directory paths without file extensions', () => {
      render(<InteractiveText content="Run cd /Users/foo/go/src/github.com/bar" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not match paths ending with trailing slash', () => {
      render(<InteractiveText content="Look in domains/scheduled_tasks/ for details" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles mixed URLs and file paths', () => {
      render(
        <InteractiveText content="See https://docs.example.com and /src/App.tsx" />
      );
      expect(screen.getByRole('link')).toHaveAttribute('href', 'https://docs.example.com');
      expect(screen.getByRole('button')).toHaveTextContent('/src/App.tsx');
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      const { container } = render(<InteractiveText content="" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles content with only a URL', () => {
      render(<InteractiveText content="https://example.com" />);
      expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com');
    });

    it('handles URLs with paths and query params', () => {
      render(<InteractiveText content="https://example.com/path?q=1&a=2#hash" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com/path?q=1&a=2#hash');
    });

    it('accepts custom className', () => {
      const { container } = render(<InteractiveText content="test" className="custom-class" />);
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });
});
