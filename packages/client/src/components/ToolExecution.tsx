import { Terminal, Loader2, Check, X } from 'lucide-react';

interface ToolExecutionProps {
  tool: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'running' | 'complete' | 'error';
    result?: string;
    isError?: boolean;
  };
}

export function ToolExecution({ tool }: ToolExecutionProps) {
  return (
    <div className="flex gap-3">
      {/* Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-pi-surface border border-pi-border flex items-center justify-center">
        <Terminal className="w-4 h-4 text-pi-accent" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg bg-pi-surface border border-pi-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-pi-border">
            <span className="font-medium text-sm text-pi-text">{tool.toolName}</span>
            <StatusBadge status={tool.status} />
          </div>

          {/* Arguments preview */}
          <div className="px-3 py-2 text-xs text-pi-muted font-mono">
            {formatArgs(tool.toolName, tool.args)}
          </div>

          {/* Streaming output */}
          {tool.result && (
            <div className="border-t border-pi-border px-3 py-2 max-h-48 overflow-y-auto">
              <pre
                className={`text-xs font-mono whitespace-pre-wrap ${
                  tool.isError ? 'text-pi-error' : 'text-pi-text'
                }`}
              >
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'running' | 'complete' | 'error' }) {
  switch (status) {
    case 'running':
      return (
        <span className="flex items-center gap-1 text-xs text-pi-warning">
          <Loader2 className="w-3 h-3 animate-spin" />
          running
        </span>
      );
    case 'complete':
      return (
        <span className="flex items-center gap-1 text-xs text-pi-success">
          <Check className="w-3 h-3" />
          complete
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-pi-error">
          <X className="w-3 h-3" />
          error
        </span>
      );
  }
}

function formatArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash':
      return `$ ${args.command}`;
    case 'read':
      return `reading ${args.path}`;
    case 'write':
      return `writing ${args.path}`;
    case 'edit':
      return `editing ${args.path}`;
    default:
      return JSON.stringify(args);
  }
}
