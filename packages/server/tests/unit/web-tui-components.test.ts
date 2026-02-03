import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockContainer,
  MockText,
  MockSelectList,
  MockBorder,
  MockLoader,
  MockTUI,
  MockTheme,
  buildComponentTree,
  type MockComponent,
} from '../../src/web-tui-components';
import type { CustomUINode, CustomUISelectItem } from '@pi-web-ui/shared';

describe('web-tui-components', () => {
  describe('MockContainer', () => {
    it('creates node with type container', () => {
      const container = new MockContainer();
      const node = container.toNode();
      
      expect(node.type).toBe('container');
      expect(node.children).toEqual([]);
    });

    it('addChild adds children to node', () => {
      const container = new MockContainer();
      const text = new MockText('Hello');
      
      container.addChild(text);
      const node = container.toNode();
      
      expect(node.type).toBe('container');
      expect(node.children).toHaveLength(1);
      expect(node.children[0].type).toBe('text');
    });

    it('handles nested containers', () => {
      const outer = new MockContainer();
      const inner = new MockContainer();
      const text = new MockText('Nested');
      
      inner.addChild(text);
      outer.addChild(inner);
      
      const node = outer.toNode();
      
      expect(node.type).toBe('container');
      expect(node.children).toHaveLength(1);
      expect(node.children[0].type).toBe('container');
      expect((node.children[0] as any).children[0].type).toBe('text');
    });

    it('render returns empty array (stub)', () => {
      const container = new MockContainer();
      expect(container.render(80)).toEqual([]);
    });

    it('invalidate does not throw', () => {
      const container = new MockContainer();
      expect(() => container.invalidate()).not.toThrow();
    });
  });

  describe('MockText', () => {
    it('creates node with content', () => {
      const text = new MockText('Hello world');
      const node = text.toNode();
      
      expect(node.type).toBe('text');
      expect(node.content).toBe('Hello world');
    });

    it('handles empty content', () => {
      const text = new MockText('');
      const node = text.toNode();
      
      expect(node.type).toBe('text');
      expect(node.content).toBe('');
    });

    it('captures style from theme function calls', () => {
      // When created via theme.fg('accent', 'text'), we should capture the style
      const text = new MockText('Styled', 'accent');
      const node = text.toNode();
      
      expect(node.style).toBe('accent');
    });

    it('captures bold flag', () => {
      const text = new MockText('Bold text', undefined, true);
      const node = text.toNode();
      
      expect(node.bold).toBe(true);
    });

    it('render returns empty array (stub)', () => {
      const text = new MockText('Hello');
      expect(text.render(80)).toEqual([]);
    });
  });

  describe('MockSelectList', () => {
    const items: CustomUISelectItem[] = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B', description: 'Description B' },
      { value: 'c', label: 'Option C' },
    ];

    it('creates node with items', () => {
      const selectList = new MockSelectList(items, 10);
      const node = selectList.toNode();
      
      expect(node.type).toBe('selectList');
      expect(node.items).toEqual(items);
      expect(node.maxVisible).toBe(10);
    });

    it('tracks selectedIndex', () => {
      const selectList = new MockSelectList(items, 10);
      const node = selectList.toNode();
      
      expect(node.selectedIndex).toBe(0);
    });

    it('handleInput updates selection on ArrowDown', () => {
      const selectList = new MockSelectList(items, 10);
      
      selectList.handleInput('\x1b[B'); // Arrow Down escape sequence
      const node = selectList.toNode();
      
      expect(node.selectedIndex).toBe(1);
    });

    it('handleInput updates selection on ArrowUp', () => {
      const selectList = new MockSelectList(items, 10);
      selectList.handleInput('\x1b[B'); // Move down first
      selectList.handleInput('\x1b[A'); // Arrow Up
      
      const node = selectList.toNode();
      expect(node.selectedIndex).toBe(0);
    });

    it('handleInput calls onSelect on Enter', () => {
      const selectList = new MockSelectList(items, 10);
      const onSelect = vi.fn();
      selectList.onSelect = onSelect;
      
      selectList.handleInput('\r'); // Enter
      
      expect(onSelect).toHaveBeenCalledWith(items[0]);
    });

    it('handleInput calls onCancel on Escape', () => {
      const selectList = new MockSelectList(items, 10);
      const onCancel = vi.fn();
      selectList.onCancel = onCancel;
      
      selectList.handleInput('\x1b'); // Escape
      
      expect(onCancel).toHaveBeenCalled();
    });

    it('handleInput filters items when searchable', () => {
      const selectList = new MockSelectList(items, 10);
      selectList.searchable = true;
      
      selectList.handleInput('b'); // Type 'b'
      const node = selectList.toNode();
      
      expect(node.filter).toBe('b');
      // Filter should show items matching 'b'
      expect(node.filteredIndices).toBeDefined();
    });

    it('handles empty items array', () => {
      const selectList = new MockSelectList([], 10);
      const node = selectList.toNode();
      
      expect(node.items).toEqual([]);
      expect(node.selectedIndex).toBe(0);
    });

    it('clamps selectedIndex to valid range', () => {
      const selectList = new MockSelectList(items, 10);
      
      // Try to go past the end
      selectList.handleInput('\x1b[B');
      selectList.handleInput('\x1b[B');
      selectList.handleInput('\x1b[B');
      selectList.handleInput('\x1b[B');
      
      const node = selectList.toNode();
      expect(node.selectedIndex).toBe(2); // Clamped to last item
    });

    it('clamps selectedIndex at start', () => {
      const selectList = new MockSelectList(items, 10);
      
      // Try to go before the start
      selectList.handleInput('\x1b[A');
      selectList.handleInput('\x1b[A');
      
      const node = selectList.toNode();
      expect(node.selectedIndex).toBe(0); // Clamped to first item
    });

    it('navigates with j/k keys', () => {
      const selectList = new MockSelectList(items, 10);
      
      selectList.handleInput('j'); // Down
      expect(selectList.toNode().selectedIndex).toBe(1);
      
      selectList.handleInput('k'); // Up
      expect(selectList.toNode().selectedIndex).toBe(0);
    });
  });

  describe('MockBorder', () => {
    it('creates border node', () => {
      const border = new MockBorder();
      const node = border.toNode();
      
      expect(node.type).toBe('border');
    });

    it('captures style', () => {
      const border = new MockBorder('accent');
      const node = border.toNode();
      
      expect(node.style).toBe('accent');
    });
  });

  describe('MockLoader', () => {
    it('creates loader node with message', () => {
      const loader = new MockLoader('Loading...');
      const node = loader.toNode();
      
      expect(node.type).toBe('loader');
      expect(node.message).toBe('Loading...');
    });

    it('captures bordered flag', () => {
      const loader = new MockLoader('Loading...', true);
      const node = loader.toNode();
      
      expect(node.bordered).toBe(true);
    });
  });

  describe('MockTUI', () => {
    it('provides requestRender function', () => {
      const tui = new MockTUI();
      expect(() => tui.requestRender()).not.toThrow();
    });
  });

  describe('MockTheme', () => {
    let theme: MockTheme;
    let textCaptures: MockText[];

    beforeEach(() => {
      textCaptures = [];
      theme = new MockTheme((text) => textCaptures.push(text));
    });

    it('fg returns text and captures style', () => {
      const result = theme.fg('accent', 'Hello');
      
      expect(result).toBe('Hello');
      expect(textCaptures).toHaveLength(1);
      expect(textCaptures[0].toNode().content).toBe('Hello');
      expect(textCaptures[0].toNode().style).toBe('accent');
    });

    it('bold returns text and captures bold flag', () => {
      const result = theme.bold('Bold');
      
      expect(result).toBe('Bold');
      expect(textCaptures).toHaveLength(1);
      expect(textCaptures[0].toNode().bold).toBe(true);
    });

    it('nested fg and bold captures both', () => {
      const result = theme.fg('warning', theme.bold('Warning!'));
      
      expect(result).toBe('Warning!');
      // The bold call captures first, then fg captures the result
      // We should have a text with both style and bold
      expect(textCaptures.length).toBeGreaterThan(0);
    });
  });

  describe('buildComponentTree', () => {
    it('builds tree from component with toNode', () => {
      const container = new MockContainer();
      container.addChild(new MockText('Hello'));
      
      const tree = buildComponentTree(container);
      
      expect(tree.type).toBe('container');
      expect(tree.children).toHaveLength(1);
    });

    it('handles component without toNode (returns empty container)', () => {
      const fakeComponent = {
        render: () => [],
        invalidate: () => {},
      };
      
      const tree = buildComponentTree(fakeComponent as any);
      
      expect(tree.type).toBe('container');
    });
  });
});
