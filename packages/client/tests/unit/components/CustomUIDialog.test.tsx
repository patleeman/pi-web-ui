import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomUIDialog } from '../../../src/components/CustomUIDialog';
import type { CustomUIState, CustomUIInputEvent } from '@pi-web-ui/shared';

describe('CustomUIDialog', () => {
  const defaultOnInput = vi.fn();
  const defaultOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Container Node', () => {
    it('renders container node with children', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'text1', type: 'text', content: 'Hello' },
            { id: 'text2', type: 'text', content: 'World' },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('World')).toBeInTheDocument();
    });
  });

  describe('Text Node', () => {
    it('renders text node with content', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'text1', type: 'text', content: 'Hello World' },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders text node with accent style', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'text1', type: 'text', content: 'Accent text', style: 'accent' },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      const text = screen.getByText('Accent text');
      expect(text).toHaveClass('text-pi-accent');
    });

    it('renders text node with bold', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'text1', type: 'text', content: 'Bold text', bold: true },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      const text = screen.getByText('Bold text');
      expect(text).toHaveClass('font-bold');
    });
  });

  describe('SelectList Node', () => {
    const selectListState: CustomUIState = {
      sessionId: 'test-1',
      root: {
        id: 'root',
        type: 'container',
        children: [
          {
            id: 'select1',
            type: 'selectList',
            items: [
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B', description: 'Description B' },
              { value: 'c', label: 'Option C' },
            ],
            selectedIndex: 0,
            maxVisible: 10,
          },
        ],
      },
    };

    it('renders selectList with items', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
      expect(screen.getByText('Option C')).toBeInTheDocument();
    });

    it('highlights selected item', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      // First item should be selected (highlighted)
      const optionA = screen.getByText('Option A').closest('button');
      expect(optionA).toHaveClass('bg-pi-accent/20');
    });

    it('renders item descriptions', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Description B')).toBeInTheDocument();
    });

    it('handles keyboard navigation with ArrowDown', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.keyDown(document, { key: 'ArrowDown' });

      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'key',
        key: 'ArrowDown',
      });
    });

    it('handles Enter key to select', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'key',
        key: 'Enter',
      });
    });

    it('handles Escape key to cancel', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'key',
        key: 'Escape',
      });
    });

    it('handles click on item', () => {
      render(
        <CustomUIDialog state={selectListState} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.click(screen.getByText('Option B'));

      // Clicking should send the value of the clicked item
      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'select',
        nodeId: 'select1',
        value: 'b',
      });
    });
  });

  describe('Border Node', () => {
    it('renders border as visual separator', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'border1', type: 'border' },
          ],
        },
      };

      const { container } = render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      // Border should render as an hr or div with border styling
      expect(container.querySelector('.border-pi-border')).toBeInTheDocument();
    });
  });

  describe('Loader Node', () => {
    it('renders loader with message', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'loader1', type: 'loader', message: 'Loading...' },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders loader with spinner animation', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'loader1', type: 'loader', message: 'Loading...' },
          ],
        },
      };

      const { container } = render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      // Should have a spinner element with animation
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Unknown Node Type', () => {
    it('handles unknown node type gracefully', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'unknown1', type: 'unknownType' as any, content: 'test' },
          ],
        },
      };

      const { container } = render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      // Should not crash, just render empty or nothing for unknown type
      expect(container).toBeInTheDocument();
    });
  });

  describe('Nested Components', () => {
    it('handles deeply nested components', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            {
              id: 'outer',
              type: 'container',
              children: [
                {
                  id: 'inner',
                  type: 'container',
                  children: [
                    { id: 'text1', type: 'text', content: 'Deep nested text' },
                  ],
                },
              ],
            },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Deep nested text')).toBeInTheDocument();
    });
  });

  describe('Title', () => {
    it('renders title when provided', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        title: 'Select an Option',
        root: {
          id: 'root',
          type: 'container',
          children: [],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      expect(screen.getByText('Select an Option')).toBeInTheDocument();
    });
  });

  describe('Keyboard Handling', () => {
    it('sends j key for vim-style navigation', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            {
              id: 'select1',
              type: 'selectList',
              items: [{ value: 'a', label: 'A' }],
              selectedIndex: 0,
              maxVisible: 10,
            },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.keyDown(document, { key: 'j' });

      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'key',
        key: 'j',
      });
    });

    it('sends typing input when searchable', () => {
      const state: CustomUIState = {
        sessionId: 'test-1',
        root: {
          id: 'root',
          type: 'container',
          children: [
            {
              id: 'select1',
              type: 'selectList',
              items: [{ value: 'a', label: 'A' }],
              selectedIndex: 0,
              maxVisible: 10,
              searchable: true,
            },
          ],
        },
      };

      render(
        <CustomUIDialog state={state} onInput={defaultOnInput} onClose={defaultOnClose} />
      );

      fireEvent.keyDown(document, { key: 'b' });

      expect(defaultOnInput).toHaveBeenCalledWith({
        sessionId: 'test-1',
        inputType: 'key',
        key: 'b',
      });
    });
  });
});
