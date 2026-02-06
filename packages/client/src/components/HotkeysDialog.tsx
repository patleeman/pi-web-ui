import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface HotkeysDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const HOTKEYS = [
  { category: 'Input', keys: [
    { key: 'Enter', desc: 'Send message' },
    { key: 'Escape', desc: 'Clear input' },
    { key: 'Ctrl+C', desc: 'Clear input (no selection)' },
    { key: 'Ctrl+U', desc: 'Delete to line start' },
    { key: 'Ctrl+K', desc: 'Delete to line end' },
    { key: 'Alt+Enter', desc: 'Queue follow-up message' },
    { key: 'Alt+Up', desc: 'Retrieve queued messages' },
    { key: '@', desc: 'Reference file' },
    { key: '!cmd', desc: 'Run bash & send to LLM' },
    { key: '!!cmd', desc: 'Run bash (no LLM)' },
  ]},
  { category: 'Models & Thinking', keys: [
    { key: 'Ctrl+L', desc: 'Open model selector' },
    { key: 'Ctrl+P', desc: 'Next model' },
    { key: 'Shift+Ctrl+P', desc: 'Previous model' },
    { key: 'Shift+Tab', desc: 'Cycle thinking level' },
  ]},
  { category: 'Display', keys: [
    { key: 'Ctrl+O', desc: 'Collapse/expand all tools' },
    { key: 'Ctrl+T', desc: 'Collapse/expand all thinking' },
  ]},
  { category: 'Session', keys: [
    { key: 'Ctrl+.', desc: 'Abort agent' },
    { key: '/tree', desc: 'Session tree navigation' },
    { key: '/copy', desc: 'Copy last response' },
  ]},
  { category: 'Panes', keys: [
    { key: 'Ctrl+\\', desc: 'Split vertical' },
    { key: 'Shift+Ctrl+\\', desc: 'Split horizontal' },
    { key: 'Ctrl+W', desc: 'Close pane' },
    { key: 'Ctrl+1-4', desc: 'Switch workspace' },
  ]},
  { category: 'Navigation', keys: [
    { key: '/', desc: 'Slash commands' },
    { key: 'Ctrl+,', desc: 'Settings' },
    { key: 'Shift+Ctrl+F', desc: 'Toggle file pane' },
    { key: 'Shift+Ctrl+P', desc: 'Toggle plans tab' },
  ]},
];

export function HotkeysDialog({ isOpen, onClose }: HotkeysDialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[80vh] bg-pi-bg border border-pi-border rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-pi-accent" />
            <h2 className="text-lg font-mono text-pi-text">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-pi-muted hover:text-pi-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {HOTKEYS.map(({ category, keys }) => (
            <div key={category}>
              <h3 className="text-sm font-mono text-pi-muted mb-2">{category}</h3>
              <div className="space-y-1">
                {keys.map(({ key, desc }) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-pi-muted">{desc}</span>
                    <kbd className="px-2 py-0.5 bg-pi-surface border border-pi-border rounded text-pi-text font-mono text-xs">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-pi-border text-xs text-pi-muted">
          Type <kbd className="px-1 bg-pi-surface border border-pi-border rounded">/</kbd> to see all slash commands
        </div>
      </div>
    </>
  );
}
