import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, Folder, FileText, LoaderCircle, GitBranch, FolderOpen } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { FileInfo, GitFileStatus, GitStatusFile } from '@pi-web-ui/shared';

// Git status colors matching common IDE conventions
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

type TabType = 'files' | 'git';

interface WorkspaceFilesPaneProps {
  workspaceName: string;
  entriesByPath: Record<string, FileInfo[]>;
  fileContentsByPath: Record<string, { content: string; truncated: boolean }>;
  gitStatusFiles: GitStatusFile[];
  fileDiffsByPath: Record<string, string>;
  onRequestEntries: (path: string) => void;
  onRequestFile: (path: string) => void;
  onRequestGitStatus: () => void;
  onRequestFileDiff: (path: string) => void;
  onTogglePane: () => void;
  openFilePath?: string;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_TREE_RATIO = 0.33;
const MIN_TREE_RATIO = 0.2;
const MAX_TREE_RATIO = 0.8;

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

const editorTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: 0,
    fontSize: '12px',
    lineHeight: '1.5',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '12px',
  },
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  md: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'cpp',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  zsh: 'bash',
  toml: 'toml',
  txt: 'text',
};

function getLanguage(path: string): string {
  const parts = path.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  return LANGUAGE_BY_EXT[ext] || 'text';
}

function getParentPath(path: string): string {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

// Build a tree structure from git status files
function buildGitTree(files: GitStatusFile[]): GitTreeNode {
  const root: GitTreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          gitStatus: isLast ? file.status : undefined,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }

  return root;
}

// Flatten git tree for rendering (always fully expanded)
function flattenGitTree(node: GitTreeNode, depth: number): TreeRow[] {
  const rows: TreeRow[] = [];
  
  // Sort children: directories first, then alphabetically
  const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const child of sortedChildren) {
    rows.push({
      entry: {
        name: child.name,
        path: child.path,
        isDirectory: child.isDirectory,
        gitStatus: child.gitStatus,
        hasChanges: child.isDirectory && child.children.size > 0,
      },
      depth,
    });

    // Always expand directories in git view
    if (child.isDirectory) {
      rows.push(...flattenGitTree(child, depth + 1));
    }
  }

  return rows;
}

export function WorkspaceFilesPane({
  workspaceName,
  entriesByPath,
  fileContentsByPath,
  gitStatusFiles,
  fileDiffsByPath,
  onRequestEntries,
  onRequestFile,
  onRequestGitStatus,
  onRequestFileDiff,
  onTogglePane,
  openFilePath,
  className = '',
  style,
}: WorkspaceFilesPaneProps) {
  const [activeTab, setActiveTab] = useState<TabType>('files');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [treeRootPath, setTreeRootPath] = useState('');
  const [treeRatio, setTreeRatio] = useState(DEFAULT_TREE_RATIO);
  const [isResizing, setIsResizing] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const entryIndex = useMemo(() => {
    const map = new Map<string, FileInfo>();
    Object.values(entriesByPath).forEach((entries) => {
      entries.forEach((entry) => map.set(entry.path, entry));
    });
    return map;
  }, [entriesByPath]);

  // Build git tree from git status files
  const gitTree = useMemo(() => buildGitTree(gitStatusFiles), [gitStatusFiles]);
  
  // Flatten git tree for display (always expanded)
  const gitVisibleNodes = useMemo(() => {
    return flattenGitTree(gitTree, 0);
  }, [gitTree]);

  // Request git status when switching to git tab or workspace changes
  useEffect(() => {
    if (activeTab === 'git') {
      onRequestGitStatus();
    }
  }, [activeTab, workspaceName, onRequestGitStatus]);

  useEffect(() => {
    setTreeRootPath('');
    setExpandedPaths(new Set());
    setSelectedPath('');
  }, [workspaceName]);

  useEffect(() => {
    if (!entriesByPath[treeRootPath]) {
      onRequestEntries(treeRootPath);
    }
  }, [entriesByPath, onRequestEntries, treeRootPath]);

  useEffect(() => {
    if (!selectedPath || entryIndex.has(selectedPath)) return;
    const parentPath = getParentPath(selectedPath);
    if (!entriesByPath[parentPath]) return;
    setSelectedPath('');
  }, [entriesByPath, entryIndex, selectedPath]);

  useEffect(() => {
    if (!selectedPath || !treeRootPath) return;
    const isWithinRoot = selectedPath === treeRootPath || selectedPath.startsWith(`${treeRootPath}/`);
    if (!isWithinRoot) {
      setSelectedPath('');
    }
  }, [selectedPath, treeRootPath]);

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!entriesByPath[path]) {
          onRequestEntries(path);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (!openFilePath) return;
    const normalizedPath = openFilePath.replace(/^\/+/, '');
    if (!normalizedPath) return;
    const rootIsAncestor = treeRootPath === ''
      || normalizedPath === treeRootPath
      || normalizedPath.startsWith(`${treeRootPath}/`);
    if (!rootIsAncestor) {
      setTreeRootPath(getParentPath(normalizedPath));
      setExpandedPaths(new Set());
    }
    setSelectedPath(normalizedPath);
  }, [openFilePath, treeRootPath]);

  const handleZoomOut = useCallback(() => {
    setTreeRootPath((prev) => getParentPath(prev));
  }, []);

  const handleZoomIn = useCallback((path: string) => {
    setTreeRootPath(path);
  }, []);

  const handleResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = splitRef.current?.getBoundingClientRect();
      if (!container) return;
      const ratio = (event.clientY - container.top) / container.height;
      const clampedRatio = Math.min(Math.max(ratio, MIN_TREE_RATIO), MAX_TREE_RATIO);
      setTreeRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const visibleNodes = useMemo(() => {
    const nodes: TreeRow[] = [];
    const rootEntries = entriesByPath[treeRootPath] || [];
    const stack: Array<{ entry: FileInfo; depth: number }> = [];

    for (let i = rootEntries.length - 1; i >= 0; i -= 1) {
      stack.push({ entry: rootEntries[i], depth: 0 });
    }

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      nodes.push({ entry: current.entry, depth: current.depth });

      if (current.entry.isDirectory && expandedPaths.has(current.entry.path)) {
        const children = entriesByPath[current.entry.path];
        if (!children) {
          nodes.push({
            entry: {
              name: 'Loading...',
              path: `__loading__/${current.entry.path}`,
              isDirectory: false,
            },
            depth: current.depth + 1,
            isPlaceholder: true,
          });
        } else if (children.length === 0) {
          nodes.push({
            entry: {
              name: 'Empty folder',
              path: `__empty__/${current.entry.path}`,
              isDirectory: false,
            },
            depth: current.depth + 1,
            isPlaceholder: true,
          });
        } else {
          for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push({ entry: children[i], depth: current.depth + 1 });
          }
        }
      }
    }

    return nodes;
  }, [entriesByPath, expandedPaths, treeRootPath]);

  const selectedEntry = selectedPath ? entryIndex.get(selectedPath) : undefined;
  const selectedFilePath = selectedPath && (!selectedEntry || !selectedEntry.isDirectory) ? selectedPath : '';
  const selectedFileContent = selectedFilePath ? fileContentsByPath[selectedFilePath] : undefined;
  const selectedFileDiff = selectedFilePath ? fileDiffsByPath[selectedFilePath] : undefined;

  // Request file content when in Files tab
  useEffect(() => {
    if (activeTab === 'files' && selectedFilePath && !selectedFileContent) {
      onRequestFile(selectedFilePath);
    }
  }, [activeTab, selectedFilePath, selectedFileContent, onRequestFile]);

  // Request diff when in Git tab
  useEffect(() => {
    if (activeTab === 'git' && selectedFilePath && !selectedFileDiff) {
      onRequestFileDiff(selectedFilePath);
    }
  }, [activeTab, selectedFilePath, selectedFileDiff, onRequestFileDiff]);

  const hasRootEntries = Object.prototype.hasOwnProperty.call(entriesByPath, treeRootPath);
  const isRootEmpty = hasRootEntries && (entriesByPath[treeRootPath]?.length ?? 0) === 0;
  const editorLanguage = selectedFilePath ? getLanguage(selectedFilePath) : 'text';
  const treeRootLabel = treeRootPath ? `/${workspaceName}/${treeRootPath}` : `/${workspaceName}`;
  const canZoomOut = treeRootPath !== '';

  const renderTreeItem = (
    entry: FileInfo,
    depth: number,
    isPlaceholder: boolean | undefined,
    isGitView: boolean
  ) => {
    const isSelected = selectedPath === entry.path;
    const showLoader = Boolean(isPlaceholder && entry.name === 'Loading...');
    const gitStatus = entry.gitStatus;
    const hasChanges = entry.hasChanges;

    return (
      <div key={entry.path}>
        <button
          onClick={() => !isPlaceholder && setSelectedPath(entry.path)}
          onDoubleClick={() => {
            if (!isPlaceholder && entry.isDirectory && !isGitView) {
              handleZoomIn(entry.path);
            }
          }}
          className={`w-full flex items-center gap-2 py-1 rounded text-left text-[12px] transition-colors ${
            isSelected ? 'bg-pi-border/40 text-pi-text' : 'text-pi-muted hover:text-pi-text hover:bg-pi-bg'
          } ${isPlaceholder ? 'cursor-default opacity-70' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          disabled={isPlaceholder}
        >
          {entry.isDirectory ? (
            isGitView ? (
              // Git view: no toggle, just show expanded chevron
              <span className="w-4 h-4 flex items-center justify-center">
                <ChevronDown className="w-3 h-3" />
              </span>
            ) : (
              <span
                className="w-4 h-4 flex items-center justify-center"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isPlaceholder) {
                    togglePath(entry.path);
                  }
                }}
              >
                {expandedPaths.has(entry.path) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
            )
          ) : (
            <span className="w-4 h-4 flex items-center justify-center">
              {showLoader ? <LoaderCircle className="w-3 h-3 animate-spin" /> : null}
            </span>
          )}
          {entry.isDirectory ? (
            <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${hasChanges ? 'text-amber-400' : 'text-pi-muted'}`} />
          ) : (
            <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${gitStatus ? GIT_STATUS_COLORS[gitStatus] : 'text-pi-muted'}`} />
          )}
          <span className={`truncate flex-1 ${gitStatus ? GIT_STATUS_COLORS[gitStatus] : hasChanges ? 'text-amber-400' : ''}`} title={gitStatus ? GIT_STATUS_LABELS[gitStatus] : hasChanges ? 'Contains changes' : undefined}>
            {entry.name}
          </span>
          {gitStatus && (
            <span className={`flex-shrink-0 mr-1 px-1 rounded text-[9px] font-medium ${GIT_STATUS_BADGE_COLORS[gitStatus]}`} title={GIT_STATUS_LABELS[gitStatus]}>
              {gitStatus === 'modified' ? 'M' : gitStatus === 'added' ? 'A' : gitStatus === 'deleted' ? 'D' : gitStatus === 'renamed' ? 'R' : gitStatus === 'untracked' ? 'U' : '!'}
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <aside className={`w-72 border-l border-pi-border bg-pi-surface flex flex-col ${className}`} style={style}>
      {/* Tab header */}
      <div className="border-b border-pi-border flex items-center">
        <button
          type="button"
          onClick={onTogglePane}
          className="p-2 text-pi-muted hover:text-pi-text hover:bg-pi-bg transition-colors"
          title="Hide file pane (⌘⇧F)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-3 py-2 text-[11px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
            activeTab === 'files'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <FolderOpen className="w-3 h-3" />
          Files
        </button>
        <button
          onClick={() => setActiveTab('git')}
          className={`px-3 py-2 text-[11px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
            activeTab === 'git'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <GitBranch className="w-3 h-3" />
          Git
          {gitStatusFiles.length > 0 && (
            <span className="bg-amber-500/20 text-amber-400 px-1.5 rounded text-[10px] font-medium">
              {gitStatusFiles.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col" ref={splitRef}>
        <div className="min-h-0 flex flex-col" style={{ flex: `${treeRatio} 1 0%` }}>
          {/* Path breadcrumb */}
          <div className="px-3 py-2 border-b border-pi-border flex items-center gap-2 text-[11px] text-pi-muted">
            {activeTab === 'files' && (
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={!canZoomOut}
                className={`p-1 rounded transition-colors ${
                  canZoomOut ? 'text-pi-muted hover:text-pi-text hover:bg-pi-bg' : 'text-pi-muted/40 cursor-not-allowed'
                }`}
                title="Up one level"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
            )}
            <span className="truncate">
              {activeTab === 'files' ? treeRootLabel : `/${workspaceName}`}
            </span>
          </div>

          {/* Tree content */}
          <div className="flex-1 overflow-y-auto py-2">
            {activeTab === 'files' ? (
              // Files tab
              visibleNodes.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-pi-muted">
                  {isRootEmpty ? 'No files found' : 'Loading files...'}
                </div>
              ) : (
                visibleNodes.map(({ entry, depth, isPlaceholder }) =>
                  renderTreeItem(entry, depth, isPlaceholder, false)
                )
              )
            ) : (
              // Git tab
              gitVisibleNodes.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-pi-muted text-center">
                  <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div>No changes detected</div>
                  <div className="text-[11px] mt-1 opacity-70">Working tree clean</div>
                </div>
              ) : (
                gitVisibleNodes.map(({ entry, depth, isPlaceholder }) =>
                  renderTreeItem(entry, depth, isPlaceholder, true)
                )
              )
            )}
          </div>
        </div>

        <div
          onMouseDown={handleResizeStart}
          className="flex-shrink-0 h-1 cursor-row-resize hover:bg-pi-border flex items-center justify-center"
        >
          <div className="bg-pi-border/50 rounded-full h-0.5 w-6" />
        </div>

        <div
          className="border-t border-pi-border flex flex-col min-h-0"
          style={{ flex: `${1 - treeRatio} 1 0%` }}
        >
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-pi-muted">
            {activeTab === 'git' ? 'Diff' : 'Preview'}
          </div>
          <div className="px-3 pb-2 text-[12px] text-pi-text truncate" title={selectedFilePath ? `/${selectedFilePath}` : ''}>
            {selectedFilePath ? `/${selectedFilePath}` : ''}
          </div>
          <div className="flex-1 overflow-auto px-3 pb-3">
            {!selectedFilePath ? (
              <div className="text-[12px] text-pi-muted flex flex-col items-center justify-center h-full gap-2">
                <FileText className="w-6 h-6 opacity-30" />
                <span>{activeTab === 'git' ? 'Select a file to view diff' : 'Select a file to preview'}</span>
              </div>
            ) : activeTab === 'git' ? (
              // Git diff view
              !selectedFileDiff ? (
                <div className="text-[12px] text-pi-muted flex items-center gap-2">
                  <LoaderCircle className="w-3 h-3 animate-spin" />
                  Loading diff...
                </div>
              ) : (
                <div className="rounded border border-pi-border bg-pi-bg p-2 font-mono text-[12px] leading-relaxed">
                  {selectedFileDiff.split('\n').map((line, i) => {
                    let lineClass = 'text-pi-muted';
                    let bgClass = '';
                    
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      lineClass = 'text-green-400';
                      bgClass = 'bg-green-500/10';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      lineClass = 'text-red-400';
                      bgClass = 'bg-red-500/10';
                    } else if (line.startsWith('@@')) {
                      lineClass = 'text-sky-400';
                      bgClass = 'bg-sky-500/10';
                    } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                      lineClass = 'text-pi-muted';
                    }
                    
                    return (
                      <div key={i} className={`whitespace-pre ${bgClass}`}>
                        <span className={lineClass}>{line}</span>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // File content view
              !selectedFileContent ? (
                <div className="text-[12px] text-pi-muted flex items-center gap-2">
                  <LoaderCircle className="w-3 h-3 animate-spin" />
                  Loading file...
                </div>
              ) : (
                <div className="rounded border border-pi-border bg-pi-bg p-2">
                  <SyntaxHighlighter
                    language={editorLanguage}
                    style={editorTheme as any}
                    customStyle={{
                      margin: 0,
                      background: 'transparent',
                      padding: 0,
                      fontSize: '12px',
                      lineHeight: '1.5',
                    }}
                    showLineNumbers
                    lineNumberStyle={{ color: '#7d8590', paddingRight: '12px' }}
                  >
                    {selectedFileContent.content || ' '}
                  </SyntaxHighlighter>
                  {selectedFileContent.truncated && (
                    <div className="mt-2 text-[11px] text-pi-muted">
                      Preview truncated — file is larger than 200KB.
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
