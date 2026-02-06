import { Plus } from 'lucide-react';

interface MobilePaneTabsProps {
  paneCount: number;
  activeIndex: number;
  maxPanes?: number;
  onSelectPane: (index: number) => void;
  onAddPane: () => void;
  onClosePane: (index: number) => void;
  /** Whether any pane is streaming (shows indicator) */
  streamingPanes?: boolean[];
}

export function MobilePaneTabs({
  paneCount,
  activeIndex,
  maxPanes = 4,
  onSelectPane,
  onAddPane,
  onClosePane,
  streamingPanes = [],
}: MobilePaneTabsProps) {
  const canAdd = paneCount < maxPanes;
  const canClose = paneCount > 0;

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-pi-border bg-pi-surface">
      {/* Pane tabs */}
      {Array.from({ length: paneCount }, (_, i) => {
        const isActive = i === activeIndex;
        const isStreaming = streamingPanes[i];
        
        return (
          <button
            key={i}
            onClick={() => onSelectPane(i)}
            onDoubleClick={() => canClose && onClosePane(i)}
            className={`
              relative flex items-center justify-center
              min-w-[44px] min-h-[44px] px-3
              rounded-lg font-mono text-[14px] font-medium
              transition-colors
              ${isActive 
                ? 'bg-pi-accent text-pi-bg' 
                : 'bg-pi-bg text-pi-muted hover:text-pi-text'
              }
            `}
            title={canClose ? 'Double-tap to close' : undefined}
          >
            {/* Streaming indicator */}
            {isStreaming && (
              <span className={`
                absolute top-1 right-1 w-2 h-2 rounded-full
                ${isActive ? 'bg-pi-bg' : 'bg-pi-success'}
                animate-pulse
              `} />
            )}
            {i + 1}
          </button>
        );
      })}
      
      {/* Add pane button */}
      {canAdd && (
        <button
          onClick={onAddPane}
          className="
            flex items-center justify-center
            min-w-[44px] min-h-[44px]
            rounded-lg text-pi-muted hover:text-pi-accent
            transition-colors
          "
          title="Add pane"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
