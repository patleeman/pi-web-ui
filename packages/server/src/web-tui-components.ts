/**
 * Mock TUI components for web mode.
 * 
 * These components mirror the pi-tui API but instead of rendering ANSI strings,
 * they build a serializable component tree that can be sent to the web client
 * and rendered with React components.
 * 
 * The approach:
 * 1. Extension calls ctx.ui.custom(factory)
 * 2. factory receives mock TUI, theme, keybindings, done
 * 3. factory creates components (MockContainer, MockSelectList, etc.)
 * 4. We extract the component tree via toNode()
 * 5. Tree is serialized and sent to client
 * 6. Client renders with React equivalents
 * 7. Client input events are routed to handleInput()
 * 8. Tree is re-extracted and sent as update
 */

import type {
  CustomUINode,
  CustomUIContainerNode,
  CustomUITextNode,
  CustomUIBorderNode,
  CustomUISelectListNode,
  CustomUILoaderNode,
  CustomUISelectItem,
} from '@pi-web-ui/shared';

// ============================================================================
// Component Interface
// ============================================================================

/** Interface for mock components that can convert to serializable nodes */
export interface MockComponent {
  /** Convert to serializable node */
  toNode(): CustomUINode;
  /** Stub render method (returns empty - actual rendering is done client-side) */
  render(width: number): string[];
  /** Stub invalidate method */
  invalidate(): void;
  /** Handle input (for interactive components) */
  handleInput?(data: string): void;
}

// ID counter for generating unique node IDs
let nodeIdCounter = 0;
function generateNodeId(): string {
  return `node-${++nodeIdCounter}`;
}

/** Reset node ID counter (for testing) */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

// ============================================================================
// MockContainer
// ============================================================================

export class MockContainer implements MockComponent {
  private id = generateNodeId();
  private children: MockComponent[] = [];

  addChild(child: MockComponent): void {
    this.children.push(child);
  }

  toNode(): CustomUIContainerNode {
    return {
      id: this.id,
      type: 'container',
      children: this.children.map((c) => c.toNode()),
    };
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {
    // No-op in mock
  }
}

// ============================================================================
// MockText
// ============================================================================

export class MockText implements MockComponent {
  private id = generateNodeId();

  constructor(
    private content: string,
    private style?: 'normal' | 'accent' | 'muted' | 'dim' | 'warning' | 'error',
    private bold?: boolean
  ) {}

  toNode(): CustomUITextNode {
    return {
      id: this.id,
      type: 'text',
      content: this.content,
      style: this.style,
      bold: this.bold,
    };
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {
    // No-op in mock
  }
}

// ============================================================================
// MockSelectList
// ============================================================================

export class MockSelectList implements MockComponent {
  private id = generateNodeId();
  private selectedIndex = 0;
  private filter = '';
  private filteredIndices: number[] | undefined;

  /** Callback when item is selected */
  onSelect?: (item: CustomUISelectItem) => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Callback when selection changes */
  onSelectionChange?: (item: CustomUISelectItem) => void;
  /** Whether search/filter is enabled */
  searchable = false;

  constructor(
    private items: CustomUISelectItem[],
    private maxVisible: number,
    _theme?: any // Theme is ignored in mock - styling is done client-side
  ) {}

  toNode(): CustomUISelectListNode {
    return {
      id: this.id,
      type: 'selectList',
      items: this.items,
      selectedIndex: this.selectedIndex,
      maxVisible: this.maxVisible,
      searchable: this.searchable,
      filter: this.filter || undefined,
      filteredIndices: this.filteredIndices,
    };
  }

  /** Get currently selected item */
  getSelectedItem(): CustomUISelectItem | null {
    if (this.items.length === 0) return null;
    
    if (this.filteredIndices) {
      const actualIndex = this.filteredIndices[this.selectedIndex];
      return this.items[actualIndex] ?? null;
    }
    
    return this.items[this.selectedIndex] ?? null;
  }

  /** Get the list of items currently visible (filtered or all) */
  private getVisibleItems(): CustomUISelectItem[] {
    if (this.filteredIndices) {
      return this.filteredIndices.map((i) => this.items[i]);
    }
    return this.items;
  }

  /** Update filter and recalculate filtered indices */
  private updateFilter(newFilter: string): void {
    this.filter = newFilter;
    
    if (!newFilter) {
      this.filteredIndices = undefined;
      return;
    }

    const lowerFilter = newFilter.toLowerCase();
    this.filteredIndices = this.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.label.toLowerCase().includes(lowerFilter))
      .map(({ index }) => index);
    
    // Reset selection to first filtered item
    this.selectedIndex = 0;
  }

  handleInput(data: string): void {
    const visibleItems = this.getVisibleItems();
    const maxIndex = Math.max(0, visibleItems.length - 1);

    // Arrow keys / j/k navigation
    if (data === '\x1b[B' || data === 'j') {
      // Arrow Down or j
      this.selectedIndex = Math.min(this.selectedIndex + 1, maxIndex);
      this.notifySelectionChange();
      return;
    }

    if (data === '\x1b[A' || data === 'k') {
      // Arrow Up or k
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.notifySelectionChange();
      return;
    }

    // Enter - select current item
    if (data === '\r' || data === '\n') {
      const item = this.getSelectedItem();
      if (item && this.onSelect) {
        this.onSelect(item);
      }
      return;
    }

    // Escape - cancel
    if (data === '\x1b' && !data.startsWith('\x1b[')) {
      // Plain escape (not an escape sequence)
      if (this.onCancel) {
        this.onCancel();
      }
      return;
    }

    // If searchable, handle typing
    if (this.searchable && data.length === 1 && data >= ' ') {
      this.updateFilter(this.filter + data);
      return;
    }

    // Backspace in search mode
    if (this.searchable && (data === '\x7f' || data === '\b')) {
      if (this.filter.length > 0) {
        this.updateFilter(this.filter.slice(0, -1));
      }
      return;
    }
  }

  private notifySelectionChange(): void {
    if (this.onSelectionChange) {
      const item = this.getSelectedItem();
      if (item) {
        this.onSelectionChange(item);
      }
    }
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {
    // No-op in mock
  }
}

// ============================================================================
// MockBorder (DynamicBorder equivalent)
// ============================================================================

export class MockBorder implements MockComponent {
  private id = generateNodeId();

  constructor(
    private style?: 'accent' | 'muted' | 'dim'
  ) {}

  toNode(): CustomUIBorderNode {
    return {
      id: this.id,
      type: 'border',
      style: this.style,
    };
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {
    // No-op in mock
  }
}

// ============================================================================
// MockLoader
// ============================================================================

export class MockLoader implements MockComponent {
  private id = generateNodeId();

  /** Callback when aborted */
  onAbort?: () => void;

  constructor(
    private message: string,
    private bordered = false
  ) {}

  toNode(): CustomUILoaderNode {
    return {
      id: this.id,
      type: 'loader',
      message: this.message,
      bordered: this.bordered,
    };
  }

  handleInput(data: string): void {
    // Escape or Ctrl+C to abort
    if (data === '\x1b' || data === '\x03') {
      if (this.onAbort) {
        this.onAbort();
      }
    }
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {
    // No-op in mock
  }
}

// ============================================================================
// MockTUI
// ============================================================================

/** Mock TUI instance passed to custom() factory */
export class MockTUI {
  requestRender(): void {
    // No-op in mock - client handles rendering
  }
}

// ============================================================================
// MockTheme
// ============================================================================

/**
 * Mock theme that captures styling information.
 * 
 * When theme.fg('accent', 'text') is called, we capture both the text
 * and the style so it can be applied client-side.
 */
export class MockTheme {
  /** Callback to capture created text nodes */
  private captureText?: (text: MockText) => void;

  constructor(captureText?: (text: MockText) => void) {
    this.captureText = captureText;
  }

  /**
   * Apply foreground color style.
   * Returns the text as-is but captures the style information.
   */
  fg(color: string, text: string): string {
    const style = this.colorToStyle(color);
    const mockText = new MockText(text, style);
    this.captureText?.(mockText);
    return text;
  }

  /**
   * Apply bold style.
   * Returns the text as-is but captures the bold flag.
   */
  bold(text: string): string {
    const mockText = new MockText(text, undefined, true);
    this.captureText?.(mockText);
    return text;
  }

  /** Convert color name to style enum */
  private colorToStyle(color: string): CustomUITextNode['style'] {
    switch (color) {
      case 'accent':
        return 'accent';
      case 'muted':
        return 'muted';
      case 'dim':
        return 'dim';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'normal';
    }
  }
}

// ============================================================================
// Mock Keybindings Manager
// ============================================================================

/** Mock keybindings manager */
export class MockKeybindingsManager {
  // Stub implementation - keybindings are handled client-side
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a serializable component tree from a mock component.
 */
export function buildComponentTree(component: MockComponent): CustomUINode {
  if (typeof component.toNode === 'function') {
    return component.toNode();
  }
  
  // Fallback for components without toNode
  return {
    id: generateNodeId(),
    type: 'container',
    children: [],
  };
}

/**
 * Find a component by ID in the tree (for routing input events).
 */
export function findComponentById(
  root: MockComponent,
  targetId: string,
  visited = new Set<MockComponent>()
): MockComponent | null {
  if (visited.has(root)) return null;
  visited.add(root);

  const node = root.toNode();
  if (node.id === targetId) {
    return root;
  }

  // Check children if container
  if (root instanceof MockContainer) {
    const containerNode = node as CustomUIContainerNode;
    // We need to iterate the actual children, not the serialized ones
    // This requires access to the children array
    // For now, we'll store a reference to find children
  }

  return null;
}
