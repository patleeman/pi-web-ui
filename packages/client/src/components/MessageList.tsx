import { lazy, Suspense, useState } from 'react';
import type { ChatMessage, MessageContent } from '@pi-web-ui/shared';
import { ChevronRight, ChevronDown } from 'lucide-react';

// Lazy load markdown for code splitting
const MarkdownContent = lazy(() => import('./MarkdownContent').then(m => ({ default: m.MarkdownContent })));

interface MessageListProps {
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
        args?: Record<string, unknown>;
        status: 'pending' | 'running' | 'complete' | 'error';
        result?: string;
        isError?: boolean;
      };
      return { 
        id: tc.id, 
        name: tc.name, 
        args: tc.args,
        status: tc.status,
        result: tc.result,
        isError: tc.isError,
      };
    });
}

// Get thinking blocks from message content
function getThinkingBlocks(content: MessageContent[]): string[] {
  return content
    .filter((c) => c.type === 'thinking')
    .map(c => (c as { type: 'thinking'; thinking: string }).thinking);
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

// Format tool name for display
function formatToolName(name: string): string {
  const toolNames: Record<string, string> = {
    'Read': 'Read',
    'Write': 'Write', 
    'Edit': 'Edit',
    'Bash': 'Bash',
    'web_search': 'Search',
    'web_fetch': 'Fetch',
    'questionnaire': 'Ask',
  };
  return toolNames[name] || name;
}

// Get tool description from args
function getToolSummary(name: string, args?: Record<string, unknown>): string {
  if (!args) return formatToolName(name);
  
  switch (name) {
    case 'Read':
      return args.path ? String(args.path) : 'Read';
    case 'Write':
      return args.path ? String(args.path) : 'Write';
    case 'Edit':
      return args.path ? String(args.path) : 'Edit';
    case 'Bash': {
      const cmd = String(args.command || '');
      // Show first part of command, truncate
      const firstLine = cmd.split('\n')[0];
      return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }
    case 'web_search':
      return args.query ? String(args.query) : 'Search';
    case 'web_fetch':
      return args.url ? String(args.url) : 'Fetch';
    default:
      return formatToolName(name);
  }
}

// TUI-style tool call display
function ToolCallDisplay({ 
  tool, 
  defaultCollapsed = true 
}: { 
  tool: { 
    id: string; 
    name: string; 
    args?: Record<string, unknown>;
    status: 'pending' | 'running' | 'complete' | 'error';
    result?: string;
    isError?: boolean;
  };
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  
  const statusIcon = tool.status === 'complete' ? '✓' : 
                     tool.status === 'error' ? '✗' : 
                     tool.status === 'running' ? '○' : '·';
  
  const statusColor = tool.status === 'complete' ? 'text-pi-success' :
                      tool.status === 'error' ? 'text-pi-error' :
                      'text-pi-warning';

  const hasResult = tool.result && tool.result.length > 0;
  const summary = getToolSummary(tool.name, tool.args);

  return (
    <div className="font-mono text-[13px]">
      {/* Tool header - TUI style */}
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-pi-surface/50 py-0.5 -mx-1 px-1 rounded"
        onClick={() => hasResult && setCollapsed(!collapsed)}
      >
        <span className={statusColor}>{statusIcon}</span>
        <span className="text-pi-muted">[</span>
        <span className={tool.status === 'running' ? 'text-pi-warning' : 'text-pi-accent'}>
          {formatToolName(tool.name)}
        </span>
        <span className="text-pi-muted">]</span>
        <span className="text-pi-text truncate flex-1">{summary}</span>
        {hasResult && (
          collapsed ? 
            <ChevronRight className="w-3 h-3 text-pi-muted" /> : 
            <ChevronDown className="w-3 h-3 text-pi-muted" />
        )}
      </div>
      
      {/* Tool result - collapsed by default */}
      {hasResult && !collapsed && (
        <div className={`mt-1 ml-4 p-2 rounded text-[12px] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto ${
          tool.isError ? 'bg-pi-error/10 text-pi-error' : 'bg-pi-surface text-pi-muted'
        }`}>
          {tool.result!.slice(0, 2000)}
          {tool.result!.length > 2000 && '...(truncated)'}
        </div>
      )}
    </div>
  );
}

// Thinking block display
function ThinkingDisplay({ text, defaultCollapsed = true }: { text: string; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  
  return (
    <div className="font-mono text-[13px]">
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-pi-surface/50 py-0.5 -mx-1 px-1 rounded text-pi-muted italic"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-pi-muted/50">💭</span>
        <span>thinking...</span>
        {collapsed ? 
          <ChevronRight className="w-3 h-3" /> : 
          <ChevronDown className="w-3 h-3" />
        }
      </div>
      {!collapsed && (
        <div className="mt-1 ml-4 p-2 bg-pi-surface rounded text-[12px] text-pi-muted whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  streamingText,
  streamingThinking,
  isStreaming,
  activeToolExecutions,
}: MessageListProps) {
  return (
    <>
      {messages.map((msg, i) => {
        if (msg.role === 'user') {
          const text = getTextContent(msg.content);
          return (
            <div key={msg.id || i} className="text-pi-user text-[14px] leading-relaxed">
              <span className="text-pi-muted mr-2">›</span>
              {text}
            </div>
          );
        }

        if (msg.role === 'assistant') {
          const text = getTextContent(msg.content);
          const tools = getToolCalls(msg.content);
          const thinking = getThinkingBlocks(msg.content);
          const needsMarkdown = hasMarkdown(text);
          
          return (
            <div key={msg.id || i} className="flex flex-col gap-1">
              {/* Thinking blocks */}
              {thinking.map((t, ti) => (
                <ThinkingDisplay key={ti} text={t} />
              ))}
              
              {/* Tool calls - TUI style */}
              {tools.map((tool) => (
                <ToolCallDisplay key={tool.id} tool={tool} />
              ))}
              
              {/* Agent text response */}
              {text && (
                <div className="mt-1">
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

        // Tool results are shown inline with tool calls now
        return null;
      })}

      {/* Active tool executions (streaming) */}
      {activeToolExecutions.map((tool) => (
        <ToolCallDisplay 
          key={tool.toolCallId} 
          tool={{
            id: tool.toolCallId,
            name: tool.toolName,
            args: tool.args,
            status: tool.status,
            result: tool.result,
            isError: tool.isError,
          }}
          defaultCollapsed={false}
        />
      ))}

      {/* Streaming content */}
      {isStreaming && (streamingText || streamingThinking) && (
        <div className="flex flex-col gap-1">
          {streamingThinking && (
            <div className="text-pi-muted text-[13px] leading-relaxed italic">
              <span className="text-pi-muted/50 mr-2">💭</span>
              {streamingThinking.slice(-500)}
            </div>
          )}
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
