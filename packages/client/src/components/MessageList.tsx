import { lazy, Suspense, useState, useMemo, memo } from 'react';
import type { ChatMessage, MessageContent } from '@pi-web-ui/shared';
import { useIsMobile } from '../hooks/useIsMobile';
import { DiffDisplay } from './DiffDisplay';



// Lazy load markdown for code splitting
const MarkdownContent = lazy(() => import('./MarkdownContent').then(m => ({ default: m.MarkdownContent })));

interface MessageListProps {
  keyPrefix: string;
  messages: ChatMessage[];
  streamingText: string;
  streamingThinking: string;
  isStreaming: boolean;
  activeToolExecutions: ToolExecution[];
}

interface ToolExecution {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
}

interface BashExecution {
  command: string;
  output: string;
  isRunning: boolean;
  exitCode?: number | null;
  isError?: boolean;
  excludeFromContext: boolean;
}

// Extract text from message content
function getTextContent(content: MessageContent[]): string {
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('');
}

// Get tool calls from message content
function getToolCalls(content: MessageContent[]): Array<{
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
}> {
  return content
    .filter((c) => c.type === 'toolCall')
    .map(c => {
      const tc = c as { 
        type: 'toolCall'; 
        id: string; 
        name: string; 
        arguments?: Record<string, unknown>;  // Note: shared types use 'arguments'
        status: 'pending' | 'running' | 'complete' | 'error';
        result?: string;
        isError?: boolean;
      };
      return { 
        id: tc.id, 
        name: tc.name, 
        args: tc.arguments,  // Map 'arguments' to 'args'
        status: tc.status,
        result: tc.result,
        isError: tc.isError,
      };
    });
}

// Get thinking content from message
function getThinkingContent(content: MessageContent[]): string[] {
  return content
    .filter((c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking')
    .map(c => c.thinking);
}

// Check if text contains markdown that needs rendering
function hasMarkdown(text: string): boolean {
  return /```|`[^`]+`|\*\*|__|##|\[.+\]\(.+\)|^\s*[-*]\s/m.test(text);
}

// Simple text renderer (no markdown)
function PlainText({ content }: { content: string }) {
  return (
    <div className="text-pi-text text-[14px] leading-relaxed whitespace-pre-wrap">
      {content}
    </div>
  );
}

// Thinking block component - TUI style: italic muted text
const ThinkingBlockMemo = memo(function ThinkingBlock({ thinking, isStreaming }: { thinking: string; defaultCollapsed?: boolean; isStreaming?: boolean }) {
  return (
    <div className="text-[14px] text-pi-muted/70 italic leading-relaxed whitespace-pre-wrap">
      {thinking}
      {isStreaming && <span className="cursor-blink text-pi-accent not-italic">▌</span>}
    </div>
  );
});

// Parse args - handle both object and JSON string formats
function parseArgs(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  if (typeof args === 'object') {
    return args as Record<string, unknown>;
  }
  return {};
}

// Format tool call header in TUI style: "$ command", "read path", "edit path:line", "write path"
function formatToolHeader(name: string, rawArgs?: unknown): { prefix: string; detail: string } {
  const args = parseArgs(rawArgs);
  if (Object.keys(args).length === 0) return { prefix: name.toLowerCase(), detail: '' };
  
  const toolName = name.toLowerCase();
  
  switch (toolName) {
    case 'bash': {
      const cmd = String(args.command || '');
      return { prefix: '$', detail: cmd };
    }
    case 'read': {
      const path = String(args.path || '');
      const offset = args.offset ? `:${args.offset}` : '';
      const limit = args.limit ? `-${Number(args.offset || 1) + Number(args.limit)}` : '';
      return { prefix: 'read', detail: `${path}${offset}${limit}` };
    }
    case 'write': {
      const path = String(args.path || '');
      return { prefix: 'write', detail: path };
    }
    case 'edit': {
      const path = String(args.path || '');
      return { prefix: 'edit', detail: path };
    }
    case 'web_search': {
      const query = String(args.query || '');
      return { prefix: 'search', detail: query };
    }
    case 'web_fetch': {
      const url = String(args.url || '');
      return { prefix: 'fetch', detail: url };
    }
    case 'questionnaire': {
      return { prefix: 'ask', detail: '' };
    }
    default: {
      // For unknown tools, format args as key=value pairs
      const parts: string[] = [];
      for (const [key, value] of Object.entries(args)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string') {
          // Truncate long strings
          const truncated = value.length > 50 ? value.slice(0, 47) + '...' : value;
          parts.push(`${key}=${truncated}`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          parts.push(`${key}=${value}`);
        } else {
          // For objects/arrays, show type indicator
          parts.push(`${key}=[${Array.isArray(value) ? 'array' : 'object'}]`);
        }
      }
      return { prefix: toolName, detail: parts.join(' ') };
    }
  }
}

// Count lines and provide preview/full text
function getOutputInfo(result: string, previewLineCount: number = 15): { 
  lineCount: number; 
  hasMore: boolean; 
  previewText: string; 
  fullText: string;
  previewLineCount: number;
} {
  const lines = result.split('\n');
  const lineCount = lines.length;
  
  // Preview shows first N lines (3 on mobile, 15 on desktop)
  const hasMore = lineCount > previewLineCount;
  const previewText = lines.slice(0, previewLineCount).join('\n');
  
  // Full text shows up to 100 lines
  const maxLines = 100;
  const fullText = lines.slice(0, maxLines).join('\n');
  
  return { lineCount, hasMore, previewText, fullText, previewLineCount };
}



// Render read output with line numbers
const ReadDisplayMemo = memo(function ReadDisplay({ content, startLine = 1 }: { content: string; startLine?: number }) {
  const lines = content.split('\n');
  const lineNumWidth = String(startLine + lines.length - 1).length;

  return (
    <div className="text-[12px] font-mono text-pi-muted">
      {lines.map((line, i) => {
        const lineNum = startLine + i;
        return (
          <div key={i} className="flex">
            <span className="text-pi-muted/40 select-none mr-3 text-right" style={{ minWidth: `${lineNumWidth}ch` }}>
              {lineNum}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all">{line}</span>
          </div>
        );
      })}
    </div>
  );
});

// Simple content display without line numbers (for write tool)
const WriteDisplayMemo = memo(function WriteDisplay({ content }: { content: string }) {
  return (
    <div className="text-[12px] font-mono text-pi-muted whitespace-pre-wrap">
      {content}
    </div>
  );
});

// TUI-style tool call display - matches terminal UI exactly
const ToolCallDisplayMemo = memo(function ToolCallDisplay({
  tool,
  previewLines = 5,
}: {
  tool: {
    id: string;
    name: string;
    args?: Record<string, unknown>;
    status: 'pending' | 'running' | 'complete' | 'error';
    result?: string;
    isError?: boolean;
  };
  previewLines?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isMobile = useIsMobile();
  const showPulse = !isMobile;
  const headerInfo = formatToolHeader(tool.name, tool.args);
  const prefix: string = headerInfo.prefix;
  const detail: string = headerInfo.detail;
  const args = parseArgs(tool.args);
  
  const hasResult = tool.result && tool.result.length > 0;
  const outputInfo = hasResult ? getOutputInfo(tool.result!, previewLines) : null;
  
  // Check tool type for specialized rendering
  const toolName = tool.name.toLowerCase();
  const isEditTool = toolName === 'edit';
  const isReadTool = toolName === 'read';
  const isWriteTool = toolName === 'write';
  const hasEditDiff = isEditTool && Boolean(args.oldText) && Boolean(args.newText);
  const hasWriteContent = isWriteTool && Boolean(args.content);
  
  // Get start line for read display
  const readStartLine = isReadTool && args.offset ? Number(args.offset) : 1;

  return (
    <div className="font-mono text-[13px] -mx-4 bg-[#283a28] border-l-2 border-[#b5bd68]">
      {/* Tool header - like TUI: "$ command" or "read path" */}
      <div 
        className="px-4 py-3 flex items-start gap-2 cursor-pointer hover:bg-[#2a3f2a]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[#fff200] font-semibold flex-shrink-0">{prefix}</span>
        <span className="text-[#00d7ff] whitespace-pre-wrap break-all flex-1">{detail}</span>
        {tool.status === 'running' && showPulse && (
          <span className="text-pi-warning text-[11px] flex-shrink-0 animate-pulse">(running)</span>
        )}
      </div>
      
      {/* Write tool content - plain text, no line numbers */}
      {hasWriteContent && expanded && (
        <div className="px-4 pb-3">
          <WriteDisplayMemo content={String(args.content)} />
        </div>
      )}
      
      {/* Edit diff display - from args */}
      {hasEditDiff && expanded && (
        <div className="px-4 pb-3">
          <DiffDisplay 
            oldText={String(args.oldText)} 
            newText={String(args.newText)} 
          />
        </div>
      )}
      
      {/* Read tool output - with line numbers, no scrollbar */}
      {hasResult && isReadTool && !hasEditDiff && expanded && (
        <div className="px-4 pb-3">
          <ReadDisplayMemo content={outputInfo!.previewText} startLine={readStartLine} />
          {outputInfo!.hasMore && (
            <div className="text-pi-muted/50 mt-2 text-[11px]">
              ... ({outputInfo!.lineCount - outputInfo!.previewLineCount} more lines)
            </div>
          )}
        </div>
      )}
      
      {/* Other tool output - with line numbers, no scrollbar (but not for write tool) */}
      {hasResult && !isReadTool && !isWriteTool && !hasEditDiff && expanded && (
        <div className={`px-4 pb-3 ${tool.isError ? 'text-pi-error' : ''}`}>
          <ReadDisplayMemo content={outputInfo!.previewText} startLine={1} />
          {outputInfo!.hasMore && (
            <div className="text-pi-muted/50 mt-2 text-[11px]">
              ... ({outputInfo!.lineCount - outputInfo!.previewLineCount} more lines)
            </div>
          )}
        </div>
      )}
      
      {/* Collapsed indicator */}
      {(hasEditDiff || hasWriteContent || hasResult) && !expanded && (
        <div className="px-4 pb-2 text-[11px] text-pi-muted">
          (click to expand)
        </div>
      )}
    </div>
  );
});

const BashExecutionDisplayMemo = memo(function BashExecutionDisplay({ execution }: { execution: BashExecution }) {
  const isMobile = useIsMobile();
  const showPulse = !isMobile;

  return (
    <div className="font-mono text-[13px] -mx-4 bg-pi-surface border-l-2 border-pi-warning">
      <div className="px-4 py-2 flex items-start gap-2">
        <span className="text-pi-warning font-semibold flex-shrink-0">$</span>
        <span className="text-pi-text whitespace-pre-wrap break-all flex-1">{execution.command}</span>
        {execution.isRunning && showPulse && (
          <span className="text-pi-warning text-[11px] flex-shrink-0 animate-pulse">(running)</span>
        )}
        {execution.excludeFromContext && !execution.isRunning && (
          <span className="text-pi-muted text-[11px] flex-shrink-0">(not sent to LLM)</span>
        )}
      </div>
      {execution.output && (
        <div className={`px-4 pb-3 text-[12px] whitespace-pre-wrap break-all ${execution.isError ? 'text-pi-error' : 'text-pi-muted'}`}>
          {execution.output}
          {execution.isRunning && showPulse && <span className="text-pi-warning animate-pulse">▌</span>}
        </div>
      )}
      {!execution.isRunning && execution.exitCode !== undefined && execution.exitCode !== null && execution.exitCode !== 0 && (
        <div className="px-4 pb-2 text-[11px] text-pi-error">
          exit code: {execution.exitCode}
        </div>
      )}
    </div>
  );
});

// User message display - distinct background like TUI (full-width, cyan/teal tinted)
const UserMessageMemo = memo(function UserMessage({ text }: { text: string }) {
  return (
    <div className="-mx-4 bg-pi-user-bg border-l-2 border-pi-accent px-4 py-3 font-mono text-[14px] text-pi-text whitespace-pre-wrap">
      {text}
    </div>
  );
});

export function MessageList({
  keyPrefix,
  messages,
  streamingText,
  streamingThinking,
  isStreaming,
  activeToolExecutions,
}: MessageListProps) {
  const isMobile = useIsMobile();
  // On mobile, show only 3 lines of tool output; on desktop, show 5
  const previewLines = isMobile ? 3 : 5;

  // Deduplicate messages by id (prevent rendering duplicates)
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter(msg => {
      if (!msg.id) return true; // keep messages without id
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
  }, [messages]);

  // Build a map of tool results by toolCallId for matching
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, { result: string; isError: boolean }>();
    for (const msg of uniqueMessages) {
      if (msg.role === 'toolResult' && msg.toolCallId) {
        const text = getTextContent(msg.content);
        map.set(msg.toolCallId, { result: text, isError: msg.isError || false });
      }
    }
    return map;
  }, [uniqueMessages]);

  return (
    <>
      {uniqueMessages.map((msg, i) => {
        const msgKey = `${keyPrefix}-${msg.id || i}`;
        
        if (msg.role === 'user') {
          const text = getTextContent(msg.content);
          return <UserMessageMemo key={msgKey} text={text} />;
        }

        if (msg.role === 'bashExecution') {
          const exitCode = msg.exitCode ?? null;
          const cancelled = msg.cancelled === true;
          const isRunning = msg.exitCode === null && !cancelled;
          const isError = msg.isError ?? ((exitCode !== null && exitCode !== 0) || cancelled);
          return (
            <BashExecutionDisplayMemo
              key={msgKey}
              execution={{
                command: msg.command || '',
                output: msg.output || '',
                isRunning,
                exitCode,
                isError,
                excludeFromContext: msg.excludeFromContext || false,
              }}
            />
          );
        }

        if (msg.role === 'assistant') {
          const text = getTextContent(msg.content);
          const tools = getToolCalls(msg.content);
          const thinkingBlocks = getThinkingContent(msg.content);
          const needsMarkdown = hasMarkdown(text);
          
          // Merge tool results from separate toolResult messages
          const toolsWithResults = tools.map(tool => {
            const resultMsg = toolResultsMap.get(tool.id);
            if (resultMsg && !tool.result) {
              return { ...tool, result: resultMsg.result, isError: resultMsg.isError };
            }
            return tool;
          });
          
          return (
            <div key={msgKey} className="flex flex-col gap-4">
              {/* Thinking blocks */}
              {thinkingBlocks.map((thinking, idx) => (
                <ThinkingBlockMemo
                  key={`${msgKey}-thinking-${idx}`}
                  thinking={thinking}
                />
              ))}
              
              {/* Tool calls - TUI style with background */}
              {toolsWithResults.map((tool) => (
                <ToolCallDisplayMemo 
                  key={`${msgKey}-tool-${tool.id}`} 
                  tool={tool}
                  previewLines={previewLines}
                />
              ))}
              
              {/* Agent text response - plain, no background */}
              {text && (
                <div>
                  {needsMarkdown ? (
                    <Suspense fallback={<PlainText content={text} />}>
                      <MarkdownContent content={text} />
                    </Suspense>
                  ) : (
                    <PlainText content={text} />
                  )}
                </div>
              )}
            </div>
          );
        }

        // Tool results are merged into tool calls above
        return null;
      })}

      {/* Active tool executions (streaming) */}
      {activeToolExecutions.map((tool) => (
        <ToolCallDisplayMemo 
          key={`${keyPrefix}-active-${tool.toolCallId}`} 
          tool={{
            id: tool.toolCallId,
            name: tool.toolName,
            args: tool.args,
            status: tool.status,
            result: tool.result,
            isError: tool.isError,
          }}
          previewLines={previewLines}
        />
      ))}

      {/* Streaming content */}
      {isStreaming && (streamingText || streamingThinking) && (
        <div className="flex flex-col gap-4">
          {/* Streaming thinking */}
          {streamingThinking && (
            <ThinkingBlockMemo
              thinking={streamingThinking}
              isStreaming={true}
            />
          )}
          
          {/* Streaming text */}
          {streamingText && (
            <div>
              {hasMarkdown(streamingText) ? (
                <Suspense fallback={<PlainText content={streamingText} />}>
                  <MarkdownContent content={streamingText} />
                </Suspense>
              ) : (
                <PlainText content={streamingText} />
              )}
              <span className="cursor-blink text-pi-accent">▌</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
