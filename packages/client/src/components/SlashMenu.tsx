import { useEffect, useRef } from 'react';

export interface SlashCommand {
  cmd: string;
  desc: string;
  action: string;
}

interface SlashMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export function SlashMenu({ commands, selectedIndex, onSelect }: SlashMenuProps) {
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
      className="absolute bottom-full left-0 right-0 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[200px] overflow-y-auto"
    >
      {commands.map((cmd, i) => {
        // Truncate description to ~50 chars
        const shortDesc = cmd.desc.length > 50 
          ? cmd.desc.slice(0, 47) + '...' 
          : cmd.desc;
        
        return (
          <div
            key={cmd.cmd}
            ref={i === selectedIndex ? selectedRef : null}
            onClick={() => onSelect(cmd)}
            className={`px-3 py-1.5 flex items-center gap-3 cursor-pointer text-[13px] ${
              i === selectedIndex ? 'bg-pi-surface' : 'hover:bg-pi-surface/50'
            }`}
          >
            <span className="text-pi-accent font-medium min-w-[120px] max-w-[140px] truncate">{cmd.cmd}</span>
            <span className="text-pi-muted truncate flex-1">{shortDesc}</span>
          </div>
        );
      })}
    </div>
  );
}
