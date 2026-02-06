import type { CSSProperties } from 'react';

interface ConversationSummary {
  sessionId: string;
  sessionPath?: string;
  label: string;
  paneLabel?: string;
  slotId?: string;
  isFocused: boolean;
  isStreaming?: boolean;
}

interface ConversationSidebarProps {
  workspaceName?: string;
  conversations: ConversationSummary[];
  onSelectConversation: (sessionId: string, sessionPath?: string, slotId?: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function ConversationSidebar({
  workspaceName,
  conversations,
  onSelectConversation,
  className = '',
  style,
}: ConversationSidebarProps) {
  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-pi-border bg-pi-surface ${className}`}
      style={style}
    >
      <div className="border-b border-pi-border px-3 py-2">
        <div className="truncate text-[12px] uppercase tracking-wide text-pi-muted">{workspaceName || 'Workspace'}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="px-2 py-2">
          <h3 className="px-1 text-[11px] uppercase tracking-wide text-pi-muted">Conversations</h3>
          <div className="mt-1 space-y-0.5">
            {conversations.length === 0 ? (
              <div className="px-1 py-1 text-[12px] text-pi-muted">No conversations yet</div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.sessionId}
                  onClick={() => onSelectConversation(conversation.sessionId, conversation.sessionPath, conversation.slotId)}
                  className={`w-full rounded px-2 py-1 text-left text-[12px] transition-colors ${
                    conversation.isFocused
                      ? 'bg-pi-bg text-pi-text'
                      : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                  }`}
                  title={conversation.label}
                >
                  <div className="flex items-center gap-2">
                    {conversation.isStreaming && (
                      <span className="w-2 h-2 rounded-full bg-pi-success status-running flex-shrink-0" />
                    )}
                    <span className="truncate">{conversation.label}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="border-t border-pi-border px-2 py-2">
          <h3 className="px-1 text-[11px] uppercase tracking-wide text-pi-muted">Tasks</h3>
          <div className="px-1 py-1 text-[12px] text-pi-muted">Task queue coming soon</div>
        </section>
      </div>
    </aside>
  );
}
