import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Folder, ChevronLeft, Home, Check } from 'lucide-react';

interface DirectoryEntry {
  name: string;
  path: string;
}

interface FolderPickerDialogProps {
  currentPath: string;
  entries: DirectoryEntry[];
  homeDirectory: string;
  workspacePath: string;
  onNavigate: (path?: string) => void;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function FolderPickerDialog({
  currentPath,
  entries,
  homeDirectory,
  workspacePath,
  onNavigate,
  onSelect,
  onClose,
}: FolderPickerDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const getParentPath = useCallback(() => {
    if (currentPath === '/') return undefined;
    
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
  }, [currentPath]);

  const parentPath = getParentPath();

  // Reset selection when path changes
  useEffect(() => {
    setSelectedPath(null);
  }, [currentPath]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPath]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (entries.length > 0) {
            const currentIndex = selectedPath ? entries.findIndex(ent => ent.path === selectedPath) : -1;
            const nextIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : 0;
            setSelectedPath(entries[nextIndex]?.path || null);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (entries.length > 0) {
            const currentIndex = selectedPath ? entries.findIndex(ent => ent.path === selectedPath) : -1;
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : entries.length - 1;
            setSelectedPath(entries[prevIndex]?.path || null);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedPath) {
            onSelect(selectedPath);
          } else if (entries.length > 0) {
            // If nothing selected but entries exist, select first
            onSelect(entries[0].path);
          }
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          if (selectedPath) {
            onNavigate(selectedPath);
          }
          break;
        case 'ArrowLeft':
        case 'h':
        case 'Backspace':
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
  }, [entries, selectedPath, parentPath, onNavigate, onSelect, onClose]);

  const handleSelectCurrent = () => {
    onSelect(currentPath);
  };

  // Get display name for path
  const getDisplayPath = (path: string) => {
    if (path === workspacePath) return 'Workspace Root';
    if (path === homeDirectory) return 'Home';
    return path.replace(homeDirectory, '~').replace(workspacePath, '.');
  };

  return (
    <div
      role="dialog"
      aria-label="Select Folder"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-4"
    >
      <div className="bg-pi-bg border border-pi-border max-w-2xl w-full max-h-[90vh] md:max-h-[80vh] flex flex-col font-mono text-[14px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pi-border px-3 md:px-4 py-2">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-pi-accent" />
            <span className="text-pi-fg">Select Folder for Jobs</span>
          </div>
          <button
            onClick={onClose}
            className="text-pi-muted hover:text-pi-fg active:text-pi-fg transition-colors p-3 sm:p-1.5 -m-2 sm:-m-1"
            title="Close (Esc)"
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5 md:w-4 md:h-4" />
          </button>
        </div>

        {/* Path breadcrumb */}
        <div className="border-b border-pi-border px-3 md:px-4 py-2 text-pi-muted overflow-x-auto">
          <span className="text-[12px] whitespace-nowrap">{getDisplayPath(currentPath)}</span>
        </div>

        {/* Quick navigation */}
        <div className="border-b border-pi-border px-3 md:px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => onNavigate(workspacePath)}
            className={`text-[12px] px-2 py-1 rounded transition-colors ${
              currentPath === workspacePath 
                ? 'bg-pi-accent text-white' 
                : 'text-pi-muted hover:text-pi-text hover:bg-pi-surface'
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => onNavigate(homeDirectory)}
            className={`text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              currentPath === homeDirectory 
                ? 'bg-pi-accent text-white' 
                : 'text-pi-muted hover:text-pi-text hover:bg-pi-surface'
            }`}
          >
            <Home className="w-3 h-3" />
            Home
          </button>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto">
          {/* Back button */}
          {parentPath && (
            <button
              onClick={() => onNavigate(parentPath)}
              className="w-full px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 border-b border-pi-border/50 hover:bg-pi-surface active:bg-pi-surface"
            >
              <ChevronLeft className="w-4 h-4 text-pi-muted" />
              <span className="text-pi-fg">..</span>
            </button>
          )}

          {/* Directory entries */}
          {entries.length === 0 ? (
            <div className="px-3 md:px-4 py-8 text-center text-pi-muted">
              <span>No subdirectories</span>
            </div>
          ) : (
            entries.map((entry) => {
              const isSelected = selectedPath === entry.path;
              return (
                <div
                  key={entry.path}
                  className={`flex items-center border-b border-pi-border/30 ${
                    isSelected ? 'bg-pi-surface' : 'hover:bg-pi-surface/50'
                  }`}
                >
                  <button
                    ref={isSelected ? selectedRef : null}
                    onClick={() => setSelectedPath(entry.path)}
                    onDoubleClick={() => onNavigate(entry.path)}
                    className="flex-1 px-3 md:px-4 py-3 md:py-2 text-left flex items-center gap-2 min-w-0"
                  >
                    <Folder className="w-4 h-4 text-pi-muted flex-shrink-0" />
                    <span className="text-pi-fg truncate">{entry.name}</span>
                    {isSelected && (
                      <Check className="w-3 h-3 text-pi-accent flex-shrink-0 ml-auto" />
                    )}
                  </button>
                  <button
                    onClick={() => onNavigate(entry.path)}
                    className="px-3 py-3 md:py-2 text-pi-muted hover:text-pi-accent active:text-pi-accent transition-colors"
                    title="Open folder"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-pi-border px-3 md:px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-pi-muted truncate flex-1">
            {selectedPath ? getDisplayPath(selectedPath) : getDisplayPath(currentPath)}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-pi-muted hover:text-pi-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectCurrent}
              className="px-3 py-1.5 text-[12px] bg-pi-accent text-white hover:bg-pi-accent/80 transition-colors rounded"
            >
              Select Current
            </button>
            {selectedPath && (
              <button
                onClick={() => onSelect(selectedPath)}
                className="px-3 py-1.5 text-[12px] bg-pi-accent text-white hover:bg-pi-accent/80 transition-colors rounded"
              >
                Select Folder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
