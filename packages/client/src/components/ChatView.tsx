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
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {displayMessages.length === 0 && !isStreaming ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-pi-muted">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-pi-surface border border-pi-border flex items-center justify-center">
              <span className="text-3xl text-pi-accent">π</span>
            </div>
            <p className="text-lg font-medium text-pi-text mb-1">Welcome to Pi</p>
            <p className="text-sm">Start a conversation by typing a message below</p>
          </div>
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
            <div className="space-y-2">
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
