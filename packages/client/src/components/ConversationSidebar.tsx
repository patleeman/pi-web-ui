import { useState, type CSSProperties, type MouseEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';

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
  onRenameConversation: (sessionId: string, sessionPath: string | undefined, label: string) => void;
  onDeleteConversation: (sessionId: string, sessionPath: string | undefined, label: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function ConversationSidebar({
  workspaceName,
  conversations,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  className = '',
  style,
}: ConversationSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>, sessionId: string) => {
    event.stopPropagation();
    setOpenMenuId((prev) => (prev === sessionId ? null : sessionId));
  };

  const handleRename = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onRenameConversation(conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, conversation: ConversationSummary) => {
    event.stopPropagation();
    setOpenMenuId(null);
    onDeleteConversation(conversation.sessionId, conversation.sessionPath, conversation.label);
  };

  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-pi-border bg-pi-surface ${className}`}
      style={style}
      onClick={() => setOpenMenuId(null)}
    >
      <div className="h-10 border-b border-pi-border px-3 flex items-center">
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
                <div key={conversation.sessionId} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      setOpenMenuId(null);
                      onSelectConversation(conversation.sessionId, conversation.sessionPath, conversation.slotId);
                    }}
                    className={`flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors ${
                      conversation.isFocused
                        ? 'bg-pi-bg text-pi-text'
                        : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                    }`}
                    title={conversation.label}
                  >
                    {conversation.isStreaming && (
                      <span className="w-2 h-2 rounded-full bg-pi-success status-running flex-shrink-0" />
                    )}
                    <span className="truncate">{conversation.label}</span>
                  </button>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(event) => handleMenuToggle(event, conversation.sessionId)}
                      className="rounded p-1 text-pi-muted opacity-70 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-pi-text"
                      title="Conversation actions"
                      aria-label="Conversation actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {openMenuId === conversation.sessionId && (
                      <div
                        className="absolute right-0 z-10 mt-1 w-32 rounded border border-pi-border bg-pi-surface shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-text hover:bg-pi-bg"
                          onClick={(event) => handleRename(event, conversation)}
                        >
                          Rename
                        </button>
                        <button
                          className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-pi-error hover:bg-pi-bg"
                          onClick={(event) => handleDelete(event, conversation)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
