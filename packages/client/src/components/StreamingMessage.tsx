import { useState } from 'react';
import { MarkdownContent } from './MarkdownContent';

interface StreamingMessageProps {
  text: string;
  thinking: string;
}

export function StreamingMessage({ text, thinking }: StreamingMessageProps) {
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className="font-mono text-sm">
      <div className="flex items-baseline gap-2 text-pi-muted">
        <span className="text-pi-accent animate-pulse">...</span>
        <div className="flex-1 min-w-0">
          {/* Thinking */}
          {thinking && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="text-pi-muted hover:text-pi-text transition-colors"
              >
                <span className="thinking-indicator">[{showThinking ? '−' : '+'} thinking...]</span>
              </button>
              {showThinking && (
                <div className="pl-2 border-l border-pi-border text-pi-muted">
                  <MarkdownContent content={thinking} />
                </div>
              )}
            </div>
          )}

          {/* Text */}
          {text ? (
            <div className="markdown-content text-pi-text">
              <MarkdownContent content={text} />
              <span className="inline-block w-1.5 h-3.5 bg-pi-accent animate-pulse ml-0.5 align-text-bottom" />
            </div>
          ) : (
            <span className="text-pi-muted animate-pulse">...</span>
          )}
        </div>
      </div>
    </div>
  );
}
