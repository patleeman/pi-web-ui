import { RefreshCw, Plus } from 'lucide-react';
import type { SessionInfo } from '@pi-web-ui/shared';

interface SidebarProps {
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRefresh: () => void;
  width?: number;
}

export function Sidebar({
  sessions,
  currentSessionId,
  onSwitchSession,
  onNewSession,
  onRefresh,
  width = 224,
}: SidebarProps) {
  // Sort sessions by most recent
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className="flex-shrink-0 border-r border-pi-border bg-pi-surface flex flex-col font-mono text-sm"
      style={{ width }}
    >
      {/* Header */}
      <div className="px-2 py-1 border-b border-pi-border flex items-center justify-between">
        <span className="text-pi-muted text-xs">sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-0.5 hover:text-pi-text text-pi-muted"
            title="Refresh sessions"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={onNewSession}
            className="p-0.5 text-pi-accent hover:text-pi-accent-hover"
            title="New session"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="px-2 py-2 text-pi-muted">
            (empty)
          </div>
        ) : (
          <div className="py-0.5">
            {sortedSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSwitchSession(session.path)}
                className={`w-full text-left px-2 py-0.5 transition-colors flex items-center gap-1 ${
                  session.id === currentSessionId
                    ? 'bg-pi-accent/20 text-pi-accent'
                    : 'hover:bg-pi-bg'
                }`}
              >
                <span className="text-pi-muted">{session.id === currentSessionId ? '▸' : ' '}</span>
                <span className="flex-1 truncate">
                  {session.name || session.firstMessage || '(empty)'}
                </span>
                <span className="text-pi-muted text-xs">{session.messageCount}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
