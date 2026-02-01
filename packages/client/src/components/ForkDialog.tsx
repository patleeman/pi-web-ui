import { useState, useEffect, useCallback } from 'react';
import { X, GitBranch } from 'lucide-react';

interface ForkMessage {
  entryId: string;
  text: string;
}

interface ForkDialogProps {
  isOpen: boolean;
  messages: ForkMessage[];
  onFork: (entryId: string) => void;
  onClose: () => void;
}

export function ForkDialog({ isOpen, messages, onFork, onClose }: ForkDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(messages.length - 1);
    }
  }, [isOpen, messages.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(messages.length - 1, i + 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (messages[selectedIndex]) {
          onFork(messages[selectedIndex].entryId);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [isOpen, messages, selectedIndex, onFork, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[60vh] bg-pi-bg border border-pi-border rounded z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border flex-shrink-0">
          <div className="flex items-center gap-2 text-pi-text">
            <GitBranch className="w-4 h-4" />
            <span className="text-[14px]">Fork from message</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-pi-muted hover:text-pi-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="p-4 text-pi-muted text-[14px] text-center">
              No messages to fork from
            </div>
          ) : (
            <div className="py-2">
              {messages.map((msg, index) => (
                <button
                  key={msg.entryId}
                  onClick={() => onFork(msg.entryId)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-4 py-2 text-left text-[13px] transition-colors ${
                    index === selectedIndex
                      ? 'bg-pi-surface text-pi-text'
                      : 'text-pi-muted hover:bg-pi-surface/50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-pi-muted w-6 flex-shrink-0">{index + 1}.</span>
                    <span className="truncate">{msg.text}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-pi-border text-[11px] text-pi-muted">
          ↑↓ navigate • Enter select • Esc cancel
        </div>
      </div>
    </>
  );
}
