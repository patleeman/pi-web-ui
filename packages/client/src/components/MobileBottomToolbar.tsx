import { Menu, FileText } from 'lucide-react';

interface MobileBottomToolbarProps {
  onOpenSidebar: () => void;
  onToggleFilePane: () => void;
  isFilePaneOpen: boolean;
}

export function MobileBottomToolbar({
  onOpenSidebar,
  onToggleFilePane,
  isFilePaneOpen,
}: MobileBottomToolbarProps) {
  return (
    <div className="flex items-center justify-around h-14 border-t border-pi-border bg-pi-surface safe-area-bottom">
      <button
        onClick={onOpenSidebar}
        className="flex flex-col items-center justify-center flex-1 h-full text-pi-muted hover:text-pi-text transition-colors"
        title="Menu"
      >
        <Menu className="w-6 h-6" />
        <span className="text-[10px] mt-0.5">Menu</span>
      </button>
      
      <button
        onClick={onToggleFilePane}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
          isFilePaneOpen ? 'text-pi-accent' : 'text-pi-muted hover:text-pi-text'
        }`}
        title="Files"
      >
        <FileText className="w-6 h-6" />
        <span className="text-[10px] mt-0.5">Files</span>
      </button>
    </div>
  );
}
