import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const { theme } = useTheme();
  const syntaxStyle = theme.mode === 'dark' ? oneDark : oneLight;

  // Memoize components to prevent re-creating on every render
  const components = useMemo(
    () => ({
      code: (props: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; className?: string }) => (
        <CodeBlock {...props} syntaxStyle={syntaxStyle} />
      ),
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      // Table components
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto">
          <table className="min-w-full border-collapse border border-pi-border rounded-lg overflow-hidden">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-pi-surface">{children}</thead>
      ),
      tbody: ({ children }: { children?: React.ReactNode }) => (
        <tbody className="divide-y divide-pi-border">{children}</tbody>
      ),
      tr: ({ children }: { children?: React.ReactNode }) => (
        <tr className="hover:bg-pi-surface/50 transition-colors">{children}</tr>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="px-3 py-2 text-left text-xs font-semibold text-pi-muted uppercase tracking-wider border-b border-pi-border">
          {children}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="px-3 py-2 text-sm text-pi-text border-pi-border">
          {children}
        </td>
      ),
    }),
    [syntaxStyle]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

interface CodeBlockProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  syntaxStyle: typeof oneDark;
}

function CodeBlock({ className, children, syntaxStyle, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  // Inline code
  if (!match) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-pi-surface text-pi-accent text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Code block
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-pi-border bg-pi-bg group relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-pi-surface border-b border-pi-border">
        <span className="text-xs text-pi-muted">{language}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
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

      {/* Code */}
      <SyntaxHighlighter
        style={syntaxStyle}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '0.75rem',
          background: 'transparent',
          fontSize: '0.8125rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
