import { useMemo, useState, useEffect, useCallback } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, Folder, FileText, GitBranch, FolderOpen } from 'lucide-react';
import type { FileInfo, GitFileStatus, GitStatusFile } from '@pi-deck/shared';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: 'text-amber-400',
  added: 'text-green-400',
  deleted: 'text-red-400',
  renamed: 'text-sky-400',
  untracked: 'text-green-400',
  conflicted: 'text-orange-400',
};

const GIT_STATUS_BADGE_COLORS: Record<GitFileStatus, string> = {
  modified: 'bg-amber-500/20 text-amber-400',
  added: 'bg-green-500/20 text-green-400',
  deleted: 'bg-red-500/20 text-red-400',
  renamed: 'bg-sky-500/20 text-sky-400',
  untracked: 'bg-green-500/20 text-green-400',
  conflicted: 'bg-orange-500/20 text-orange-400',
};

const GIT_STATUS_LABELS: Record<GitFileStatus, string> = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked',
  conflicted: 'Conflicted',
};

const AUTO_REFRESH_INTERVAL_MS = 3000;
const AUTO_REFRESH_IDLE_TIMEOUT_MS = 15000;

interface TreeRow {
  entry: FileInfo;
  depth: number;
  isPlaceholder?: boolean;
}

interface GitTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  gitStatus?: GitFileStatus;
  children: Map<string, GitTreeNode>;
}

function getParentPath(path: string): string {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function buildGitTree(files: GitStatusFile[]): GitTreeNode {
  const root: GitTreeNode = { name: '', path: '', isDirectory: true, children: new Map() };
  for (const file of files) {
    // Check if path ends with slash (indicates a directory in git status)
    const isDirectory = file.path.endsWith('/');
    // Strip trailing slashes for processing
    const cleanPath = file.path.replace(/\/$/, '');
    const parts = cleanPath.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');
      if (!current.children.has(part)) {
        // For the last part, use isDirectory flag (detected from trailing slash)
        const nodeIsDirectory = isLast ? isDirectory : true;
        current.children.set(part, {
          name: part, path: currentPath, isDirectory: nodeIsDirectory,
          gitStatus: isLast ? file.status : undefined, children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }
  return root;
}

function flattenGitTree(node: GitTreeNode, depth: number, expandedPaths: Set<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const sorted = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of sorted) {
    rows.push({
      entry: { name: child.name, path: child.path, isDirectory: child.isDirectory, gitStatus: child.gitStatus, hasChanges: child.isDirectory && child.children.size > 0 },
      depth,
    });
    if (child.isDirectory && expandedPaths.has(child.path)) {
      rows.push(...flattenGitTree(child, depth + 1, expandedPaths));
    }
  }
  return rows;
}

/** Collect all directory paths in a git tree */
function collectGitDirPaths(node: GitTreeNode, paths: Set<string>): void {
  for (const child of node.children.values()) {
    if (child.isDirectory) {
      paths.add(child.path);
      collectGitDirPaths(child, paths);
    }
  }
}

interface SidebarFileTreeProps {
  section: 'files' | 'git';
  workspaceName: string;
  workspacePath: string;
  entriesByPath: Record<string, FileInfo[]>;
  gitStatusFiles: GitStatusFile[];
  onRequestEntries: (path: string) => void;
  onRequestGitStatus: () => void;
  onSelectFile: (path: string) => void;
  onSelectGitFile: (path: string) => void;
  selectedFilePath: string;
  openFilePath?: string;
  // New props for file watching (files section only)
  onWatchDirectory?: (path: string) => void;
  onUnwatchDirectory?: (path: string) => void;
}

export function SidebarFileTree({
  section,
  workspaceName,
  workspacePath,
  entriesByPath,
  gitStatusFiles,
  onRequestEntries,
  onRequestGitStatus,
  onSelectFile,
  onSelectGitFile,
  selectedFilePath,
  openFilePath,
  onWatchDirectory,
  onUnwatchDirectory,
}: SidebarFileTreeProps) {
  const [treeRootPath, setTreeRootPath] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [gitExpandedPaths, setGitExpandedPaths] = useState<Set<string>>(new Set());

  const gitStatusByPath = useMemo(() => {
    const map: Record<string, GitFileStatus> = {};
    for (const file of gitStatusFiles) {
      // Strip trailing slashes for consistent path matching
      const cleanPath = file.path.replace(/\/$/, '');
      map[cleanPath] = file.status;
    }
    return map;
  }, [gitStatusFiles]);

  const gitTree = useMemo(() => buildGitTree(gitStatusFiles), [gitStatusFiles]);

  // Auto-expand all git directories when the git tree changes
  useEffect(() => {
    const paths = new Set<string>();
    collectGitDirPaths(gitTree, paths);
    setGitExpandedPaths(prev => {
      // Merge: keep existing expanded state, add any new directories as expanded
      const next = new Set(prev);
      for (const p of paths) next.add(p);
      // Remove paths that no longer exist in the tree
      for (const p of prev) {
        if (!paths.has(p)) next.delete(p);
      }
      return next;
    });
  }, [gitTree]);

  const gitVisibleNodes = useMemo(() => flattenGitTree(gitTree, 0, gitExpandedPaths), [gitTree, gitExpandedPaths]);

  const visibleNodes = useMemo(() => {
    const nodes: TreeRow[] = [];
    const stack: TreeRow[] = [];
    const rootEntries = entriesByPath[treeRootPath] || [];
    const sorted = [...rootEntries].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (let i = sorted.length - 1; i >= 0; i--) stack.push({ entry: sorted[i], depth: 0 });
    while (stack.length > 0) {
      const current = stack.pop()!;
      nodes.push(current);
      if (current.entry.isDirectory && expandedPaths.has(current.entry.path)) {
        const children = entriesByPath[current.entry.path];
        if (children && children.length > 0) {
          const sortedChildren = [...children].sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          for (let i = sortedChildren.length - 1; i >= 0; i--) stack.push({ entry: sortedChildren[i], depth: current.depth + 1 });
        } else if (children?.length === 0) {
          nodes.push({ entry: { name: 'Empty folder', path: `__empty__/${current.entry.path}`, isDirectory: false }, depth: current.depth + 1, isPlaceholder: true });
        }
      }
    }
    return nodes;
  }, [entriesByPath, expandedPaths, treeRootPath]);

  const isRootEmpty = (entriesByPath[treeRootPath] || []).length === 0 && treeRootPath === '';

  useEffect(() => {
    onRequestEntries(treeRootPath);
    // Start watching the root directory for file changes
    if (section === 'files' && onWatchDirectory) {
      onWatchDirectory(treeRootPath);
    }
    return () => {
      // Unwatch when unmounting or changing root
      if (section === 'files' && onUnwatchDirectory) {
        onUnwatchDirectory(treeRootPath);
      }
    };
  }, [onRequestEntries, treeRootPath, onWatchDirectory, onUnwatchDirectory, section]);

  useAutoRefresh({
    enabled: section === 'git',
    refresh: onRequestGitStatus,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    idleTimeoutMs: AUTO_REFRESH_IDLE_TIMEOUT_MS,
  });

  // Navigate tree on openFilePath
  useEffect(() => {
    if (section !== 'files' || !openFilePath) return;
    let treePath = openFilePath;
    const wsPrefix = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/';
    if (openFilePath.startsWith(wsPrefix)) treePath = openFilePath.slice(wsPrefix.length);
    else if (openFilePath.startsWith('/') || openFilePath.startsWith('~/')) return;
    const normalizedPath = treePath.replace(/^\/+/, '').replace(/^\.\//, '');
    if (!normalizedPath) return;
    const rootIsAncestor = treeRootPath === '' || normalizedPath === treeRootPath || normalizedPath.startsWith(`${treeRootPath}/`);
    if (!rootIsAncestor) { setTreeRootPath(getParentPath(normalizedPath)); setExpandedPaths(new Set()); }
    const parts = normalizedPath.split('/');
    if (parts.length > 1) {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        for (let i = 1; i < parts.length; i++) {
          const ancestorPath = parts.slice(0, i).join('/');
          next.add(ancestorPath);
          if (!entriesByPath[ancestorPath]) {
            onRequestEntries(ancestorPath);
          }
          // Start watching this directory
          if (onWatchDirectory) {
            onWatchDirectory(ancestorPath);
          }
        }
        return next;
      });
    }
  }, [section, openFilePath, treeRootPath, workspacePath, entriesByPath, onRequestEntries, onWatchDirectory]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Collapsing - unwatch directory
        next.delete(path);
        if (section === 'files' && onUnwatchDirectory) {
          onUnwatchDirectory(path);
        }
      } else {
        // Expanding - request entries and start watching
        next.add(path);
        if (!entriesByPath[path]) {
          onRequestEntries(path);
        }
        if (section === 'files' && onWatchDirectory) {
          onWatchDirectory(path);
        }
      }
      return next;
    });
  }, [entriesByPath, onRequestEntries, onWatchDirectory, onUnwatchDirectory, section]);

  const toggleGitPath = useCallback((path: string) => {
    setGitExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleZoomIn = useCallback((path: string) => { setTreeRootPath(path); }, []);
  const handleZoomOut = useCallback(() => { setTreeRootPath(prev => getParentPath(prev)); }, []);
  const canZoomOut = treeRootPath !== '';
  const treeRootLabel = treeRootPath ? `/${workspaceName}/${treeRootPath}` : `/${workspaceName}`;

  const renderTreeItem = (entry: FileInfo, depth: number, isPlaceholder: boolean | undefined, isGitView: boolean) => {
    if (isPlaceholder) {
      return (
        <div key={entry.path} className="px-3 py-0.5 text-[11px] text-pi-muted/50 italic" style={{ paddingLeft: `${12 + depth * 14}px` }}>
          Empty folder
        </div>
      );
    }
    const isSelected = selectedFilePath === entry.path;
    const isExpanded = isGitView ? gitExpandedPaths.has(entry.path) : expandedPaths.has(entry.path);
    const gitStatus = entry.gitStatus || gitStatusByPath[entry.path];
    const hasChanges = entry.hasChanges || (entry.isDirectory && gitStatusFiles.some(f => f.path.startsWith(entry.path + '/')));

    return (
      <div key={entry.path}>
        <button
          className={`flex items-center gap-1 w-full text-left text-[11px] py-[3px] px-1 rounded-sm transition-colors ${
            isSelected
              ? 'bg-pi-accent/20 text-pi-text'
              : 'text-pi-muted hover:bg-pi-bg hover:text-pi-text'
          }`}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          onClick={() => {
            if (entry.isDirectory) {
              if (isGitView) toggleGitPath(entry.path);
              else togglePath(entry.path);
            }
            else if (isGitView) onSelectGitFile(entry.path);
            else onSelectFile(entry.path);
          }}
          onDoubleClick={() => { if (entry.isDirectory) handleZoomIn(entry.path); }}
        >
          {entry.isDirectory && (
            isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-pi-muted/60" /> : <ChevronRight className="w-3 h-3 flex-shrink-0 text-pi-muted/60" />
          )}
          {entry.isDirectory ? (
            <Folder className={`w-3 h-3 flex-shrink-0 ${gitStatus ? GIT_STATUS_COLORS[gitStatus] : hasChanges ? 'text-amber-400' : 'text-pi-muted/60'}`} />
          ) : (
            <FileText className={`w-3 h-3 flex-shrink-0 ${gitStatus ? GIT_STATUS_COLORS[gitStatus] : 'text-pi-muted/60'}`} />
          )}
          <span className={`truncate flex-1 ${gitStatus ? GIT_STATUS_COLORS[gitStatus] : hasChanges ? 'text-amber-400' : ''}`}
            title={gitStatus ? GIT_STATUS_LABELS[gitStatus] : hasChanges ? 'Contains changes' : undefined}>
            {entry.name}
          </span>
          {gitStatus && (
            <span className={`flex-shrink-0 px-1 rounded text-[9px] font-medium ${GIT_STATUS_BADGE_COLORS[gitStatus]}`}>
              {gitStatus === 'modified' ? 'M' : gitStatus === 'added' ? 'A' : gitStatus === 'deleted' ? 'D' : gitStatus === 'renamed' ? 'R' : gitStatus === 'untracked' ? 'U' : '!'}
            </span>
          )}
        </button>
      </div>
    );
  };

  if (section === 'files') {
    return (
      <>
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-pi-muted border-b border-pi-border/50 bg-pi-bg/30">
          <FolderOpen className="w-3 h-3 flex-shrink-0" />
          <span className="flex-shrink-0">Files</span>
          <span className="text-[10px] text-pi-muted/50 truncate normal-case tracking-normal">{treeRootLabel}</span>
          {canZoomOut && (
            <button
              onClick={handleZoomOut}
              className="ml-auto p-0.5 rounded hover:text-pi-text hover:bg-pi-bg transition-colors flex-shrink-0"
              title="Up one level"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {visibleNodes.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-pi-muted">
              {isRootEmpty ? 'No files found' : 'Loading files...'}
            </div>
          ) : (
            visibleNodes.map(({ entry, depth, isPlaceholder }) =>
              renderTreeItem(entry, depth, isPlaceholder, false)
            )
          )}
        </div>
      </>
    );
  }

  // Git section
  return (
    <>
      <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-pi-muted border-b border-pi-border/50 bg-pi-bg/30">
        <GitBranch className="w-3 h-3" />
        <span>Git Changes</span>
        {gitStatusFiles.length > 0 && (
          <span className="bg-amber-500/20 text-amber-400 px-1.5 rounded text-[10px] font-medium ml-auto">
            {gitStatusFiles.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {gitVisibleNodes.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-pi-muted text-center">
            No changes
          </div>
        ) : (
          gitVisibleNodes.map(({ entry, depth, isPlaceholder }) =>
            renderTreeItem(entry, depth, isPlaceholder, true)
          )
        )}
      </div>
    </>
  );
}
