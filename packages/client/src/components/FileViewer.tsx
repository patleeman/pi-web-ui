import { useState, useEffect, memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useTheme } from '../contexts/ThemeContext';
import { getCodeTheme } from '../codeTheme';
import { FileText, LoaderCircle, GitBranch } from 'lucide-react';

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', md: 'markdown', py: 'python', go: 'go', rs: 'rust',
  java: 'java', c: 'c', cpp: 'cpp', h: 'cpp', css: 'css', html: 'html',
  yml: 'yaml', yaml: 'yaml', sh: 'bash', zsh: 'bash', toml: 'toml', txt: 'text',
};

function getLanguage(path: string): string {
  const parts = path.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  return LANGUAGE_BY_EXT[ext] || 'text';
}

interface FileViewerProps {
  filePath: string;
  viewMode: 'file' | 'diff';
  workspaceId: string;
  onRequestFile: (workspaceId: string, path: string) => void;
  onRequestFileDiff: (workspaceId: string, path: string) => void;
}

export const FileViewer = memo(function FileViewer({
  filePath,
  viewMode,
  workspaceId,
  onRequestFile,
  onRequestFileDiff,
}: FileViewerProps) {
  const { theme } = useTheme();
  const editorTheme = getCodeTheme(theme.mode);
  const [content, setContent] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    
    if (viewMode === 'file') {
      setContent(null);
      onRequestFile(workspaceId, filePath);
    } else {
      setDiff(null);
      onRequestFileDiff(workspaceId, filePath);
    }
  }, [filePath, viewMode, workspaceId, onRequestFile, onRequestFileDiff]);

  // Listen for file content responses
  useEffect(() => {
    const handleFileContent = (e: CustomEvent<{ workspaceId: string; path: string; content: string; truncated: boolean }>) => {
      if (e.detail.workspaceId === workspaceId && e.detail.path === filePath && viewMode === 'file') {
        setContent(e.detail.content);
        setIsLoading(false);
      }
    };

    const handleFileDiff = (e: CustomEvent<{ workspaceId: string; path: string; diff: string }>) => {
      if (e.detail.workspaceId === workspaceId && e.detail.path === filePath && viewMode === 'diff') {
        setDiff(e.detail.diff);
        setIsLoading(false);
      }
    };

    window.addEventListener('pi:workspaceFile', handleFileContent as EventListener);
    window.addEventListener('pi:fileDiff', handleFileDiff as EventListener);
    
    return () => {
      window.removeEventListener('pi:workspaceFile', handleFileContent as EventListener);
      window.removeEventListener('pi:fileDiff', handleFileDiff as EventListener);
    };
  }, [workspaceId, filePath, viewMode]);

  const editorLanguage = getLanguage(filePath);
  const displayPath = filePath.split('/').pop() || filePath;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-pi-bg">
      {/* Header */}
      <div className="px-4 py-2 border-b border-pi-border flex items-center gap-2 bg-pi-surface">
        {viewMode === 'diff' && <GitBranch className="w-4 h-4 text-pi-muted flex-shrink-0" />}
        <FileText className="w-4 h-4 text-pi-muted flex-shrink-0" />
        <div className="text-[13px] text-pi-text truncate flex-1" title={filePath}>
          {displayPath}
        </div>
        {viewMode === 'diff' && (
          <span className="text-[11px] px-2 py-0.5 bg-pi-accent/20 text-pi-accent rounded">diff</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-[13px] text-pi-muted flex items-center gap-2">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <div className="text-[13px] text-pi-error">{error}</div>
        ) : viewMode === 'diff' ? (
          diff ? (
            <div className="font-mono text-[12px] leading-relaxed">
              {diff.split('\n').map((line, i) => {
                let lineClass = 'text-pi-muted';
                let bgClass = '';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  lineClass = 'text-pi-success';
                  bgClass = 'bg-pi-success/10';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  lineClass = 'text-pi-error';
                  bgClass = 'bg-pi-error/10';
                } else if (line.startsWith('@@')) {
                  lineClass = 'text-pi-accent';
                  bgClass = 'bg-pi-accent/10';
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
          ) : (
            <div className="text-[13px] text-pi-muted">No diff available</div>
          )
        ) : (
          content !== null ? (
            <div>
              <SyntaxHighlighter
                language={editorLanguage}
                style={editorTheme as any}
                customStyle={{
                  margin: 0,
                  background: 'transparent',
                  padding: 0,
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
                showLineNumbers
                lineNumberStyle={{ color: '#7d8590', paddingRight: '12px' }}
              >
                {content || ' '}
              </SyntaxHighlighter>
            </div>
          ) : (
            <div className="text-[13px] text-pi-muted flex flex-col items-center justify-center h-full gap-2">
              <FileText className="w-8 h-8 opacity-30" />
              <span>Unable to load file</span>
            </div>
          )
        )}
      </div>
    </div>
  );
});
