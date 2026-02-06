import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardList, Square, PartyPopper } from 'lucide-react';
import type { ActivePlanState } from '@pi-web-ui/shared';

interface ActivePlanBannerProps {
  activePlan: ActivePlanState;
  onToggleTask: (planPath: string, line: number, done: boolean) => void;
  onDeactivate: () => void;
}

export function ActivePlanBanner({ activePlan, onToggleTask, onDeactivate }: ActivePlanBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const prevDoneCountRef = useRef(activePlan.doneCount);

  const { title, tasks, taskCount, doneCount, planPath } = activePlan;
  const progressPercent = taskCount > 0 ? (doneCount / taskCount) * 100 : 0;

  // Show brief completion animation when all tasks are done
  useEffect(() => {
    if (doneCount === taskCount && taskCount > 0 && prevDoneCountRef.current < taskCount) {
      setShowComplete(true);
      const timer = setTimeout(() => setShowComplete(false), 3000);
      return () => clearTimeout(timer);
    }
    prevDoneCountRef.current = doneCount;
  }, [doneCount, taskCount]);

  return (
    <div className="border-t border-pi-border bg-pi-surface/50">
      {/* Completion celebration */}
      {showComplete && (
        <div className="px-3 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2 animate-pulse">
          <PartyPopper className="w-4 h-4 text-green-400" />
          <span className="text-[12px] sm:text-[11px] text-green-400 font-medium">All tasks complete! Plan finished.</span>
        </div>
      )}
      {/* Compact header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-pi-bg/50 transition-colors"
      >
        <ClipboardList className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
        <span className="text-[12px] sm:text-[11px] text-pi-text truncate flex-1">{title}</span>
        <span className="text-[11px] text-pi-muted flex-shrink-0">{doneCount}/{taskCount}</span>
        <div className="w-16 h-1 bg-pi-border/30 rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-green-500/60 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-pi-muted flex-shrink-0" />
        ) : (
          <ChevronUp className="w-3 h-3 text-pi-muted flex-shrink-0" />
        )}
      </button>

      {/* Expandable task list */}
      {expanded && (
        <div className="border-t border-pi-border/50 max-h-48 sm:max-h-48 max-h-64 overflow-y-auto">
          {tasks.map((task, i) => (
            <button
              key={`${task.line}-${i}`}
              onClick={() => onToggleTask(planPath, task.line, !task.done)}
              className="w-full text-left px-3 py-1.5 sm:py-1 flex items-center gap-2 hover:bg-pi-bg/50 transition-colors active:bg-pi-bg/70"
              style={{ paddingLeft: `${task.depth * 12 + 12}px` }}
            >
              <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                task.done
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'border-pi-border hover:border-pi-accent'
              }`}>
                {task.done && <Check className="w-2.5 h-2.5" />}
              </span>
              <span className={`text-[12px] sm:text-[11px] truncate ${
                task.done ? 'text-pi-muted line-through' : 'text-pi-text'
              }`}>
                {task.text}
              </span>
            </button>
          ))}
          <div className="flex items-center justify-end px-3 py-1.5 border-t border-pi-border/50">
            <button
              onClick={onDeactivate}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Square className="w-3 h-3" />
              Deactivate Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
