import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { FileText, LoaderCircle, ChevronRight, ClipboardList, Eye, GitBranch } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useTheme } from '../contexts/ThemeContext';
import { getCodeTheme } from '../codeTheme';
import type { ActivePlanState, ActiveJobState, JobPhase } from '@pi-deck/shared';
import { PlansPane } from './PlansPane';
import { JobsPane } from './JobsPane';

type TabType = 'preview' | 'plans' | 'jobs';

// editorTheme is resolved inside the component via useTheme

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
  onGetJobs: (workspaceId?: string) => void;
  onGetJobContent: (jobPath: string, workspaceId?: string) => void;
  onCreateJob: (title: string, description: string, tags?: string[]) => void;
  onSaveJob: (jobPath: string, content: string) => void;
  onPromoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onDemoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onUpdateJobTask: (jobPath: string, line: number, done: boolean) => void;
  onDeleteJob?: (jobPath: string) => void;
  onRenameJob?: (jobPath: string, newTitle: string) => void;
  onArchiveJob?: (jobPath: string) => void;
  onUnarchiveJob?: (jobPath: string) => void;
  onGetArchivedJobs?: () => void;
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
  onDeleteJob,
  onRenameJob,
  onArchiveJob,
  onUnarchiveJob,
  onGetArchivedJobs,
  onTogglePane,
  className = '',
  style,
}: WorkspaceFilesPaneProps) {
  const _workspaceName = workspaceName; // used by child components
  void _workspaceName;
  const { theme } = useTheme();
  const editorTheme = getCodeTheme(theme.mode);
  const [activeTabByWorkspace, setActiveTabByWorkspace] = useState<Record<string, TabType>>({});
  const activeTab = activeTabByWorkspace[workspaceId] || 'jobs';

  const setActiveTabForWorkspace = (tab: TabType) => {
    setActiveTabByWorkspace((prev) => {
      if (prev[workspaceId] === tab) return prev;
      return { ...prev, [workspaceId]: tab };
    });
  };

  // Listen for tab switch events (from /jobs command, keyboard shortcuts, etc.)
  const [jobsViewMode, setJobsViewMode] = useState<'list' | 'create' | null>(null);

  useEffect(() => {
    const handleSwitchTab = (e: CustomEvent<{ tab: string; mode?: string }>) => {
      const tab = e.detail.tab;
      if (tab === 'jobs' || tab === 'preview' || tab === 'plans') {
        setActiveTabForWorkspace(tab === 'plans' ? 'jobs' : tab as TabType);
      }
      if (tab === 'jobs' && e.detail.mode) {
        setJobsViewMode(e.detail.mode as 'list' | 'create');
      }
    };
    window.addEventListener('pi:switchRightPaneTab', handleSwitchTab as EventListener);
    return () => window.removeEventListener('pi:switchRightPaneTab', handleSwitchTab as EventListener);
  }, [workspaceId]);

  // Clear the jobs view mode override after it's been consumed
  const handleJobsViewModeConsumed = useCallback(() => {
    setJobsViewMode(null);
  }, []);

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
            <span className="bg-pi-success/20 text-pi-success px-1.5 rounded text-[10px] font-medium">
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
            onDeleteJob={onDeleteJob}
            onRenameJob={onRenameJob}
            onArchiveJob={onArchiveJob}
            onUnarchiveJob={onUnarchiveJob}
            onGetArchivedJobs={onGetArchivedJobs}
            requestedViewMode={jobsViewMode}
            onViewModeConsumed={handleJobsViewModeConsumed}
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
