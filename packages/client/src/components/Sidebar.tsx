import { RefreshCw, Plus, X } from 'lucide-react';
import type { SessionInfo } from '@pi-web-ui/shared';

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

interface SidebarProps {
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRefresh: () => void;
  width?: number;
  isMobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  onSwitchSession,
  onNewSession,
  onRefresh,
  width = 224,
  isMobile = false,
  onClose,
}: SidebarProps) {
  // Sort sessions by most recent
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className="flex-shrink-0 border-r border-pi-border bg-pi-surface flex flex-col font-mono text-sm h-full"
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
          {/* Close button for mobile */}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="p-0.5 hover:text-pi-text text-pi-muted ml-2"
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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
                <span className="text-pi-muted text-xs">{formatTimeSince(session.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
