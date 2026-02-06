import { FolderOpen, Settings, X } from 'lucide-react';

interface WorkspaceRailItem {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  isStreaming: boolean;
  needsAttention: boolean;
}

interface WorkspaceRailProps {
  workspaces: WorkspaceRailItem[];
  onSelectWorkspace: (id: string) => void;
  onCloseWorkspace: (id: string) => void;
  onOpenBrowser: () => void;
  onOpenSettings: () => void;
  className?: string;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'WS';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function WorkspaceRail({
  workspaces,
  onSelectWorkspace,
  onCloseWorkspace,
  onOpenBrowser,
  onOpenSettings,
  className = '',
}: WorkspaceRailProps) {
  return (
    <aside className={`flex h-full w-14 flex-shrink-0 flex-col items-center border-r border-pi-border bg-pi-surface py-2 ${className}`}>
      <button
        onClick={onOpenBrowser}
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-md text-pi-muted transition-colors hover:bg-pi-bg hover:text-pi-text"
        title="Open workspace (⌘O)"
      >
        <FolderOpen className="h-4 w-4" />
      </button>

      <div className="flex-1 w-full overflow-y-auto px-1">
        <div className="flex flex-col items-center gap-1.5">
          {workspaces.map((workspace) => {
            const statusClass = workspace.isStreaming
              ? 'bg-pi-success status-running'
              : workspace.needsAttention
                ? 'bg-pi-success'
                : '';

            return (
              <div key={workspace.id} className="group relative">
                <button
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-md border text-[11px] font-semibold tracking-wide transition-colors ${
                    workspace.isActive
                      ? 'border-pi-accent bg-pi-bg text-pi-text'
                      : 'border-transparent text-pi-muted hover:bg-pi-bg hover:text-pi-text'
                  }`}
                  title={workspace.path}
                >
                  {statusClass ? (
                    <span className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${statusClass}`} />
                  ) : null}
                  {initialsFor(workspace.name)}
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseWorkspace(workspace.id);
                  }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-pi-border bg-pi-surface text-pi-muted transition-colors hover:text-pi-error opacity-0 group-hover:opacity-100"
                  title={`Close ${workspace.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onOpenSettings}
        className="mt-2 flex h-10 w-10 items-center justify-center rounded-md text-pi-muted transition-colors hover:bg-pi-bg hover:text-pi-text"
        title="Settings (⌘,)"
      >
        <Settings className="h-4 w-4" />
      </button>
    </aside>
  );
}
