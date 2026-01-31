import { useState } from 'react';
import { User, Bot, ChevronDown, ChevronRight, Terminal, Copy, Check } from 'lucide-react';
import type { ChatMessage, MessageContent } from '@pi-web-ui/shared';
import { MarkdownContent } from './MarkdownContent';

interface MessageBubbleProps {
  message: ChatMessage;
  toolResults?: ChatMessage[];
}

export function MessageBubble({ message, toolResults = [] }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          isUser
            ? 'bg-pi-accent/20 text-pi-accent'
            : 'bg-pi-surface border border-pi-border text-pi-muted'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'max-w-[80%]' : ''}`}>
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? 'bg-pi-accent/20 border border-pi-accent/30'
              : 'bg-pi-surface border border-pi-border'
          }`}
        >
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

        {/* Metadata */}
        {!isUser && message.usage && (
          <div className="mt-1 text-xs text-pi-muted flex items-center gap-3">
            <span>{message.model}</span>
            <span>•</span>
            <span>{message.usage.input + message.usage.output} tokens</span>
          </div>
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
      <div className="mt-2 mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-pi-muted hover:text-pi-text transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="thinking-indicator">Thinking</span>
        </button>
        {isExpanded && (
          <div className="mt-2 pl-3 border-l-2 border-pi-accent/30 text-sm text-pi-muted italic">
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
      <div className="mt-2 mb-2 bg-pi-bg rounded-lg border border-pi-border overflow-hidden">
        {/* Tool call header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-pi-border/30 transition-colors"
        >
          <Terminal className="w-4 h-4 text-pi-accent" />
          <span className="text-sm font-medium text-pi-text">{content.name}</span>
          <span
            className={`ml-auto text-xs px-2 py-0.5 rounded ${
              isError
                ? 'bg-pi-error/20 text-pi-error'
                : 'bg-pi-success/20 text-pi-success'
            }`}
          >
            {isError ? 'error' : 'success'}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-pi-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-pi-muted" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-pi-border">
            {/* Arguments */}
            <div className="px-3 py-2 border-b border-pi-border">
              <div className="text-xs text-pi-muted mb-1">Arguments</div>
              <pre className="text-xs font-mono text-pi-text overflow-x-auto">
                {JSON.stringify(content.arguments, null, 2)}
              </pre>
            </div>

            {/* Result */}
            {resultText && (
              <div className="px-3 py-2 relative group">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-pi-muted">Output</div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(resultText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-pi-border text-pi-muted hover:text-pi-text"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-pi-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <pre
                  className={`text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto ${
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
          className="max-w-full max-h-64 rounded-lg border border-pi-border"
        />
      </div>
    );
  }

  return null;
}
