import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useTheme } from '../contexts/ThemeContext';
import { getCodeTheme } from '../codeTheme';

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** When true, skips expensive syntax highlighting for better perf during streaming */
  streaming?: boolean;
}

const FILE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'md',
  'py',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'h',
  'css',
  'html',
  'yml',
  'yaml',
  'sh',
  'zsh',
  'toml',
  'txt',
]);

function isExternalLink(href?: string): boolean {
  if (!href) return false;
  if (/^www\./i.test(href)) return true;
  return /^(https?:|mailto:|tel:)/i.test(href);
}

function isFileLink(href?: string): boolean {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (isExternalLink(href)) return false;
  const sanitized = href.replace(/^file:\/\//i, '');
  const pathPart = sanitized.split(/[?#]/)[0];
  const ext = pathPart.includes('.') ? pathPart.split('.').pop()?.toLowerCase() : '';
  const hasKnownExtension = Boolean(ext && FILE_EXTENSIONS.has(ext));
  return (
    pathPart.startsWith('/')
    || pathPart.startsWith('./')
    || pathPart.startsWith('../')
    || pathPart.startsWith('~')
    || pathPart.includes('/')
    || hasKnownExtension
  );
}

// File path pattern for plain text — matches anything that looks like a path:
//   /absolute/path   ~/home/path   ./relative   ../parent
const FILE_PATH_RE = /(?:\.\.?\/[\w./@-]+(?:\/[\w./@-]+)*|~\/[\w./@-]+(?:\/[\w./@-]+)*|\/[\w./@-]+(?:\/[\w./@-]+)+)/g;

/**
 * Process React children, replacing plain-text file paths with clickable buttons.
 * Only transforms string children; passes through React elements unchanged.
 */
function linkifyFilePaths(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    const re = new RegExp(FILE_PATH_RE.source, 'g');
    while ((match = re.exec(children)) !== null) {
      let value = match[0];
      // Strip trailing punctuation
      while (/[.,;:!?)}\]>]$/.test(value) && value.length > 1) {
        value = value.slice(0, -1);
      }

      if (match.index > cursor) {
        parts.push(children.slice(cursor, match.index));
      }
      const path = value;
      parts.push(
        <button
          key={`fp-${match.index}`}
          type="button"
          className="text-pi-accent hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit text-left inline"
          onClick={() => window.dispatchEvent(new CustomEvent('pi:openFile', { detail: { path } }))}
          title={`Open ${path}`}
        >
          {value}
        </button>
      );
      cursor = match.index + value.length;
    }
    if (parts.length === 0) return children;
    if (cursor < children.length) {
      parts.push(children.slice(cursor));
    }
    return parts;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      const result = linkifyFilePaths(child);
      // If the result is an array, wrap in a fragment with key
      if (Array.isArray(result)) {
        return <span key={i}>{result}</span>;
      }
      return result;
    });
  }
  return children;
}

export const MarkdownContent = memo(function MarkdownContent({ 
  content, 
  className = '',
  streaming = false,
}: MarkdownContentProps) {
  const { theme } = useTheme();
  const codeTheme = getCodeTheme(theme.mode);
  const components = useMemo(() => ({
    // Pre element - wraps fenced code blocks
    pre({ children, ...props }: any) {
      return <div className="my-2 bg-pi-code-bg rounded" {...props}>{children}</div>;
    },
    
    // Code element - handles both inline and block code
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');
      
      // Check if this is a block code (has language or is multiline)
      const isBlock = language || codeString.includes('\n');
      
      if (isBlock) {
        if (language && !streaming) {
          // Syntax highlighted code block (skip during streaming — Prism is expensive)
          return (
            <SyntaxHighlighter
              style={codeTheme as any}
              language={language}
              PreTag="div"
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          );
        }
        
        // Plain code block (no language specified, or streaming mode)
        return (
          <pre className="bg-pi-code-bg p-3 rounded overflow-x-auto text-[13px]">
            <code className="text-pi-text">{children}</code>
          </pre>
        );
      }
      
      // Inline code - check if it's a file path
      const codeText = String(children);
      if (isFileLink(codeText)) {
        return (
          <code
            className="bg-pi-code-bg px-1.5 py-0.5 rounded text-[13px] text-pi-accent hover:underline cursor-pointer"
            role="button"
            tabIndex={0}
            title={`Open ${codeText}`}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('pi:openFile', { detail: { path: codeText } }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('pi:openFile', { detail: { path: codeText } }));
              }
            }}
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <code 
          className="bg-pi-code-bg px-1.5 py-0.5 rounded text-[13px] text-pi-text" 
          {...props}
        >
          {children}
        </code>
      );
    },
    
    // Links
    a({ href, children, ...props }: any) {
      const external = isExternalLink(href);
      const fileLink = isFileLink(href);

      return (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="text-pi-accent hover:underline"
          onClick={(event) => {
            if (!fileLink || !href) return;
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('pi:openFile', { detail: { path: href } }));
          }}
          {...props}
        >
          {children}
        </a>
      );
    },
    
    // Paragraphs - tighter spacing, with file path linkification
    p({ children, ...props }: any) {
      return (
        <p className="mb-2 last:mb-0" {...props}>
          {linkifyFilePaths(children)}
        </p>
      );
    },
    
    // Headers - compact
    h1({ children, ...props }: any) {
      return <h1 className="text-lg font-semibold mb-2 mt-3 first:mt-0" {...props}>{children}</h1>;
    },
    h2({ children, ...props }: any) {
      return <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0" {...props}>{children}</h2>;
    },
    h3({ children, ...props }: any) {
      return <h3 className="text-[14px] font-semibold mb-1 mt-2 first:mt-0" {...props}>{children}</h3>;
    },
    
    // Lists
    ul({ children, ...props }: any) {
      return <ul className="list-disc pl-5 mb-2 space-y-0.5" {...props}>{children}</ul>;
    },
    ol({ children, ...props }: any) {
      return <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...props}>{children}</ol>;
    },
    li({ children, ...props }: any) {
      return <li className="text-pi-text pl-1" {...props}>{linkifyFilePaths(children)}</li>;
    },
    
    // Blockquotes
    blockquote({ children, ...props }: any) {
      return (
        <blockquote 
          className="border-l-2 border-pi-border pl-3 my-2 text-pi-muted italic"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    
    // Horizontal rule
    hr({ ...props }: any) {
      return <hr className="border-pi-border my-3" {...props} />;
    },
    
    // Tables
    table({ children, ...props }: any) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="min-w-full border-collapse text-[13px]" {...props}>
            {children}
          </table>
        </div>
      );
    },
    th({ children, ...props }: any) {
      return (
        <th className="border border-pi-border px-3 py-1.5 bg-pi-surface text-left font-semibold" {...props}>
          {children}
        </th>
      );
    },
    td({ children, ...props }: any) {
      return (
        <td className="border border-pi-border px-3 py-1.5" {...props}>
          {children}
        </td>
      );
    },
  }), [codeTheme, streaming]);

  return (
    <div className={`markdown-content text-pi-text text-[14px] leading-relaxed ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
