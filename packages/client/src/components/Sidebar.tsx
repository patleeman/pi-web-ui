import { Plus, RefreshCw, MessageSquare } from 'lucide-react';
import type { SessionInfo } from '@pi-web-ui/shared';

interface SidebarProps {
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRefresh: () => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  onSwitchSession,
  onNewSession,
  onRefresh,
}: SidebarProps) {
  // Sort sessions by most recent
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="w-64 flex-shrink-0 border-r border-pi-border bg-pi-surface flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-pi-border flex items-center justify-between">
        <span className="text-sm font-medium text-pi-text">Sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1.5 rounded hover:bg-pi-bg transition-colors text-pi-muted hover:text-pi-text"
            title="Refresh sessions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onNewSession}
            className="p-1.5 rounded bg-pi-accent/20 hover:bg-pi-accent/30 transition-colors text-pi-accent"
            title="New session"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="p-4 text-center text-pi-muted text-sm">
            No sessions yet
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sortedSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSwitchSession(session.path)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${
                  session.id === currentSessionId
                    ? 'bg-pi-accent/20 border border-pi-accent/50'
                    : 'hover:bg-pi-bg border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-pi-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-pi-text truncate">
                      {session.name || session.firstMessage || 'Empty session'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-pi-muted">
                      <span>{session.messageCount} msgs</span>
                      <span>•</span>
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
