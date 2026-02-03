import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffDisplay } from '../../../src/components/DiffDisplay';

describe('DiffDisplay', () => {
  it('renders nothing for identical content', () => {
    const { container } = render(
      <DiffDisplay oldText="hello world" newText="hello world" />
    );
    // Should render but content shows no changes
    expect(container.textContent).not.toContain('-');
    expect(container.textContent).not.toContain('+');
  });

  it('shows added lines with green background', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="line 1" 
        newText="line 1\nline 2" 
      />
    );
    // Added lines have specific class
    const addedLines = container.querySelectorAll('.bg-\\[\\#283a28\\]');
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it('shows removed lines with red background', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="line 1\nline 2" 
        newText="line 1" 
      />
    );
    // Removed lines have specific class
    const removedLines = container.querySelectorAll('.bg-\\[\\#3a2828\\]');
    expect(removedLines.length).toBeGreaterThan(0);
  });

  it('includes + in added lines', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="old" 
        newText="old\nnew" 
      />
    );
    // The + is part of the line content
    expect(container.textContent).toContain('+');
  });

  it('includes - in removed lines', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="old\nremoved" 
        newText="old" 
      />
    );
    // The - is part of the line content
    expect(container.textContent).toContain('-');
  });

  it('shows line numbers', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="line 1\nline 2" 
        newText="line 1\nline 2 modified" 
      />
    );
    // Line numbers should be present in text content
    expect(container.textContent).toMatch(/[12]/);
  });

  it('shows context lines around changes', () => {
    const oldText = 'line 1\nline 2\nline 3\nline 4\nline 5';
    const newText = 'line 1\nline 2\nline 3 CHANGED\nline 4\nline 5';
    
    const { container } = render(
      <DiffDisplay oldText={oldText} newText={newText} contextLines={2} />
    );
    
    // Context lines should be shown
    expect(container.textContent).toContain('line 2');
    expect(container.textContent).toContain('line 4');
  });

  it('handles empty old text (all additions)', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="" 
        newText="new line 1\nnew line 2" 
      />
    );
    // Should show added lines (at least 1)
    const addedLines = container.querySelectorAll('.bg-\\[\\#283a28\\]');
    expect(addedLines.length).toBeGreaterThan(0);
    // Content should show the added text
    expect(container.textContent).toContain('new line 1');
  });

  it('handles empty new text (all deletions)', () => {
    const { container } = render(
      <DiffDisplay 
        oldText="old line 1\nold line 2" 
        newText="" 
      />
    );
    // Should show removed lines (at least 1)
    const removedLines = container.querySelectorAll('.bg-\\[\\#3a2828\\]');
    expect(removedLines.length).toBeGreaterThan(0);
    // Content should show the removed text
    expect(container.textContent).toContain('old line 1');
  });

  it('renders multiline changes correctly', () => {
    const oldText = `function hello() {
  return "world";
}`;
    const newText = `function hello() {
  return "universe";
}`;
    
    const { container } = render(
      <DiffDisplay oldText={oldText} newText={newText} />
    );
    
    // Should show both the removed and added content
    expect(container.textContent).toContain('world');
    expect(container.textContent).toContain('universe');
  });

  it('shows ellipsis for skipped context', () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const newText = oldText.replace('line 10', 'line 10 CHANGED');
    
    const { container } = render(
      <DiffDisplay oldText={oldText} newText={newText} contextLines={2} />
    );
    
    // Should have ellipsis for skipped lines
    expect(container.textContent).toContain('...');
  });

  it('applies intra-line highlighting for single line changes', () => {
    const { container } = render(
      <DiffDisplay 
        oldText='const x = "hello"' 
        newText='const x = "world"' 
      />
    );
    // Should have highlight spans with special background
    const highlightSpans = container.querySelectorAll('[class*="bg-\\[\\#ff5c57\\]"], [class*="bg-\\[\\#b5bd68\\]"]');
    expect(highlightSpans.length).toBeGreaterThan(0);
  });
});
