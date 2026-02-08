/**
 * Configurable hotkey system.
 *
 * Each hotkey has an action ID, a human-readable description, a category,
 * and a default key binding. Users can override bindings in Settings.
 *
 * Key binding format: modifier tokens joined by "+", ending with the key.
 *   Modifiers: Ctrl, Shift, Alt   (Ctrl maps to ⌘ on Mac)
 *   Key: single char or special name (Enter, Escape, Tab, ArrowUp, etc.)
 *   Examples: "Ctrl+,", "Shift+Ctrl+F", "Alt+Enter", "?"
 */

// ── Action definitions ──

export interface HotkeyDef {
  id: string;
  label: string;
  category: 'Navigation' | 'Panes' | 'Models & Thinking' | 'Display' | 'Input' | 'Session';
  /** Default key binding string */
  defaultKey: string;
}

export const HOTKEY_DEFS: HotkeyDef[] = [
  // Navigation
  { id: 'openSettings',    label: 'Open settings',               category: 'Navigation',         defaultKey: 'Ctrl+,' },
  { id: 'openDirectory',   label: 'Open directory browser',      category: 'Navigation',         defaultKey: 'Ctrl+O' },
  { id: 'showHotkeys',     label: 'Show keyboard shortcuts',     category: 'Navigation',         defaultKey: '?' },
  { id: 'toggleFilePane',  label: 'Toggle file pane',            category: 'Navigation',         defaultKey: 'Shift+Ctrl+F' },
  { id: 'toggleJobs',      label: 'Toggle jobs pane',            category: 'Navigation',         defaultKey: 'Shift+Ctrl+J' },

  // Panes
  { id: 'splitVertical',   label: 'Split vertical',              category: 'Panes',              defaultKey: 'Ctrl+\\' },
  { id: 'splitHorizontal', label: 'Split horizontal',            category: 'Panes',              defaultKey: 'Shift+Ctrl+\\' },
  { id: 'closePane',       label: 'Close pane',                  category: 'Panes',              defaultKey: 'Ctrl+W' },
  { id: 'stopAgent',       label: 'Stop agent',                  category: 'Panes',              defaultKey: 'Ctrl+.' },

  // Models & Thinking
  { id: 'modelSelector',   label: 'Open model selector',         category: 'Models & Thinking',  defaultKey: 'Ctrl+L' },
  { id: 'nextModel',       label: 'Next scoped model',           category: 'Models & Thinking',  defaultKey: 'Ctrl+P' },
  { id: 'prevModel',       label: 'Previous scoped model',       category: 'Models & Thinking',  defaultKey: 'Shift+Ctrl+P' },
  { id: 'cycleThinking',   label: 'Cycle thinking level',        category: 'Models & Thinking',  defaultKey: 'Shift+Tab' },

  // Display
  { id: 'toggleTools',     label: 'Collapse/expand all tools',   category: 'Display',            defaultKey: 'Ctrl+O' },
  { id: 'toggleThinking',  label: 'Collapse/expand all thinking',category: 'Display',            defaultKey: 'Ctrl+T' },

  // Input
  { id: 'queueFollowUp',   label: 'Queue follow-up message',    category: 'Input',              defaultKey: 'Alt+Enter' },
  { id: 'retrieveQueued',  label: 'Retrieve queued messages',    category: 'Input',              defaultKey: 'Alt+ArrowUp' },
];

// ── Parsing ──

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string; // normalized lowercase for letters, original case for special keys
}

export function parseKeyBinding(binding: string): ParsedKey {
  const parts = binding.split('+');
  const result: ParsedKey = { ctrl: false, shift: false, alt: false, key: '' };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'cmd' || lower === '⌘') {
      result.ctrl = true;
    } else if (lower === 'shift') {
      result.shift = true;
    } else if (lower === 'alt' || lower === 'opt' || lower === '⌥') {
      result.alt = true;
    } else {
      // This is the key itself
      result.key = part;
    }
  }

  return result;
}

// ── Matching ──

/**
 * Check if a keyboard event matches a key binding string.
 * `overrides` is the user's custom bindings (action → binding string).
 */
export function matchesHotkey(
  e: KeyboardEvent | React.KeyboardEvent,
  actionId: string,
  overrides: Record<string, string> = {},
): boolean {
  const def = HOTKEY_DEFS.find(d => d.id === actionId);
  if (!def) return false;

  const binding = overrides[actionId] || def.defaultKey;
  const parsed = parseKeyBinding(binding);

  // Ctrl maps to metaKey on Mac, ctrlKey everywhere else
  const modMatch = (e.metaKey || e.ctrlKey) === parsed.ctrl;
  const shiftMatch = e.shiftKey === parsed.shift;
  const altMatch = e.altKey === parsed.alt;

  // Key comparison: for single characters compare case-insensitively,
  // for special keys (Enter, Tab, Escape, Arrow*, etc.) compare exact.
  let keyMatch: boolean;
  if (parsed.key.length === 1) {
    keyMatch = e.key.toLowerCase() === parsed.key.toLowerCase();
  } else {
    // Special keys like Enter, Tab, Escape, ArrowUp, etc.
    keyMatch = e.key === parsed.key;
  }

  return modMatch && shiftMatch && altMatch && keyMatch;
}

/**
 * Get the effective binding for an action (user override or default).
 */
export function getBinding(actionId: string, overrides: Record<string, string> = {}): string {
  if (overrides[actionId]) return overrides[actionId];
  const def = HOTKEY_DEFS.find(d => d.id === actionId);
  return def?.defaultKey || '';
}

// ── Display helpers ──

const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');

/** Format a binding string for display (Ctrl → ⌘ on Mac). */
export function formatBinding(binding: string): string {
  if (!binding) return '';
  if (isMac) {
    return binding
      .replace(/Ctrl\+/gi, '⌘')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Shift\+/gi, '⇧');
  }
  return binding;
}

/**
 * Convert a keyboard event to a binding string.
 * Used by the key recorder in Settings.
 */
export function eventToBinding(e: KeyboardEvent | React.KeyboardEvent): string | null {
  // Ignore bare modifier presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.shiftKey) parts.push('Shift');
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');

  // Normalize key name
  let key = e.key;
  if (key === ' ') key = 'Space';
  // Single printable chars: use the key as-is (uppercase for letters when shift isn't a modifier we care about)
  // For letters, store uppercase if it's a single char
  if (key.length === 1 && !e.altKey) {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join('+');
}

/** Group hotkey defs by category. */
export function groupedHotkeyDefs(): Array<{ category: string; defs: HotkeyDef[] }> {
  const groups: Record<string, HotkeyDef[]> = {};
  for (const def of HOTKEY_DEFS) {
    if (!groups[def.category]) groups[def.category] = [];
    groups[def.category].push(def);
  }
  return Object.entries(groups).map(([category, defs]) => ({ category, defs }));
}
