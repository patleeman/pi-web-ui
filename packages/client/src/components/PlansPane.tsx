import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList,
  Play,
  Square,
  Check,
  Edit3,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import type { PlanInfo, PlanTask, ActivePlanState } from '@pi-web-ui/shared';

interface PlansPaneProps {
  workspaceId: string;
  activePlan: ActivePlanState | null;
  onGetPlans: () => void;
  onGetPlanContent: (planPath: string) => void;
  onSavePlan: (planPath: string, content: string) => void;
  onActivatePlan: (planPath: string) => void;
  onDeactivatePlan: () => void;
  onUpdatePlanTask: (planPath: string, line: number, done: boolean) => void;
}

type ViewMode = 'list' | 'structured' | 'editor';

const AUTOSAVE_DELAY_MS = 500;

export function PlansPane({
  workspaceId,
  activePlan,
  onGetPlans,
  onGetPlanContent,
  onSavePlan,
  onActivatePlan,
  onDeactivatePlan,
  onUpdatePlanTask,
}: PlansPaneProps) {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editorContent, setEditorContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Listen for plan events
  useEffect(() => {
    const handlePlansList = (e: CustomEvent<{ workspaceId: string; plans: PlanInfo[] }>) => {
      if (e.detail.workspaceId === workspaceId) {
        setPlans(e.detail.plans);
      }
    };

    const handlePlanContent = (e: CustomEvent<{ workspaceId: string; planPath: string; content: string; plan: PlanInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        setEditorContent(e.detail.content);
        lastSavedContentRef.current = e.detail.content;
        setSelectedPlan(e.detail.plan);
        setError(null);
      }
    };

    const handleError = (e: CustomEvent<{ message: string; workspaceId?: string }>) => {
      if (e.detail.workspaceId === workspaceId && e.detail.message.includes('plan')) {
        setError(e.detail.message);
      }
    };

    const handlePlanSaved = (e: CustomEvent<{ workspaceId: string; planPath: string; plan: PlanInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        // Update the selected plan with new parsed info
        if (selectedPlan?.path === e.detail.planPath) {
          setSelectedPlan(e.detail.plan);
        }
        // Refresh plans list
        onGetPlans();
      }
    };

    const handlePlanTaskUpdated = (e: CustomEvent<{ workspaceId: string; planPath: string; plan: PlanInfo }>) => {
      if (e.detail.workspaceId === workspaceId) {
        if (selectedPlan?.path === e.detail.planPath) {
          setSelectedPlan(e.detail.plan);
          // Re-fetch content to keep editor in sync
          onGetPlanContent(e.detail.planPath);
        }
        onGetPlans();
      }
    };

    window.addEventListener('pi:plansList', handlePlansList as EventListener);
    window.addEventListener('pi:planContent', handlePlanContent as EventListener);
    window.addEventListener('pi:planSaved', handlePlanSaved as EventListener);
    window.addEventListener('pi:planTaskUpdated', handlePlanTaskUpdated as EventListener);
    window.addEventListener('pi:error', handleError as EventListener);

    return () => {
      window.removeEventListener('pi:plansList', handlePlansList as EventListener);
      window.removeEventListener('pi:planContent', handlePlanContent as EventListener);
      window.removeEventListener('pi:planSaved', handlePlanSaved as EventListener);
      window.removeEventListener('pi:planTaskUpdated', handlePlanTaskUpdated as EventListener);
      window.removeEventListener('pi:error', handleError as EventListener);
    };
  }, [workspaceId, selectedPlan, onGetPlans, onGetPlanContent]);

  // Fetch plans on mount / workspace change
  useEffect(() => {
    onGetPlans();
  }, [workspaceId, onGetPlans]);

  // Fallback poll for plan list (picks up new/deleted plan files)
  // Active plan content is pushed by the server via 3s file polling
  useEffect(() => {
    const interval = window.setInterval(() => {
      onGetPlans();
    }, 10000); // 10s — just a fallback, server pushes active plan changes at 3s
    return () => window.clearInterval(interval);
  }, [onGetPlans]);

  const handleSelectPlan = useCallback((plan: PlanInfo) => {
    setSelectedPlan(plan);
    setViewMode('structured');
    onGetPlanContent(plan.path);
  }, [onGetPlanContent]);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedPlan(null);
  }, []);

  const handleToggleTask = useCallback((task: PlanTask) => {
    if (!selectedPlan) return;
    onUpdatePlanTask(selectedPlan.path, task.line, !task.done);
  }, [selectedPlan, onUpdatePlanTask]);

  // Autosave for editor mode
  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value);
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (selectedPlan && value !== lastSavedContentRef.current) {
      autosaveTimerRef.current = window.setTimeout(() => {
        onSavePlan(selectedPlan.path, value);
        lastSavedContentRef.current = value;
      }, AUTOSAVE_DELAY_MS);
    }
  }, [selectedPlan, onSavePlan]);

  // Cleanup autosave timer
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const handleActivate = useCallback((planPath: string) => {
    onActivatePlan(planPath);
  }, [onActivatePlan]);

  const handleDeactivate = useCallback(() => {
    onDeactivatePlan();
  }, [onDeactivatePlan]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/20 text-green-400">Active</span>;
      case 'complete':
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pi-muted/20 text-pi-muted">Complete</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-500/20 text-sky-400">Draft</span>;
    }
  };

  // ===== LIST VIEW =====
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col h-full">
        {plans.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-pi-muted px-4">
            <ClipboardList className="w-8 h-8 mb-2 opacity-30" />
            <div className="text-[14px] sm:text-[12px] text-center">No plans found</div>
            <div className="text-[12px] sm:text-[11px] mt-1 opacity-70 text-center">
              Use <code className="bg-pi-bg px-1 rounded">/plan</code> in a conversation to create one
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-1">
            {plans.map((plan) => {
              const isActivePlan = activePlan?.planPath === plan.path;
              return (
                <button
                  key={plan.path}
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full text-left px-3 py-2.5 sm:py-2 transition-colors hover:bg-pi-bg border-b border-pi-border/50 ${
                    isActivePlan ? 'bg-green-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] sm:text-[13px] text-pi-text truncate flex-1">
                      {plan.title}
                    </span>
                    {statusBadge(plan.status)}
                  </div>
                  {plan.taskCount > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-pi-border/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500/60 rounded-full transition-all"
                          style={{ width: `${(plan.doneCount / plan.taskCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-pi-muted flex-shrink-0">
                        {plan.doneCount}/{plan.taskCount}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ===== STRUCTURED / EDITOR VIEW =====
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-pi-border">
        <button
          onClick={handleBackToList}
          className="p-1 text-pi-muted hover:text-pi-text rounded transition-colors"
          title="Back to plans"
        >
          <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
        <span className="text-[13px] sm:text-[12px] text-pi-text truncate flex-1">
          {selectedPlan?.title}
        </span>
        {selectedPlan && statusBadge(selectedPlan.status)}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-pi-border">
        <button
          onClick={() => setViewMode('structured')}
          className={`px-2 py-1 text-[12px] sm:text-[11px] rounded transition-colors ${
            viewMode === 'structured'
              ? 'bg-pi-bg text-pi-text'
              : 'text-pi-muted hover:text-pi-text'
          }`}
        >
          <Check className="w-3 h-3 inline mr-1" />
          Tasks
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
        {/* Activate / Deactivate button */}
        {selectedPlan && activePlan?.planPath === selectedPlan.path ? (
          <button
            onClick={handleDeactivate}
            className="flex items-center gap-1 px-2 py-1 text-[12px] sm:text-[11px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            title="Deactivate plan"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        ) : selectedPlan && selectedPlan.status !== 'complete' ? (
          <button
            onClick={() => handleActivate(selectedPlan.path)}
            className="flex items-center gap-1 px-2 py-1 text-[12px] sm:text-[11px] rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
            title="Activate plan and start new conversation"
          >
            <Play className="w-3 h-3" />
            Run
          </button>
        ) : selectedPlan && selectedPlan.status === 'complete' ? (
          <button
            onClick={() => handleActivate(selectedPlan.path)}
            className="flex items-center gap-1 px-2 py-1 text-[12px] sm:text-[11px] rounded bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors"
            title="Reactivate completed plan"
          >
            <Play className="w-3 h-3" />
            Rerun
          </button>
        ) : null}
      </div>

      {/* Progress bar */}
      {selectedPlan && selectedPlan.taskCount > 0 && (
        <div className="px-3 py-2 border-b border-pi-border/50">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-pi-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500/60 rounded-full transition-all"
                style={{ width: `${(selectedPlan.doneCount / selectedPlan.taskCount) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-pi-muted flex-shrink-0">
              {selectedPlan.doneCount}/{selectedPlan.taskCount}
            </span>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[12px] sm:text-[11px] text-red-400 flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400/60 hover:text-red-400 text-[11px]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'structured' ? (
          // Structured task view
          <div className="py-1">
            {selectedPlan?.tasks.map((task, i) => (
              <button
                key={`${task.line}-${i}`}
                onClick={() => handleToggleTask(task)}
                className="w-full text-left px-3 py-2 sm:py-1.5 flex items-start gap-2 hover:bg-pi-bg transition-colors"
                style={{ paddingLeft: `${task.depth * 16 + 12}px` }}
              >
                <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  task.done
                    ? 'bg-green-500/20 border-green-500/40 text-green-400'
                    : 'border-pi-border hover:border-pi-accent'
                }`}>
                  {task.done && <Check className="w-3 h-3" />}
                </span>
                <span className={`text-[13px] sm:text-[12px] ${
                  task.done ? 'text-pi-muted line-through' : 'text-pi-text'
                }`}>
                  {task.text}
                </span>
              </button>
            ))}
            {selectedPlan?.tasks.length === 0 && (
              <div className="px-3 py-4 text-[13px] sm:text-[12px] text-pi-muted text-center">
                No tasks found. Tasks use <code className="bg-pi-bg px-1 rounded">- [ ]</code> format.
              </div>
            )}
          </div>
        ) : (
          // Editor view
          <textarea
            value={editorContent}
            onChange={(e) => handleEditorChange(e.target.value)}
            className="w-full h-full bg-transparent text-pi-text text-[13px] sm:text-[12px] font-mono p-3 resize-none focus:outline-none leading-relaxed"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
