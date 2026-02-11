import { useState, useEffect, useCallback, memo } from 'react';
import type { CSSProperties } from 'react';
import { ChevronRight, ClipboardList } from 'lucide-react';
import type { ActivePlanState, ActiveJobState, JobPhase } from '@pi-deck/shared';
import { JobsPane } from './JobsPane';





interface WorkspaceFilesPaneProps {
  workspaceName: string;
  workspaceId: string;
  workspacePath: string;
  activePlan: ActivePlanState | null;
  onGetPlans: () => void;
  onGetPlanContent: (planPath: string) => void;
  onSavePlan: (planPath: string, content: string) => void;
  onActivatePlan: (planPath: string) => void;
  onDeactivatePlan: () => void;
  onUpdatePlanTask: (planPath: string, line: number, done: boolean) => void;
  activeJobs: ActiveJobState[];
  onGetJobs: (workspaceId?: string) => void;
  onGetJobContent: (jobPath: string, workspaceId?: string) => void;
  onGetJobLocations: () => void;
  onCreateJob: (title: string, description: string, tags?: string[], location?: string) => void;
  onSaveJob: (jobPath: string, content: string) => void;
  onPromoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onDemoteJob: (jobPath: string, toPhase?: JobPhase) => void;
  onUpdateJobTask: (jobPath: string, line: number, done: boolean) => void;
  onDeleteJob?: (jobPath: string) => void;
  onRenameJob?: (jobPath: string, newTitle: string) => void;
  onArchiveJob?: (jobPath: string) => void;
  onUnarchiveJob?: (jobPath: string) => void;
  onGetArchivedJobs?: () => void;
  onStartJobConversation?: (jobPath: string, message?: string) => void;
  onNavigateToSlot?: (slotId: string) => void;
  onTogglePane: () => void;
  onAddJobAttachment?: (jobPath: string, file: File, onProgress?: (loaded: number, total: number) => void) => Promise<void>;
  onRemoveJobAttachment?: (jobPath: string, attachmentId: string) => void;
  onReadJobAttachment?: (jobPath: string, attachmentId: string) => Promise<{ base64Data: string; mediaType: string } | null>;
  onBrowseJobDirectory?: (path?: string) => void;
  onAddJobLocation?: (path: string) => void;
  className?: string;
  style?: CSSProperties;
}

export const WorkspaceFilesPane = memo(function WorkspaceFilesPane({
  workspaceName,
  workspaceId,
  workspacePath,
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
  onGetJobLocations,
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
  onStartJobConversation,
  onNavigateToSlot,
  onTogglePane,
  onAddJobAttachment,
  onRemoveJobAttachment,
  onReadJobAttachment,
  onBrowseJobDirectory,
  onAddJobLocation,
  className = '',
  style,
}: WorkspaceFilesPaneProps) {
  void workspaceName;
  void activePlan;
  void onGetPlans;
  void onGetPlanContent;
  void onSavePlan;
  void onActivatePlan;
  void onDeactivatePlan;
  void onUpdatePlanTask;

  const [jobsViewMode, setJobsViewMode] = useState<'list' | 'create' | null>(null);

  useEffect(() => {
    const handleSwitchTab = (e: CustomEvent<{ tab: string; mode?: string }>) => {
      const tab = e.detail.tab;
      if (tab === 'jobs') {
        setJobsViewMode(e.detail.mode as 'list' | 'create' | null);
      }
    };
    window.addEventListener('pi:switchRightPaneTab', handleSwitchTab as EventListener);
    return () => window.removeEventListener('pi:switchRightPaneTab', handleSwitchTab as EventListener);
  }, [workspaceId]);

  const handleJobsViewModeConsumed = useCallback(() => {
    setJobsViewMode(null);
  }, []);

  return (
    <aside className={`w-72 border-l border-pi-border bg-pi-surface flex flex-col ${className}`} style={style}>
      {/* Tab header */}
      <div className="h-10 px-3 border-b border-pi-border flex items-center">
        <div className="relative px-2 h-full text-[12px] uppercase tracking-wide transition-colors flex items-center gap-1.5 text-pi-text">
          <ClipboardList className="w-3 h-3" />
          Jobs
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-pi-accent" />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onTogglePane}
          className="hidden sm:flex p-1.5 text-pi-muted hover:text-pi-text hover:bg-pi-bg rounded transition-colors"
          title="Hide pane (⌘⇧F)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Jobs tab */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <JobsPane
          key={workspaceId}
          workspaceId={workspaceId}
          workspacePath={workspacePath}
          activeJobs={activeJobs}
          onGetJobs={onGetJobs}
          onGetJobContent={onGetJobContent}
          onGetJobLocations={onGetJobLocations}
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
          onStartJobConversation={onStartJobConversation}
          onNavigateToSlot={onNavigateToSlot}
          requestedViewMode={jobsViewMode}
          onViewModeConsumed={handleJobsViewModeConsumed}
          onAddJobAttachment={onAddJobAttachment}
          onRemoveJobAttachment={onRemoveJobAttachment}
          onReadJobAttachment={onReadJobAttachment}
          onBrowseJobDirectory={onBrowseJobDirectory}
          onAddJobLocation={onAddJobLocation}
        />
      </div>
    </aside>
  );
});
