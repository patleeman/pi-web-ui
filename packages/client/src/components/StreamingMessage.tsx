import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';

interface StreamingMessageProps {
  text: string;
  thinking: string;
}

export function StreamingMessage({ text, thinking }: StreamingMessageProps) {
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-pi-surface border border-pi-accent/50 flex items-center justify-center">
        <Bot className="w-4 h-4 text-pi-accent animate-pulse" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg px-4 py-3 bg-pi-surface border border-pi-accent/30">
          {/* Thinking */}
          {thinking && (
            <div className="mb-2">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="flex items-center gap-1 text-xs text-pi-muted hover:text-pi-text transition-colors"
              >
                {showThinking ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span className="thinking-indicator">Thinking...</span>
              </button>
              {showThinking && (
                <div className="mt-2 pl-3 border-l-2 border-pi-accent/30 text-sm text-pi-muted italic">
                  <MarkdownContent content={thinking} />
                </div>
              )}
            </div>
          )}

          {/* Text */}
          {text ? (
            <div className="markdown-content">
              <MarkdownContent content={text} />
              <span className="inline-block w-2 h-4 bg-pi-accent animate-pulse ml-0.5" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-pi-muted">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-pi-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-pi-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-pi-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
