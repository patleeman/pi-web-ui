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
  const statusIndicator = tool.status === 'running' ? '◐' : tool.status === 'error' ? '✗' : '✓';
  const statusColor = tool.status === 'running' ? 'text-pi-warning' : tool.status === 'error' ? 'text-pi-error' : 'text-pi-success';

  return (
    <div className="font-mono text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-pi-muted">$</span>
        <span className={`${statusColor} ${tool.status === 'running' ? 'animate-pulse' : ''}`}>
          [{statusIndicator} {tool.toolName}]
        </span>
        <span className="text-pi-muted">{formatArgs(tool.toolName, tool.args)}</span>
      </div>

      {/* Streaming output */}
      {tool.result && (
        <div className="pl-4 border-l border-pi-border mt-0.5">
          <pre
            className={`text-xs whitespace-pre-wrap max-h-32 overflow-y-auto ${
              tool.isError ? 'text-pi-error' : 'text-pi-text'
            }`}
          >
            {tool.result}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash':
      return `$ ${args.command}`;
    case 'read':
      return `${args.path}`;
    case 'write':
      return `${args.path}`;
    case 'edit':
      return `${args.path}`;
    default:
      return JSON.stringify(args);
  }
}
