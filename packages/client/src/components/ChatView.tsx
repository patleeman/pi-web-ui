import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@pi-web-ui/shared';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';
import { ToolExecution } from './ToolExecution';

interface ToolExecutionState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
}

interface ChatViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolExecutions: ToolExecutionState[];
}

export function ChatView({
  messages,
  isStreaming,
  streamingText,
  streamingThinking,
  activeToolExecutions,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streamingThinking, activeToolExecutions]);

  // Filter out tool result messages for inline display with tool calls
  const displayMessages = messages.filter((m) => m.role !== 'toolResult');

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2 md:px-3 py-2 space-y-1"
    >
      {displayMessages.length === 0 && !isStreaming ? (
        <div className="text-pi-muted font-mono text-sm py-2">
          <span className="text-pi-accent">π</span> ready. type a message to begin.
        </div>
      ) : (
        <>
          {displayMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              toolResults={messages.filter(
                (m) =>
                  m.role === 'toolResult' &&
                  message.content.some(
                    (c) => c.type === 'toolCall' && c.id === m.toolCallId
                  )
              )}
            />
          ))}

          {/* Active tool executions */}
          {activeToolExecutions.length > 0 && (
            <div className="space-y-0.5">
              {activeToolExecutions.map((tool) => (
                <ToolExecution key={tool.toolCallId} tool={tool} />
              ))}
            </div>
          )}

          {/* Streaming content */}
          {isStreaming && (streamingText || streamingThinking) && (
            <StreamingMessage
              text={streamingText}
              thinking={streamingThinking}
            />
          )}
        </>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
