import { lazy, Suspense, useState, useMemo } from 'react';
import type { ChatMessage, MessageContent } from '@pi-web-ui/shared';

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
function getOutputInfo(result: string): { 
  lineCount: number; 
  hasMore: boolean; 
  previewText: string; 
  fullText: string;
} {
  const lines = result.split('\n');
  const lineCount = lines.length;
  
  // Preview shows first 15 lines
  const previewLines = 15;
  const hasMore = lineCount > previewLines;
  const previewText = lines.slice(0, previewLines).join('\n');
  
  // Full text shows up to 100 lines
  const maxLines = 100;
  const fullText = lines.slice(0, maxLines).join('\n');
  
  return { lineCount, hasMore, previewText, fullText };
}

// Generate a simple diff display from oldText and newText
function generateSimpleDiff(oldText: string, newText: string): { removed: string[]; added: string[] } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  return { removed: oldLines, added: newLines };
}

// Render diff from edit tool arguments (oldText -> newText)
function EditDiffDisplay({ oldText, newText }: { oldText: string; newText: string }) {
  const { removed, added } = generateSimpleDiff(oldText, newText);
  
  return (
    <div className="text-[12px] font-mono">
      {/* Show removed lines */}
      {removed.map((line, i) => (
        <div key={`r-${i}`} className="text-[#ff5c57] bg-[#3a2828] px-2 -mx-2">
          <span className="text-[#ff5c57]/60 mr-2 select-none">-{i + 1}</span>
          {line}
        </div>
      ))}
      {/* Show added lines */}
      {added.map((line, i) => (
        <div key={`a-${i}`} className="text-[#b5bd68] bg-[#283a28] px-2 -mx-2">
          <span className="text-[#b5bd68]/60 mr-2 select-none">+{i + 1}</span>
          {line}
        </div>
      ))}
    </div>
  );
}

// Render read output with line numbers
function ReadDisplay({ content, startLine = 1 }: { content: string; startLine?: number }) {
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
}

// TUI-style tool call display - matches terminal UI exactly
function ToolCallDisplay({ 
  tool,
}: { 
  tool: { 
    id: string; 
    name: string; 
    args?: Record<string, unknown>;
    status: 'pending' | 'running' | 'complete' | 'error';
    result?: string;
    isError?: boolean;
  };
}) {
  const [expanded, setExpanded] = useState(true);
  const headerInfo = formatToolHeader(tool.name, tool.args);
  const prefix: string = headerInfo.prefix;
  const detail: string = headerInfo.detail;
  const args = parseArgs(tool.args);
  
  const hasResult = tool.result && tool.result.length > 0;
  const outputInfo = hasResult ? getOutputInfo(tool.result!) : null;
  
  // Check tool type for specialized rendering
  const toolName = tool.name.toLowerCase();
  const isEditTool = toolName === 'edit';
  const isReadTool = toolName === 'read';
  const hasEditDiff = isEditTool && Boolean(args.oldText) && Boolean(args.newText);
  
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
        <span className="text-pi-text whitespace-pre-wrap break-all flex-1">{detail}</span>
        {tool.status === 'running' && (
          <span className="text-pi-warning text-[11px] flex-shrink-0 animate-pulse">(running)</span>
        )}
      </div>
      
      {/* Edit diff display - from args */}
      {hasEditDiff && expanded && (
        <div className="px-4 pb-3">
          <EditDiffDisplay 
            oldText={String(args.oldText)} 
            newText={String(args.newText)} 
          />
        </div>
      )}
      
      {/* Read tool output - with line numbers, no scrollbar */}
      {hasResult && isReadTool && !hasEditDiff && expanded && (
        <div className="px-4 pb-3">
          <ReadDisplay content={outputInfo!.previewText} startLine={readStartLine} />
          {outputInfo!.hasMore && (
            <div className="text-pi-muted/50 mt-2 text-[11px]">
              ... ({outputInfo!.lineCount - 15} more lines)
            </div>
          )}
        </div>
      )}
      
      {/* Other tool output - with line numbers, no scrollbar */}
      {hasResult && !isReadTool && !hasEditDiff && expanded && (
        <div className={`px-4 pb-3 ${tool.isError ? 'text-pi-error' : ''}`}>
          <ReadDisplay content={outputInfo!.previewText} startLine={1} />
          {outputInfo!.hasMore && (
            <div className="text-pi-muted/50 mt-2 text-[11px]">
              ... ({outputInfo!.lineCount - 15} more lines)
            </div>
          )}
        </div>
      )}
      
      {/* Collapsed indicator */}
      {(hasEditDiff || hasResult) && !expanded && (
        <div className="px-4 pb-2 text-[11px] text-pi-muted">
          (click to expand)
        </div>
      )}
    </div>
  );
}

// User message display - distinct background like TUI (full-width, cyan/teal tinted)
function UserMessage({ text }: { text: string }) {
  return (
    <div className="-mx-4 bg-[#193549] border-l-2 border-[#00d7ff] px-4 py-3 font-mono text-[14px] text-pi-text whitespace-pre-wrap">
      {text}
    </div>
  );
}

export function MessageList({
  keyPrefix,
  messages,
  streamingText,
  streamingThinking,
  isStreaming,
  activeToolExecutions,
}: MessageListProps) {
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
          return <UserMessage key={msgKey} text={text} />;
        }

        if (msg.role === 'assistant') {
          const text = getTextContent(msg.content);
          const tools = getToolCalls(msg.content);
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
              {/* Tool calls - TUI style with background */}
              {toolsWithResults.map((tool) => (
                <ToolCallDisplay 
                  key={`${msgKey}-tool-${tool.id}`} 
                  tool={tool}
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
        <ToolCallDisplay 
          key={`${keyPrefix}-active-${tool.toolCallId}`} 
          tool={{
            id: tool.toolCallId,
            name: tool.toolName,
            args: tool.args,
            status: tool.status,
            result: tool.result,
            isError: tool.isError,
          }}
        />
      ))}

      {/* Streaming content */}
      {isStreaming && (streamingText || streamingThinking) && (
        <div className="flex flex-col gap-2">
          {/* Streaming thinking - hidden */}
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
