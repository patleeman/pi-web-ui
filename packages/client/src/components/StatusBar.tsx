interface StatusBarProps {
  cwd: string;
  gitBranch: string | null;
  gitChangedFiles: number;
  runningCount: number;
  errorCount: number;
  contextPercent?: number;
}

export function StatusBar({
  cwd,
  gitBranch,
  gitChangedFiles,
  runningCount,
  errorCount,
  contextPercent,
}: StatusBarProps) {
  return (
    <div className="h-7 flex items-center justify-between px-[14px] border-t border-pi-border text-[12px] text-pi-muted font-mono">
      {/* Left side: cwd, git branch */}
      <div className="flex items-center gap-5">
        <span className="truncate max-w-[300px]" title={cwd}>
          {cwd}
        </span>
        {gitBranch && (
          <span className="text-pi-success flex items-center gap-1">
            {gitBranch}
            {gitChangedFiles > 0 && (
              <span className="text-pi-warning">+{gitChangedFiles}</span>
            )}
          </span>
        )}
      </div>

      {/* Right side: session status summary */}
      <div className="flex items-center gap-5">
        {runningCount > 0 && (
          <span>{runningCount} running</span>
        )}
        {errorCount > 0 && (
          <span className="text-pi-error">{errorCount} error</span>
        )}
        {contextPercent !== undefined && (
          <span className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-pi-border rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${contextPercent}%`,
                  backgroundColor: `hsl(${Math.max(0, 120 - contextPercent * 1.2)}, 70%, 45%)`,
                }}
              />
            </div>
            <span>{Math.round(contextPercent)}%</span>
          </span>
        )}
      </div>
    </div>
  );
}
