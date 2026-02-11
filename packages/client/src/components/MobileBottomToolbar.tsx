import { MessageSquare, PanelRight, Briefcase } from 'lucide-react';

type MobilePanel = 'conversations' | 'chat' | 'tools';

interface MobileBottomToolbarProps {
  activePanel: MobilePanel;
  onSelectPanel: (panel: MobilePanel) => void;
}

export function MobileBottomToolbar({
  activePanel,
  onSelectPanel,
}: MobileBottomToolbarProps) {
  return (
    <div className="flex items-center justify-around h-14 border-t border-pi-border bg-pi-surface safe-area-bottom">
      <button
        onClick={() => onSelectPanel('conversations')}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
          activePanel === 'conversations' ? 'text-pi-accent' : 'text-pi-muted hover:text-pi-text'
        }`}
        title="Conversations"
      >
        <MessageSquare className="w-6 h-6" />
        <span className="text-[10px] mt-0.5">Chats</span>
      </button>
      
      <button
        onClick={() => onSelectPanel('chat')}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
          activePanel === 'chat' ? 'text-pi-accent' : 'text-pi-muted hover:text-pi-text'
        }`}
        title="Chat"
      >
        <Briefcase className="w-6 h-6" />
        <span className="text-[10px] mt-0.5">Chat</span>
      </button>
      
      <button
        onClick={() => onSelectPanel('tools')}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
          activePanel === 'tools' ? 'text-pi-accent' : 'text-pi-muted hover:text-pi-text'
        }`}
        title="Tools"
      >
        <PanelRight className="w-6 h-6" />
        <span className="text-[10px] mt-0.5">Tools</span>
      </button>
    </div>
  );
}
