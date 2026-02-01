import { useCallback, useState, useEffect, useRef } from 'react';
import { X, Folder, FolderOpen, ChevronLeft, Clock, Home } from 'lucide-react';
import type { DirectoryEntry } from '@pi-web-ui/shared';

interface DirectoryBrowserProps {
  currentPath: string;
  entries: DirectoryEntry[];
  allowedRoots: string[];
  recentWorkspaces: string[];
  homeDirectory: string;
  onNavigate: (path?: string) => void;
  onOpenWorkspace: (path: string) => void;
  onClose: () => void;
}

// Item type for unified keyboard navigation
type NavItem = 
  | { type: 'back'; path: string }
  | { type: 'recent'; path: string }
  | { type: 'home'; path: string }
  | { type: 'entry'; entry: DirectoryEntry };

export function DirectoryBrowser({
  currentPath,
  entries,
  allowedRoots,
  recentWorkspaces,
  homeDirectory,
  onNavigate,
  onOpenWorkspace,
  onClose,
}: DirectoryBrowserProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef<HTMLButtonElement>(null);

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

  // Get folder name from path
  const getFolderName = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  // Build navigation items list for keyboard navigation
  const navItems: NavItem[] = [];
  
  // Back button
  if (parentPath) {
    navItems.push({ type: 'back', path: parentPath });
  }
  
  // Root view items
  if (currentPath === '/') {
    // Recent workspaces
    recentWorkspaces.slice(0, 5).forEach(path => {
      navItems.push({ type: 'recent', path });
    });
    // Home directory
    if (homeDirectory) {
      navItems.push({ type: 'home', path: homeDirectory });
    }
  }
  
  // Directory entries
  entries.forEach(entry => {
    navItems.push({ type: 'entry', entry });
  });

  // Reset selection when path changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [currentPath]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, navItems.length - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (navItems.length > 0) {
            const item = navItems[selectedIndex];
            if (item.type === 'back') {
              onNavigate(item.path);
            } else if (item.type === 'recent') {
              onOpenWorkspace(item.path);
              onClose();
            } else if (item.type === 'home') {
              onNavigate(item.path);
            } else if (item.type === 'entry') {
              onNavigate(item.entry.path);
            }
          }
          break;
        case 'ArrowRight':
        case 'l':
          // Open workspace at selected entry
          e.preventDefault();
          if (navItems.length > 0) {
            const item = navItems[selectedIndex];
            if (item.type === 'entry') {
              onOpenWorkspace(item.entry.path);
              onClose();
            } else if (item.type === 'home') {
              onOpenWorkspace(item.path);
              onClose();
            }
          }
          break;
        case 'ArrowLeft':
        case 'h':
        case 'Backspace':
          // Go back
          if (parentPath) {
            e.preventDefault();
            onNavigate(parentPath);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navItems, selectedIndex, parentPath, onNavigate, onOpenWorkspace, onClose]);

  // Track current nav item index for highlighting
  let navIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-4">
      <div className="bg-pi-bg border border-pi-border max-w-2xl w-full max-h-[90vh] md:max-h-[80vh] flex flex-col font-mono text-[14px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pi-border px-3 md:px-4 py-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-pi-accent" />
            <span className="text-pi-fg">Open Directory</span>
          </div>
          <button
            onClick={onClose}
            className="text-pi-muted hover:text-pi-fg active:text-pi-fg transition-colors p-1.5 -m-1"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>

        {/* Path breadcrumb */}
        <div className="border-b border-pi-border px-3 md:px-4 py-2 text-pi-muted overflow-x-auto">
          <span className="text-[12px] whitespace-nowrap">{displayPath}</span>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto">
          {/* Back button */}
          {parentPath && (() => {
            navIndex++;
            const isSelected = navIndex === selectedIndex;
            return (
              <button
                ref={isSelected ? selectedRef : null}
                onClick={() => onNavigate(parentPath)}
                className={`w-full px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 border-b border-pi-border/50 ${
                  isSelected ? 'bg-pi-surface' : 'hover:bg-pi-surface active:bg-pi-surface'
                }`}
              >
                <ChevronLeft className="w-4 h-4 text-pi-muted" />
                <span className="text-pi-fg">..</span>
              </button>
            );
          })()}

          {/* Root view - show recent workspaces and home */}
          {currentPath === '/' && (
            <>
              {/* Recent workspaces */}
              {recentWorkspaces.length > 0 && (
                <>
                  <div className="px-3 md:px-4 py-2 text-[12px] text-pi-muted border-b border-pi-border/50 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Recent
                  </div>
                  {recentWorkspaces.slice(0, 5).map((path) => {
                    navIndex++;
                    const isSelected = navIndex === selectedIndex;
                    return (
                      <button
                        key={path}
                        ref={isSelected ? selectedRef : null}
                        onClick={() => {
                          onOpenWorkspace(path);
                          onClose();
                        }}
                        className={`w-full px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 min-w-0 border-b border-pi-border/30 ${
                          isSelected ? 'bg-pi-surface' : 'hover:bg-pi-surface active:bg-pi-surface'
                        }`}
                      >
                        <Folder className="w-4 h-4 text-pi-accent flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-pi-fg truncate">{getFolderName(path)}</span>
                          <span className="text-pi-muted text-[12px] truncate">{path}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Home directory */}
              {homeDirectory && (() => {
                navIndex++;
                const isSelected = navIndex === selectedIndex;
                return (
                  <>
                    <div className="px-3 md:px-4 py-2 text-[12px] text-pi-muted border-b border-pi-border/50 flex items-center gap-1.5">
                      <Home className="w-3 h-3" />
                      Browse
                    </div>
                    <button
                      ref={isSelected ? selectedRef : null}
                      onClick={() => onNavigate(homeDirectory)}
                      className={`w-full px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 min-w-0 border-b border-pi-border/30 ${
                        isSelected ? 'bg-pi-surface' : 'hover:bg-pi-surface active:bg-pi-surface'
                      }`}
                    >
                      <Folder className="w-4 h-4 text-pi-muted flex-shrink-0" />
                      <span className="text-pi-fg truncate">Home ({homeDirectory})</span>
                    </button>
                  </>
                );
              })()}

              {/* Allowed roots */}
              <div className="px-3 md:px-4 py-2 text-[12px] text-pi-muted border-b border-pi-border/50">
                Allowed directories
              </div>
            </>
          )}

          {/* Directory entries */}
          {entries.length === 0 && currentPath !== '/' ? (
            <div className="px-3 md:px-4 py-8 text-center text-pi-muted">
              <span>Empty directory</span>
            </div>
          ) : (
            entries.map((entry) => {
              navIndex++;
              const isSelected = navIndex === selectedIndex;
              return (
                <div
                  key={entry.path}
                  className={`flex items-center border-b border-pi-border/30 group ${
                    isSelected ? 'bg-pi-surface' : 'hover:bg-pi-surface active:bg-pi-surface'
                  }`}
                >
                  <button
                    ref={isSelected ? selectedRef : null}
                    onClick={() => onNavigate(entry.path)}
                    className="flex-1 px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 min-w-0"
                  >
                    <Folder className="w-4 h-4 text-pi-muted flex-shrink-0" />
                    <span className="text-pi-fg truncate">{entry.name}</span>
                    {entry.hasPiSessions && (
                      <span className="text-pi-accent text-[12px] flex-shrink-0">●</span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onOpenWorkspace(entry.path);
                      onClose();
                    }}
                    className="px-3 py-3 md:py-2 text-pi-muted hover:text-pi-accent active:text-pi-accent md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    title="Open this directory (→)"
                  >
                    <FolderOpen className="w-5 h-5 md:w-4 md:h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with open current directory option */}
        {currentPath !== '/' && (
          <div className="border-t border-pi-border px-3 md:px-4 py-2 flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
            <span className="text-pi-muted text-[12px]">
              {entries.filter((e) => e.hasPiSessions).length > 0 && (
                <span>● = has Pi sessions</span>
              )}
            </span>
            <button
              onClick={() => {
                onOpenWorkspace(currentPath);
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-3 py-2 md:py-1 border border-pi-accent text-pi-accent hover:bg-pi-accent hover:text-pi-bg active:bg-pi-accent active:text-pi-bg transition-colors"
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
