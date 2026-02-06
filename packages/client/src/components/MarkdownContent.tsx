import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownContentProps {
  content: string;
  className?: string;
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

// Custom dark theme matching our design
const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: '#161b22',
    margin: 0,
    padding: '12px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '13px',
  },
};

export const MarkdownContent = memo(function MarkdownContent({ 
  content, 
  className = '' 
}: MarkdownContentProps) {
  const components = useMemo(() => ({
    // Pre element - wraps fenced code blocks
    pre({ children, ...props }: any) {
      // Just pass through - the code component handles styling
      return <div className="my-2" {...props}>{children}</div>;
    },
    
    // Code element - handles both inline and block code
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');
      
      // Check if this is a block code (has language or is multiline)
      const isBlock = language || codeString.includes('\n');
      
      if (isBlock) {
        if (language) {
          // Syntax highlighted code block
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
        
        // Plain code block (no language specified)
        return (
          <pre className="bg-[#161b22] p-3 rounded overflow-x-auto text-[13px]">
            <code className="text-pi-text">{children}</code>
          </pre>
        );
      }
      
      // Inline code - check if it's a file path
      const codeText = String(children);
      if (isFileLink(codeText)) {
        return (
          <code
            className="bg-[#161b22] px-1.5 py-0.5 rounded text-[13px] text-pi-accent hover:underline cursor-pointer"
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
          className="bg-[#161b22] px-1.5 py-0.5 rounded text-[13px] text-pi-text" 
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
    
    // Paragraphs - tighter spacing
    p({ children, ...props }: any) {
      return (
        <p className="mb-2 last:mb-0" {...props}>
          {children}
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
      return <li className="text-pi-text pl-1" {...props}>{children}</li>;
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
  }), []);

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
