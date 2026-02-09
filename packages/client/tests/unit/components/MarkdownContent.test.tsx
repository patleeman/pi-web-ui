import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MarkdownContent } from '../../../src/components/MarkdownContent';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';

// Wrapper with ThemeProvider
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}

describe('MarkdownContent', () => {
  it('renders plain text', () => {
    render(<MarkdownContent content="Hello world" />, { wrapper: Wrapper });
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', async () => {
    render(<MarkdownContent content="**bold text**" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('bold text')).toBeInTheDocument();
    });
    const boldEl = screen.getByText('bold text');
    expect(boldEl.tagName).toBe('STRONG');
  });

  it('renders italic text', async () => {
    render(<MarkdownContent content="*italic text*" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('italic text')).toBeInTheDocument();
    });
    const italicEl = screen.getByText('italic text');
    expect(italicEl.tagName).toBe('EM');
  });

  it('renders links', async () => {
    render(<MarkdownContent content="[click here](https://example.com)" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('click here')).toBeInTheDocument();
    });
    const link = screen.getByText('click here');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com');
  });

  it('renders inline code', () => {
    render(<MarkdownContent content="Use `npm install`" />, { wrapper: Wrapper });
    expect(screen.getByText(/npm install/)).toBeInTheDocument();
  });

  it('renders code blocks', async () => {
    const code = '```javascript\nconst x = 1;\n```';
    const { container } = render(<MarkdownContent content={code} />, { wrapper: Wrapper });
    
    await waitFor(() => {
      expect(container.textContent).toContain('const x = 1');
    });
  });

  it('renders headings', async () => {
    render(<MarkdownContent content="## Heading" />, { wrapper: Wrapper });
    await waitFor(() => {
      const heading = screen.getByText('Heading');
      expect(heading.tagName).toBe('H2');
    });
  });

  it('renders lists', async () => {
    const { container } = render(<MarkdownContent content="- item 1\n- item 2" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(container.textContent).toContain('item 1');
      expect(container.textContent).toContain('item 2');
    });
    // Check for list elements
    expect(container.querySelector('ul, ol')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<MarkdownContent content="test" className="custom-class" />, { wrapper: Wrapper });
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('renders blockquotes', async () => {
    render(<MarkdownContent content="> This is a quote" />, { wrapper: Wrapper });
    await waitFor(() => {
      const quote = screen.getByText('This is a quote');
      expect(quote.closest('blockquote')).toBeTruthy();
    });
  });

  it('handles empty content', () => {
    const { container } = render(<MarkdownContent content="" />, { wrapper: Wrapper });
    expect(container).toBeTruthy();
  });

  it('renders tables (GFM)', async () => {
    const table = '| Header |\n|---|\n| Cell |';
    const { container } = render(<MarkdownContent content={table} />, { wrapper: Wrapper });
    
    await waitFor(() => {
      expect(container.querySelector('table')).toBeTruthy();
    });
  });
});
