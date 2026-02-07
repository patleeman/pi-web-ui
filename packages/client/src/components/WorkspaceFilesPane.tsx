import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { FileText, LoaderCircle, ChevronRight, ClipboardList, Eye, GitBranch } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ActivePlanState, ActiveJobState, JobPhase } from '@pi-web-ui/shared';
import { PlansPane } from './PlansPane';
import { JobsPane } from './JobsPane';

type TabType = 'preview' | 'plans' | 'jobs';

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

interface WorkspaceFilesPaneProps {
  workspaceName: string;
  workspaceId: string;
  workspacePath: string;
  // Preview
  selectedFilePath: string;
  fileContentsByPath: Record<string, { content: string; truncated: boolean }>;
  fileDiffsByPath: Record<string, string>;
  onRequestFile: (path: string) => void;
  onRequestFileDiff: (path: string) => void;
  // View mode: 'file' for file preview, 'diff' for git diff
  viewMode: 'file' | 'diff';
  // Plans
  activePlan: ActivePlanState | null;
  onGetPlans: () => void;
  onGetPlanContent: (planPath: string) => void;
  onSavePlan: (planPath: string, content: string) => void;
  onActivatePlan: (planPath: string) => void;
  onDeactivatePlan: () => void;
  onUpdatePlanTask: (planPath: string, line: number, done: boolean) => void;
  // Jobs
  activeJobs: ActiveJobState[];
  onGetJobs: () => void;
  onGetJobContent: (jobPath: string) => void;
  onCreateJob: (title: string, description: string, tags?: string[]) => void;
  onSaveJob: (jobPath: string, content: string) => void;
  onPromoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onDemoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onUpdateJobTask: (jobPath: string, line: number, done: boolean) => void;
  onTogglePane: () => void;
  className?: string;
  style?: CSSProperties;
}

export function WorkspaceFilesPane({
  workspaceName,
  workspaceId,
  workspacePath,
  selectedFilePath,
  fileContentsByPath,
  fileDiffsByPath,
  onRequestFile,
  onRequestFileDiff,
  viewMode,
  activePlan,
  onGetPlans,
  onGetPlanContent,
  onSavePlan,
  onActivatePlan,
  onDeactivatePlan,
  onUpdatePlanTask,
  activeJobs,
  onGetJobs,
  onGetJobContent,
  onCreateJob,
  onSaveJob,
  onPromoteJob,
  onDemoteJob,
  onUpdateJobTask,
  onTogglePane,
  className = '',
  style,
}: WorkspaceFilesPaneProps) {
  const _workspaceName = workspaceName; // used by child components
  void _workspaceName;
  const [activeTabByWorkspace, setActiveTabByWorkspace] = useState<Record<string, TabType>>({});
  const activeTab = activeTabByWorkspace[workspaceId] || 'jobs';

  const setActiveTabForWorkspace = (tab: TabType) => {
    setActiveTabByWorkspace((prev) => {
      if (prev[workspaceId] === tab) return prev;
      return { ...prev, [workspaceId]: tab };
    });
  };


  // Look up content: try exact path, then absolute version
  const absolutePath = selectedFilePath && !selectedFilePath.startsWith('/') && !selectedFilePath.startsWith('~/')
    ? `${workspacePath.endsWith('/') ? workspacePath : workspacePath + '/'}${selectedFilePath}`
    : selectedFilePath;
  const selectedFileContent = selectedFilePath
    ? (fileContentsByPath[selectedFilePath] || fileContentsByPath[absolutePath])
    : undefined;
  const selectedFileDiff = selectedFilePath
    ? (fileDiffsByPath[selectedFilePath] || fileDiffsByPath[absolutePath])
    : undefined;

  // Request file content or diff when needed
  useEffect(() => {
    if (activeTab === 'preview' && selectedFilePath && viewMode === 'file' && !selectedFileContent) {
      onRequestFile(selectedFilePath);
    }
  }, [activeTab, selectedFilePath, selectedFileContent, onRequestFile, viewMode]);

  useEffect(() => {
    if (activeTab === 'preview' && selectedFilePath && viewMode === 'diff' && !selectedFileDiff) {
      onRequestFileDiff(selectedFilePath);
    }
  }, [activeTab, selectedFilePath, selectedFileDiff, onRequestFileDiff, viewMode]);

  const editorLanguage = selectedFilePath ? getLanguage(selectedFilePath) : 'text';
  const displayPath = selectedFilePath || '';

  return (
    <aside className={`w-72 border-l border-pi-border bg-pi-surface flex flex-col ${className}`} style={style}>
      {/* Tab header */}
      <div className="h-10 px-3 border-b border-pi-border flex items-center">
        <button
          onClick={() => setActiveTabForWorkspace('jobs')}
          className={`px-2 h-full text-[12px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
            activeTab === 'jobs'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <ClipboardList className="w-3 h-3" />
          Jobs
          {activeJobs.length > 0 && (
            <span className="bg-green-500/20 text-green-400 px-1.5 rounded text-[10px] font-medium">
              {activeJobs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTabForWorkspace('preview')}
          className={`px-2 h-full text-[12px] uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
            activeTab === 'preview'
              ? 'text-pi-text border-b-2 border-pi-accent -mb-[1px]'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <Eye className="w-3 h-3" />
          Preview
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onTogglePane}
          className="p-1.5 text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors"
          title="Hide pane (⌘⇧F)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Jobs tab */}
      {activeTab === 'jobs' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <JobsPane
            key={workspaceId}
            workspaceId={workspaceId}
            activeJobs={activeJobs}
            onGetJobs={onGetJobs}
            onGetJobContent={onGetJobContent}
            onCreateJob={onCreateJob}
            onSaveJob={onSaveJob}
            onPromoteJob={onPromoteJob}
            onDemoteJob={onDemoteJob}
            onUpdateJobTask={onUpdateJobTask}
          />
        </div>
      )}

      {/* Plans tab (legacy) */}
      {activeTab === 'plans' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PlansPane
            workspaceId={workspaceId}
            activePlan={activePlan}
            onGetPlans={onGetPlans}
            onGetPlanContent={onGetPlanContent}
            onSavePlan={onSavePlan}
            onActivatePlan={onActivatePlan}
            onDeactivatePlan={onDeactivatePlan}
            onUpdatePlanTask={onUpdatePlanTask}
          />
        </div>
      )}

      {/* Preview / Diff tab */}
      {activeTab === 'preview' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* File path */}
          <div className="px-3 py-2 border-b border-pi-border flex items-center gap-2">
            {viewMode === 'diff' && <GitBranch className="w-3 h-3 text-pi-muted flex-shrink-0" />}
            <div className="text-[12px] text-pi-text truncate flex-1" title={displayPath}>
              {displayPath || ''}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 py-3">
            {!selectedFilePath ? (
              <div className="text-[12px] text-pi-muted flex flex-col items-center justify-center h-full gap-2">
                <FileText className="w-6 h-6 opacity-30" />
                <span>Select a file to preview</span>
              </div>
            ) : viewMode === 'diff' ? (
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
                    <div className="mt-2 text-[12px] text-pi-muted">
                      Preview truncated — file is larger than 200KB.
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
