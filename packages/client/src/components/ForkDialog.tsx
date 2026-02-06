import { useEffect, useRef } from 'react';
import { GitBranch } from 'lucide-react';

interface ForkMessage {
  entryId: string;
  text: string;
}

interface ForkDialogProps {
  messages: ForkMessage[];
  selectedIndex: number;
  onSelect: (entryId: string) => void;
}

export function ForkDialog({ messages, selectedIndex, onSelect }: ForkDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[200px] overflow-y-auto z-50"
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-pi-border flex items-center gap-2 text-pi-muted text-[11px] sticky top-0 bg-pi-bg">
        <GitBranch className="w-3 h-3" />
        <span>Fork from message</span>
        <span className="ml-auto">↑↓ navigate • Enter select • Esc cancel</span>
      </div>

      {messages.length === 0 ? (
        <div className="px-3 py-2 text-pi-muted text-[13px]">
          No messages to fork from
        </div>
      ) : (
        messages.map((msg, index) => (
          <div
            key={msg.entryId}
            ref={index === selectedIndex ? selectedRef : null}
            onClick={() => onSelect(msg.entryId)}
            className={`px-3 py-1.5 cursor-pointer text-[13px] transition-colors ${
              index === selectedIndex
                ? 'bg-pi-surface text-pi-text'
                : 'text-pi-muted hover:bg-pi-surface/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-pi-muted w-5 flex-shrink-0 text-right">{index + 1}.</span>
              <span className="truncate">{msg.text}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
