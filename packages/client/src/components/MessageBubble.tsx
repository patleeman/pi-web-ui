import { useState } from 'react';
import type { ChatMessage, MessageContent } from '@pi-web-ui/shared';
import { MarkdownContent } from './MarkdownContent';

interface MessageBubbleProps {
  message: ChatMessage;
  toolResults?: ChatMessage[];
}

export function MessageBubble({ message, toolResults = [] }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className="font-mono text-xs md:text-sm">
      {/* Role indicator */}
      <div className={`flex items-baseline gap-1.5 md:gap-2 ${isUser ? 'text-pi-accent' : 'text-pi-muted'}`}>
        <span className="flex-shrink-0">{isUser ? '>' : 'π'}</span>
        <div className="flex-1 min-w-0 overflow-hidden">
          {message.content.map((content, index) => (
            <ContentBlock
              key={index}
              content={content}
              toolResult={toolResults.find(
                (tr) => content.type === 'toolCall' && tr.toolCallId === content.id
              )}
            />
          ))}
        </div>
        {/* Inline metadata for assistant - hide on small screens */}
        {!isUser && message.usage && (
          <span className="text-xs text-pi-muted flex-shrink-0 hidden sm:inline">
            [{message.usage.input + message.usage.output}t]
          </span>
        )}
      </div>
    </div>
  );
}

interface ContentBlockProps {
  content: MessageContent;
  toolResult?: ChatMessage;
}

function ContentBlock({ content, toolResult }: ContentBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (content.type === 'text') {
    return (
      <div className="markdown-content">
        <MarkdownContent content={content.text} />
      </div>
    );
  }

  if (content.type === 'thinking') {
    return (
      <div className="my-0.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-pi-muted hover:text-pi-text transition-colors"
        >
          [{isExpanded ? '−' : '+'} thinking]
        </button>
        {isExpanded && (
          <div className="pl-2 border-l border-pi-border text-pi-muted">
            <MarkdownContent content={content.thinking} />
          </div>
        )}
      </div>
    );
  }

  if (content.type === 'toolCall') {
    const result = toolResult?.content?.[0];
    const resultText = result?.type === 'text' ? result.text : '';
    const isError = toolResult?.isError;

    return (
      <div className="my-0.5">
        {/* Tool call header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hover:text-pi-text transition-colors"
        >
          <span className={isError ? 'text-pi-error' : 'text-pi-success'}>
            [{isExpanded ? '−' : '+'} {content.name}]
          </span>
          <span className="text-pi-muted ml-1">
            {isError ? '✗' : '✓'}
          </span>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="pl-2 border-l border-pi-border mt-0.5">
            {/* Arguments */}
            <div className="text-pi-muted">
              <span className="text-xs">args:</span>
              <pre className="text-xs overflow-x-auto text-pi-text">
                {JSON.stringify(content.arguments, null, 2)}
              </pre>
            </div>

            {/* Result */}
            {resultText && (
              <div className="relative group">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-pi-muted">out:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(resultText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-pi-muted hover:text-pi-text"
                  >
                    {copied ? '✓' : '[copy]'}
                  </button>
                </div>
                <pre
                  className={`text-xs overflow-x-auto max-h-48 overflow-y-auto ${
                    isError ? 'text-pi-error' : 'text-pi-text'
                  }`}
                >
                  {resultText}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (content.type === 'image') {
    return (
      <div className="mt-2 mb-2">
        <img
          src={`data:${content.source.mediaType};base64,${content.source.data}`}
          alt="Attached image"
          className="max-w-full max-h-48 md:max-h-64 rounded-lg border border-pi-border"
        />
      </div>
    );
  }

  return null;
}
