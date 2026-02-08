import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  ArrowLeft,
  Edit3,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  ClipboardList,
  ArrowRightCircle,
  ArrowLeftCircle,
  AlertTriangle,
  X,
  MoreHorizontal,
  Trash2,
  Pencil,
  Search,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import type { JobInfo, JobPhase, JobTask, ActiveJobState } from '@pi-deck/shared';
import { JOB_PHASE_ORDER } from '@pi-deck/shared';
import { JobMarkdownContent } from './JobMarkdownContent';
import { CodeMirrorEditor } from './CodeMirrorEditor';

interface JobsPaneProps {
  workspaceId: string;
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
  /** External request to switch view mode (from /jobs command) */
  requestedViewMode?: 'list' | 'create' | null;
  /** Called after the requested view mode has been applied */
  onViewModeConsumed?: () => void;
}

type ViewMode = 'list' | 'detail' | 'editor' | 'create';
type JobSortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
type JobGroupMode = 'phase' | 'tag' | 'none';

interface JobTemplate {
  id: string;
  label: string;
  tags: string;
  description: string;
}

const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: 'general',
    label: 'General',
    tags: '',
    description: [
      '## Description',
      '<!-- What needs to be done? -->',
      '',
      '## Review',
      '- Run /skill:code-review on all changed files',
    ].join('\n'),
  },
  {
    id: 'feature',
    label: 'Feature',
    tags: 'feature',
    description: [
      '## Context',
      '<!-- What problem does this solve? Why is it needed? -->',
      '',
      '## Requirements',
      '<!-- What should the feature do? List acceptance criteria. -->',
      '',
      '## Review',
      '- Run /skill:code-review on all changed files',
      '- Run /skill:security-review',
    ].join('\n'),
  },
  {
    id: 'bugfix',
    label: 'Bug Fix',
    tags: 'bugfix',
    description: [
      '## Bug Description',
      '<!-- What is the bug? How to reproduce? -->',
      '',
      '## Expected Behavior',
      '<!-- What should happen instead? -->',
      '',
      '## Review',
      '- Run /skill:code-review on all changed files',
      '- Verify the bug no longer reproduces',
    ].join('\n'),
  },
  {
    id: 'refactor',
    label: 'Refactor',
    tags: 'refactor',
    description: [
      '## Current State',
      '<!-- What code needs refactoring and why? -->',
      '',
      '## Goal',
      '<!-- What should the code look like after? -->',
      '',
      '## Constraints',
      '<!-- What must not change? (APIs, behavior, etc.) -->',
      '',
      '## Review',
      '- Run /skill:code-review on all changed files',
      '- Verify all existing tests still pass',
    ].join('\n'),
  },
  {
    id: 'test',
    label: 'Tests',
    tags: 'testing',
    description: [
      '## Scope',
      '<!-- What code needs test coverage? -->',
      '',
      '## Coverage Goals',
      '<!-- Target coverage %, specific edge cases, etc. -->',
      '',
      '## Review',
      '- Run /skill:backfill-tests to verify coverage',
    ].join('\n'),
  },
];

type JobListSection = {
  id: string;
  label: string;
  jobs: JobInfo[];
  kind: 'phase' | 'tag' | 'all';
  phase?: JobPhase;
};

const AUTOSAVE_DELAY_MS = 500;

const PHASE_LABELS: Record<JobPhase, string> = {
  executing: 'Executing',
  planning: 'Planning',
  review: 'Review',
  ready: 'Ready',
  backlog: 'Backlog',
  complete: 'Complete',
};

const PHASE_COLORS: Record<JobPhase, { bg: string; text: string }> = {
  executing: { bg: 'bg-green-500/20', text: 'text-green-400' },
  planning: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  review: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  ready: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  backlog: { bg: 'bg-pi-muted/20', text: 'text-pi-muted' },
  complete: { bg: 'bg-pi-muted/10', text: 'text-pi-muted' },
};

function PhaseBadge({ phase }: { phase: JobPhase }) {
  const c = PHASE_COLORS[phase];
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${c.bg} ${c.text}`}>
      {PHASE_LABELS[phase]}
    </span>
  );
}

/** Get the promote action label for a given phase */
function getPromoteLabel(phase: JobPhase): string | null {
  switch (phase) {
    case 'backlog': return 'Start Planning';
    case 'planning': return 'Mark Ready';
    case 'ready': return 'Start Execution';
    case 'executing': return 'Move to Review';
    case 'review': return 'Complete';
    default: return null;
  }
}

/** Get the demote action label for a given phase */
function getDemoteLabel(phase: JobPhase): string | null {
  switch (phase) {
    case 'review': return 'Back to Executing';
    case 'ready': return 'Back to Planning';
    default: return null;
  }
}

function parseTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of value.split(',')) {
    const tag = rawTag.trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

function sortJobs(items: JobInfo[], mode: JobSortMode): JobInfo[] {
  const sorted = [...items];

  sorted.sort((a, b) => {
    switch (mode) {
      case 'updated-asc':
        return a.updatedAt.localeCompare(b.updatedAt);
      case 'title-asc':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'title-desc':
        return b.title.localeCompare(a.title, undefined, { sensitivity: 'base' });
      case 'updated-desc':
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });

  return sorted;
}

export function JobsPane({
  workspaceId,
  activeJobs: _activeJobs,
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
  requestedViewMode,
  onViewModeConsumed,
}: JobsPaneProps) {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [archivedJobs, setArchivedJobs] = useState<JobInfo[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editorContent, setEditorContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['phase:complete']));
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const viewModeRef = useRef<ViewMode>('list');
  const [menuOpenForJob, setMenuOpenForJob] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('');

  // List controls
  const [sortMode, setSortMode] = useState<JobSortMode>('updated-desc');
  const [groupMode, setGroupMode] = useState<JobGroupMode>('phase');
  const [filterText, setFilterText] = useState('');

  // Keep viewMode ref in sync for use in event handlers without adding to deps
  viewModeRef.current = viewMode;

  // Listen for job events
  useEffect(() => {
    const handleJobsList = (e: CustomEvent<{ workspaceId: string; jobs: JobInfo[] }>) => {
      if (e.detail.workspaceId === workspaceId) {
        setJobs(e.detail.jobs);
        // Re-fetch content when viewing a job that was updated externally (e.g., agent wrote to the file)
        if (selectedJob && viewModeRef.current === 'detail') {
          const updated = e.detail.jobs.find(j => j.path === selectedJob.path);
          if (updated && updated.updatedAt !== selectedJob.updatedAt) {
            onGetJobContent(selectedJob.path, workspaceId);
          }
        }
      }
    };

    const handleJobContent = (e: CustomEvent<{ workspaceId: string; jobPath: string; content: string; job: JobInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        setEditorContent(e.detail.content);
        lastSavedContentRef.current = e.detail.content;
        setSelectedJob(e.detail.job);
        setError(null);
      }
    };

    const handleJobSaved = (e: CustomEvent<{ workspaceId: string; jobPath: string; job: JobInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        if (selectedJob?.path === e.detail.jobPath) {
          setSelectedJob(e.detail.job);
        }
        onGetJobs(workspaceId);
      }
    };

    const handleJobPromoted = (e: CustomEvent<{ workspaceId: string; jobPath: string; job: JobInfo; sessionSlotId?: string }>) => {
      if (e.detail.workspaceId === workspaceId) {
        if (selectedJob?.path === e.detail.jobPath) {
          setSelectedJob(e.detail.job);
          // Re-fetch content since promotion may have updated frontmatter
          onGetJobContent(e.detail.jobPath, workspaceId);
        }
        onGetJobs(workspaceId);
      }
    };

    const handleJobTaskUpdated = (e: CustomEvent<{ workspaceId: string; jobPath: string; job: JobInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        if (selectedJob?.path === e.detail.jobPath) {
          setSelectedJob(e.detail.job);
          onGetJobContent(e.detail.jobPath, workspaceId);
        }
        onGetJobs(workspaceId);
      }
    };

    const handleArchivedJobsList = (e: CustomEvent<{ workspaceId: string; jobs: JobInfo[] }>) => {
      if (e.detail.workspaceId === workspaceId) {
        setArchivedJobs(e.detail.jobs);
      }
    };

    const handleError = (e: CustomEvent<{ message: string; workspaceId?: string }>) => {
      if (e.detail.workspaceId === workspaceId && (e.detail.message.includes('job') || e.detail.message.includes('Job'))) {
        setError(e.detail.message);
      }
    };

    window.addEventListener('pi:jobsList', handleJobsList as EventListener);
    window.addEventListener('pi:jobContent', handleJobContent as EventListener);
    window.addEventListener('pi:jobSaved', handleJobSaved as EventListener);
    window.addEventListener('pi:jobPromoted', handleJobPromoted as EventListener);
    window.addEventListener('pi:jobTaskUpdated', handleJobTaskUpdated as EventListener);
    window.addEventListener('pi:archivedJobsList', handleArchivedJobsList as EventListener);
    window.addEventListener('pi:error', handleError as EventListener);

    return () => {
      window.removeEventListener('pi:jobsList', handleJobsList as EventListener);
      window.removeEventListener('pi:jobContent', handleJobContent as EventListener);
      window.removeEventListener('pi:jobSaved', handleJobSaved as EventListener);
      window.removeEventListener('pi:jobPromoted', handleJobPromoted as EventListener);
      window.removeEventListener('pi:jobTaskUpdated', handleJobTaskUpdated as EventListener);
      window.removeEventListener('pi:archivedJobsList', handleArchivedJobsList as EventListener);
      window.removeEventListener('pi:error', handleError as EventListener);
    };
  }, [workspaceId, selectedJob, onGetJobs, onGetJobContent]);

  // Fetch jobs on mount / workspace change
  useEffect(() => {
    if (!workspaceId) return;
    onGetJobs(workspaceId);
  }, [workspaceId, onGetJobs]);

  // Fallback poll (PlanJobWatcher handles real-time; this is a safety net)
  useEffect(() => {
    if (!workspaceId) return;
    const interval = window.setInterval(() => {
      onGetJobs(workspaceId);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [workspaceId, onGetJobs]);

  // Handle external view mode requests (from /jobs command)
  useEffect(() => {
    if (requestedViewMode) {
      setViewMode(requestedViewMode);
      onViewModeConsumed?.();
    }
  }, [requestedViewMode, onViewModeConsumed]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenForJob(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteJob = useCallback((jobPath: string) => {
    if (!onDeleteJob) return;
    const confirmed = window.confirm('Delete this job? This cannot be undone.');
    if (confirmed) {
      onDeleteJob(jobPath);
    }
    setMenuOpenForJob(null);
  }, [onDeleteJob]);

  const handleRenameJob = useCallback((jobPath: string, currentTitle: string) => {
    if (!onRenameJob) return;
    const newTitle = window.prompt('Rename job:', currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      onRenameJob(jobPath, newTitle.trim());
    }
    setMenuOpenForJob(null);
  }, [onRenameJob]);

  const handleArchiveJob = useCallback((jobPath: string) => {
    if (!onArchiveJob) return;
    onArchiveJob(jobPath);
    setMenuOpenForJob(null);
  }, [onArchiveJob]);

  const handleUnarchiveJob = useCallback((jobPath: string) => {
    if (!onUnarchiveJob) return;
    onUnarchiveJob(jobPath);
  }, [onUnarchiveJob]);

  const handleToggleArchived = useCallback(() => {
    const next = !showArchived;
    setShowArchived(next);
    if (next && onGetArchivedJobs) {
      onGetArchivedJobs();
    }
  }, [showArchived, onGetArchivedJobs]);

  const handleSelectJob = useCallback((job: JobInfo) => {
    setSelectedJob(job);
    setViewMode('detail');
    onGetJobContent(job.path, workspaceId);
  }, [onGetJobContent, workspaceId]);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedJob(null);
  }, []);

  const handleToggleTask = useCallback((task: JobTask) => {
    if (!selectedJob) return;
    onUpdateJobTask(selectedJob.path, task.line, !task.done);
  }, [selectedJob, onUpdateJobTask]);

  // Autosave for editor mode
  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value);
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (selectedJob && value !== lastSavedContentRef.current) {
      autosaveTimerRef.current = window.setTimeout(() => {
        onSaveJob(selectedJob.path, value);
        lastSavedContentRef.current = value;
      }, AUTOSAVE_DELAY_MS);
    }
  }, [selectedJob, onSaveJob]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const handleApplyTemplate = useCallback((template: JobTemplate) => {
    if (template.id === 'blank') {
      setNewDescription('');
      setNewTags('');
      return;
    }
    setNewDescription(template.description);
    // Only set tags if the user hasn't typed any
    if (!newTags.trim()) {
      setNewTags(template.tags);
    }
  }, [newTags]);

  const handleCreateJob = useCallback(() => {
    if (!newTitle.trim()) return;

    const tags = parseTagInput(newTags);
    onCreateJob(newTitle.trim(), newDescription.trim(), tags);

    setNewTitle('');
    setNewDescription('');
    setNewTags('');
    setViewMode('list');
  }, [newTitle, newDescription, newTags, onCreateJob]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const sortedJobs = useMemo(() => sortJobs(jobs, sortMode), [jobs, sortMode]);

  const filteredJobs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return sortedJobs;
    return sortedJobs.filter(job =>
      job.title.toLowerCase().includes(q) ||
      job.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }, [sortedJobs, filterText]);

  const groupedSections = useMemo<JobListSection[]>(() => {
    if (groupMode === 'none') {
      return [{ id: 'all', label: 'All Jobs', jobs: filteredJobs, kind: 'all' }];
    }

    if (groupMode === 'tag') {
      const groups = new Map<string, { label: string; jobs: JobInfo[] }>();
      const untagged: JobInfo[] = [];

      for (const job of filteredJobs) {
        if (job.tags.length === 0) {
          untagged.push(job);
          continue;
        }

        for (const tag of job.tags) {
          const key = tag.toLowerCase();
          const group = groups.get(key);
          if (group) {
            group.jobs.push(job);
            continue;
          }

          groups.set(key, { label: tag, jobs: [job] });
        }
      }

      const sections: JobListSection[] = Array.from(groups.entries())
        .sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { sensitivity: 'base' }))
        .map(([key, group]) => ({
          id: `tag:${key}`,
          label: `#${group.label}`,
          jobs: group.jobs,
          kind: 'tag',
        }));

      if (untagged.length > 0) {
        sections.push({
          id: 'tag:untagged',
          label: 'Untagged',
          jobs: untagged,
          kind: 'tag',
        });
      }

      return sections;
    }

    const groups: Record<JobPhase, JobInfo[]> = {
      executing: [],
      planning: [],
      review: [],
      ready: [],
      backlog: [],
      complete: [],
    };

    for (const job of filteredJobs) {
      groups[job.phase].push(job);
    }

    return JOB_PHASE_ORDER.map((phase) => ({
      id: `phase:${phase}`,
      label: PHASE_LABELS[phase],
      jobs: groups[phase],
      kind: 'phase',
      phase,
    }));
  }, [filteredJobs, groupMode]);

  // ===== CREATE VIEW =====
  if (viewMode === 'create') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-pi-border">
          <button
            onClick={() => setViewMode('list')}
            className="p-1 text-pi-muted hover:text-pi-text rounded transition-colors"
          >
            <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
          <span className="text-[13px] sm:text-[12px] text-pi-text font-medium flex-1">New Job</span>
          <button
            onClick={handleCreateJob}
            disabled={!newTitle.trim()}
            className="px-3 py-1.5 rounded bg-pi-accent text-white hover:bg-pi-accent/80 transition-colors text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
        <div className="flex-1 flex flex-col p-3 space-y-3 min-h-0">
          {/* Template selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-pi-muted">Template:</span>
            {JOB_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => handleApplyTemplate(tpl)}
                className="px-2 py-0.5 text-[11px] rounded border border-pi-border text-pi-muted hover:text-pi-text hover:border-pi-accent transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[12px] sm:text-[11px] text-pi-muted mb-1">Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-pi-bg border border-pi-border rounded px-2.5 py-1.5 text-[13px] sm:text-[12px] text-pi-text placeholder-pi-muted/50 focus:outline-none focus:border-pi-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && newTitle.trim()) {
                  handleCreateJob();
                }
              }}
            />
          </div>
          <div>
            <label className="block text-[12px] sm:text-[11px] text-pi-muted mb-1">Tags</label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="frontend, bugfix, perf"
              className="w-full bg-pi-bg border border-pi-border rounded px-2.5 py-1.5 text-[13px] sm:text-[12px] text-pi-text placeholder-pi-muted/50 focus:outline-none focus:border-pi-accent"
            />
            <div className="mt-1 text-[11px] sm:text-[10px] text-pi-muted/70">Comma-separated</div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <label className="block text-[12px] sm:text-[11px] text-pi-muted mb-1">Description</label>
            <div className="flex-1 min-h-0">
              <CodeMirrorEditor value={newDescription} onChange={setNewDescription} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== LIST VIEW =====
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-pi-border bg-pi-surface/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-md bg-pi-accent text-white hover:bg-pi-accent/80 transition-colors text-[12px] sm:text-[11px] font-medium shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Job
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-pi-muted">Sort</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as JobSortMode)}
                className="px-2 py-1 text-[11px] bg-pi-bg border border-pi-border rounded text-pi-text"
                aria-label="Sort jobs"
              >
                <option value="updated-desc">Updated (newest)</option>
                <option value="updated-asc">Updated (oldest)</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-pi-muted">Group</label>
              <select
                value={groupMode}
                onChange={(e) => setGroupMode(e.target.value as JobGroupMode)}
                className="px-2 py-1 text-[11px] bg-pi-bg border border-pi-border rounded text-pi-text"
                aria-label="Group jobs"
              >
                <option value="phase">Phase</option>
                <option value="tag">Tag</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-pi-muted pointer-events-none" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter..."
                className="w-[120px] pl-6 pr-2 py-1 text-[11px] bg-pi-bg border border-pi-border rounded text-pi-text placeholder-pi-muted/50 focus:outline-none focus:border-pi-accent"
                aria-label="Filter jobs by title or tag"
              />
            </div>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-pi-muted px-4">
            <ClipboardList className="w-8 h-8 mb-2 opacity-30" />
            {jobs.length === 0 ? (
              <>
                <div className="text-[14px] sm:text-[12px] text-center">No jobs yet</div>
                <div className="text-[12px] sm:text-[11px] mt-1 opacity-70 text-center">
                  Create a job to get started
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] sm:text-[12px] text-center">No matching jobs</div>
                <button
                  onClick={() => setFilterText('')}
                  className="text-[12px] sm:text-[11px] mt-1 text-pi-accent hover:underline"
                >
                  Clear filter
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {groupedSections.map((section) => {
              if (section.jobs.length === 0) return null;

              const isCollapsible = section.kind !== 'all';
              const isCollapsed = isCollapsible && collapsedSections.has(section.id);

              return (
                <div key={section.id}>
                  {isCollapsible && (
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3 text-pi-muted/50 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-pi-muted/50 flex-shrink-0" />
                      )}
                      <span className="text-[10px] uppercase tracking-wider text-pi-muted/60 font-medium">
                        {section.label}
                      </span>
                      <span className="text-[10px] text-pi-muted/40">
                        {section.jobs.length}
                      </span>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div>
                      {section.jobs.map((job) => {
                        const isMenuOpen = menuOpenForJob === job.path;
                        const pc = PHASE_COLORS[job.phase];
                        return (
                          <div
                            key={job.path}
                            className="group flex items-start gap-2.5 px-3 py-2 hover:bg-pi-surface/30 transition-colors"
                          >
                            {/* Phase dot */}
                            <div className={`w-2 h-2 rounded-full mt-[5px] flex-shrink-0 ${pc.bg}`} title={PHASE_LABELS[job.phase]} />

                            <button
                              onClick={() => handleSelectJob(job)}
                              className="flex-1 text-left min-w-0"
                            >
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className="text-[13px] sm:text-[12px] text-pi-text truncate">
                                  {job.title}
                                </span>
                                {job.taskCount > 0 && (
                                  <span className="text-[10px] text-pi-muted/50 flex-shrink-0 tabular-nums">
                                    {job.doneCount}/{job.taskCount}
                                  </span>
                                )}
                              </div>
                              {job.tags.length > 0 && (
                                <div className="text-[10px] text-pi-muted/40 mt-0.5 truncate">
                                  {job.tags.join(' · ')}
                                </div>
                              )}
                            </button>

                            <div className="relative flex-shrink-0" ref={isMenuOpen ? menuRef : undefined}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenForJob(isMenuOpen ? null : job.path);
                                }}
                                className="p-1 text-pi-muted/30 hover:text-pi-text rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="More actions"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                              {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 z-10 min-w-[120px] bg-pi-surface border border-pi-border rounded shadow-lg">
                                  {onRenameJob && (
                                    <button
                                      onClick={() => handleRenameJob(job.path, job.title)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-pi-text hover:bg-pi-bg transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Rename
                                    </button>
                                  )}
                                  {onArchiveJob && (
                                    <button
                                      onClick={() => handleArchiveJob(job.path)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-pi-text hover:bg-pi-bg transition-colors"
                                    >
                                      <Archive className="w-3.5 h-3.5" />
                                      Archive
                                    </button>
                                  )}
                                  {onDeleteJob && (
                                    <button
                                      onClick={() => handleDeleteJob(job.path)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}

        {/* Archived — pinned to bottom */}
        {onArchiveJob && (
          <div className="border-t border-pi-border/30 px-3">
            {!showArchived ? (
              <button
                onClick={handleToggleArchived}
                className="w-full py-2 text-[10px] text-pi-muted/40 hover:text-pi-muted transition-colors text-left"
              >
                {archivedJobs.length > 0
                  ? `${archivedJobs.length} archived`
                  : 'View archived'}
              </button>
            ) : (
              <div className="py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-pi-muted/40 font-medium">Archived</span>
                  <button
                    onClick={handleToggleArchived}
                    className="text-pi-muted/40 hover:text-pi-muted transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {archivedJobs.length === 0 ? (
                    <div className="py-1 text-[11px] text-pi-muted/30">No archived jobs</div>
                  ) : (
                    archivedJobs.map((job) => (
                      <div
                        key={job.path}
                        className="group flex items-center gap-2 py-1.5"
                      >
                        <span className="text-[11px] text-pi-muted/50 truncate flex-1">{job.title}</span>
                        <button
                          onClick={() => handleUnarchiveJob(job.path)}
                          className="text-[10px] text-pi-muted/30 hover:text-pi-text transition-colors opacity-0 group-hover:opacity-100"
                          title="Unarchive"
                        >
                          <ArchiveRestore className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ===== DETAIL / EDITOR VIEW =====
  const promoteLabel = selectedJob ? getPromoteLabel(selectedJob.phase) : null;
  const demoteLabel = selectedJob ? getDemoteLabel(selectedJob.phase) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-pi-border">
        <button
          onClick={handleBackToList}
          className="p-1 text-pi-muted hover:text-pi-text rounded transition-colors"
          title="Back to jobs"
        >
          <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
        <span className="text-[13px] sm:text-[12px] text-pi-text truncate flex-1">
          {selectedJob?.title}
        </span>
        {selectedJob && <PhaseBadge phase={selectedJob.phase} />}
      </div>

      {selectedJob && selectedJob.tags.length > 0 && (
        <div className="px-3 py-1.5 border-b border-pi-border/60 flex flex-wrap gap-1.5">
          {selectedJob.tags.map((tag) => (
            <span
              key={`${selectedJob.path}-${tag}`}
              className="px-1.5 py-0.5 rounded bg-pi-bg border border-pi-border/70 text-[10px] text-pi-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* View mode toggle + actions */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-pi-border">
        <button
          onClick={() => setViewMode('detail')}
          className={`px-2 py-1 text-[12px] sm:text-[11px] rounded transition-colors ${
            viewMode === 'detail'
              ? 'bg-pi-bg text-pi-text'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <Check className="w-3 h-3 inline mr-1" />
          View
        </button>
        <button
          onClick={() => setViewMode('editor')}
          className={`px-2 py-1 text-[12px] sm:text-[11px] rounded transition-colors ${
            viewMode === 'editor'
              ? 'bg-pi-bg text-pi-text'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <Edit3 className="w-3 h-3 inline mr-1" />
          Edit
        </button>
        <div className="flex-1" />

        {/* Demote button */}
        {demoteLabel && (
          <button
            onClick={() => selectedJob && onDemoteJob(selectedJob.path)}
            className="flex items-center gap-1 px-2 py-1 text-[12px] sm:text-[11px] rounded bg-pi-muted/10 text-pi-muted hover:bg-pi-muted/20 transition-colors"
            title={demoteLabel}
          >
            <ArrowLeftCircle className="w-3 h-3" />
            <span className="hidden sm:inline">{demoteLabel}</span>
          </button>
        )}

        {/* Promote button */}
        {promoteLabel && (
          <button
            onClick={() => selectedJob && onPromoteJob(selectedJob.path)}
            className={`flex items-center gap-1 px-2 py-1 text-[12px] sm:text-[11px] rounded transition-colors ${
              selectedJob?.phase === 'backlog' || selectedJob?.phase === 'ready'
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : selectedJob?.phase === 'review'
                ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
            }`}
            title={promoteLabel}
          >
            {(selectedJob?.phase === 'backlog' || selectedJob?.phase === 'ready') ? (
              <Play className="w-3 h-3" />
            ) : (
              <ArrowRightCircle className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{promoteLabel}</span>
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[12px] sm:text-[11px] text-red-400 flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400/60 hover:text-red-400 text-[11px]"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'detail' ? (
          // Rich markdown view with interactive checkboxes
          <div className="h-full overflow-y-auto p-3">
            <JobMarkdownContent
              content={editorContent}
              onToggleTask={handleToggleTask}
              tasks={selectedJob?.tasks || []}
            />
          </div>
        ) : (
          // Raw editor with line numbers
          <div className="h-full p-3">
            <CodeMirrorEditor value={editorContent} onChange={handleEditorChange} />
          </div>
        )}
      </div>
    </div>
  );
}
