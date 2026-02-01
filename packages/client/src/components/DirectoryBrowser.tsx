import { useCallback } from 'react';
import { X, Folder, FolderOpen, ChevronLeft } from 'lucide-react';
import type { DirectoryEntry } from '@pi-web-ui/shared';

interface DirectoryBrowserProps {
  currentPath: string;
  entries: DirectoryEntry[];
  allowedRoots: string[];
  onNavigate: (path?: string) => void;
  onOpenWorkspace: (path: string) => void;
  onClose: () => void;
}

export function DirectoryBrowser({
  currentPath,
  entries,
  allowedRoots,
  onNavigate,
  onOpenWorkspace,
  onClose,
}: DirectoryBrowserProps) {
  const getParentPath = useCallback(() => {
    if (currentPath === '/') return undefined;
    
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    
    // Allow going back if parent is within any allowed root, or IS an allowed root
    const isParentAllowed = allowedRoots.some(
      (root) => 
        parentPath === root || 
        parentPath.startsWith(root + '/') ||
        root.startsWith(parentPath + '/') // parent contains an allowed root
    );
    
    // Also allow going to '/' to show all allowed roots
    if (parentPath === '/' || isParentAllowed) {
      return parentPath;
    }
    
    return undefined;
  }, [currentPath, allowedRoots]);

  const parentPath = getParentPath();
  const displayPath = currentPath === '/' ? 'Allowed Directories' : currentPath;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-pi-bg border border-pi-border max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col font-mono text-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pi-border px-4 py-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-pi-accent" />
            <span className="text-pi-fg">Open Directory</span>
          </div>
          <button
            onClick={onClose}
            className="text-pi-muted hover:text-pi-fg transition-colors p-1"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path breadcrumb */}
        <div className="border-b border-pi-border px-4 py-2 text-pi-muted">
          <span className="text-xs">{displayPath}</span>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto">
          {/* Back button */}
          {parentPath && (
            <button
              onClick={() => onNavigate(parentPath)}
              className="w-full px-4 py-2 text-left hover:bg-pi-surface flex items-center gap-2 border-b border-pi-border/50"
            >
              <ChevronLeft className="w-4 h-4 text-pi-muted" />
              <span className="text-pi-fg">..</span>
            </button>
          )}

          {/* Root navigation when at / */}
          {currentPath === '/' && (
            <div className="px-4 py-2 text-xs text-pi-muted border-b border-pi-border/50">
              Select an allowed directory:
            </div>
          )}

          {/* Directory entries */}
          {entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-pi-muted">
              <span>Empty directory</span>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center border-b border-pi-border/30 hover:bg-pi-surface group"
              >
                <button
                  onClick={() => onNavigate(entry.path)}
                  className="flex-1 px-4 py-2 text-left flex items-center gap-2"
                >
                  <Folder className="w-4 h-4 text-pi-muted" />
                  <span className="text-pi-fg">{entry.name}</span>
                  {entry.hasPiSessions && (
                    <span className="text-pi-accent text-xs">●</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    onOpenWorkspace(entry.path);
                    onClose();
                  }}
                  className="px-3 py-2 text-pi-muted hover:text-pi-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Open this directory"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer with open current directory option */}
        {currentPath !== '/' && (
          <div className="border-t border-pi-border px-4 py-2 flex justify-between items-center">
            <span className="text-pi-muted text-xs">
              {entries.filter((e) => e.hasPiSessions).length > 0 && (
                <span>● = has Pi sessions</span>
              )}
            </span>
            <button
              onClick={() => {
                onOpenWorkspace(currentPath);
                onClose();
              }}
              className="flex items-center gap-2 px-3 py-1 border border-pi-accent text-pi-accent hover:bg-pi-accent hover:text-pi-bg transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Open here</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
