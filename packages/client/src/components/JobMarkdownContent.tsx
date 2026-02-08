import { memo, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check } from 'lucide-react';
import type { JobTask } from '@pi-deck/shared';
import { useTheme } from '../contexts/ThemeContext';
import { getCodeTheme } from '../codeTheme';

interface JobMarkdownContentProps {
  content: string;
  tasks: JobTask[];
  onToggleTask: (task: JobTask) => void;
  className?: string;
}

/**
 * Strip YAML frontmatter from markdown content for rendering.
 */
function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return content;
  // Skip the closing '---' and any blank line after it
  let bodyStart = endIndex + 4;
  while (bodyStart < content.length && content[bodyStart] === '\n') {
    bodyStart++;
  }
  return content.slice(bodyStart);
}

export const JobMarkdownContent = memo(function JobMarkdownContent({
  content,
  tasks,
  onToggleTask,
  className = '',
}: JobMarkdownContentProps) {
  // Match rendered task list items to parsed tasks by index order.
  // The Nth checkbox <li> in the rendered output corresponds to tasks[N].
  const taskIndexRef = { current: 0 };

  const getNextTask = useCallback((): JobTask | null => {
    if (taskIndexRef.current >= tasks.length) return null;
    return tasks[taskIndexRef.current++];
  }, [tasks]);

  const strippedContent = useMemo(() => stripFrontmatter(content), [content]);

  const { theme } = useTheme();
  const codeTheme = getCodeTheme(theme.mode);

  // Reset task index on each render so the Nth checkbox maps to tasks[N]
  taskIndexRef.current = 0;

  const components = useMemo(() => ({
    pre({ children, ...props }: any) {
      return <div className="my-2 bg-pi-code-bg rounded" {...props}>{children}</div>;
    },

    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');
      const isBlock = language || codeString.includes('\n');

      if (isBlock) {
        if (language) {
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
        return (
          <pre className="bg-pi-code-bg p-3 rounded overflow-x-auto text-[13px]">
            <code className="text-pi-text">{children}</code>
          </pre>
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

    a({ href, children, ...props }: any) {
      const external = href && /^(https?:|mailto:|tel:)/i.test(href);
      return (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="text-pi-accent hover:underline"
          {...props}
        >
          {children}
        </a>
      );
    },

    p({ children, ...props }: any) {
      return <p className="mb-1.5 last:mb-0 text-[13px] sm:text-[12px]" {...props}>{children}</p>;
    },

    h1({ children, ...props }: any) {
      return <h1 className="text-[14px] sm:text-[13px] font-semibold mb-1 mt-3 first:mt-0 text-pi-text" {...props}>{children}</h1>;
    },
    h2({ children, ...props }: any) {
      return <h2 className="text-[13px] sm:text-[12px] font-semibold mb-1 mt-2.5 first:mt-0 text-pi-accent/80" {...props}>{children}</h2>;
    },
    h3({ children, ...props }: any) {
      return <h3 className="text-[12px] sm:text-[11px] font-semibold mb-0.5 mt-2 first:mt-0 text-pi-text/80 uppercase tracking-wide" {...props}>{children}</h3>;
    },
    h4({ children, ...props }: any) {
      return <h4 className="text-[11px] sm:text-[10px] font-medium mb-0.5 mt-1.5 first:mt-0 text-pi-muted" {...props}>{children}</h4>;
    },

    ul({ children, node, ...props }: any) {
      // Task lists get tighter styling
      const classNames = node?.properties?.className;
      const isTaskList = Array.isArray(classNames)
        ? classNames.includes('contains-task-list')
        : classNames === 'contains-task-list';
      if (isTaskList) {
        return <ul className="mb-1.5 space-y-0" {...props}>{children}</ul>;
      }
      return <ul className="list-disc pl-5 mb-1.5 space-y-0.5 text-[13px] sm:text-[12px]" {...props}>{children}</ul>;
    },
    ol({ children, ...props }: any) {
      return <ol className="list-decimal pl-5 mb-1.5 space-y-0.5 text-[13px] sm:text-[12px]" {...props}>{children}</ol>;
    },

    // The key component — list items that may be checkboxes
    li({ children, node, ...props }: any) {
      // react-markdown with remarkGfm renders task list items as:
      //   <li class="task-list-item"><input type="checkbox" checked/><p>text</p></li>
      // The checked state is on the child <input>, NOT on the <li> node.
      // The text is wrapped in <p> (block element) which breaks flex layout,
      // so we unwrap <p> children for task items.
      const classNames = node?.properties?.className;
      const isTaskItem = Array.isArray(classNames)
        ? classNames.includes('task-list-item')
        : classNames === 'task-list-item';

      if (isTaskItem) {
        const filtered = filterCheckboxInput(children);
        const task = getNextTask();
        const checked = task?.done ?? false;

        return (
          <li
            className={`list-none flex items-start gap-2 py-1 px-1.5 rounded hover:bg-pi-bg/50 transition-colors cursor-pointer [&_p]:inline [&_p]:m-0`}
            onClick={() => { if (task) onToggleTask(task); }}
          >
            <span
              className={`flex-shrink-0 mt-[2px] w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                checked
                  ? 'bg-pi-diff-add-bg border-pi-success text-pi-success'
                  : 'border-pi-muted/40 hover:border-pi-accent'
              }`}
            >
              {checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            </span>
            <span className={`text-[13px] sm:text-[12px] flex-1 leading-snug ${
              checked ? 'text-pi-muted line-through' : 'text-pi-text'
            }`}>
              {filtered}
            </span>
          </li>
        );
      }

      // Regular list item
      return (
        <li className="text-pi-text pl-1 list-disc ml-4 text-[13px] sm:text-[12px]" {...props}>
          {children}
        </li>
      );
    },

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

    hr({ ...props }: any) {
      return <hr className="border-pi-border my-3" {...props} />;
    },

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

    // Override the default input to hide it (we render our own checkbox)
    input({ ...props }: any) {
      // Don't render default checkbox inputs — we handle them in the li component
      if (props.type === 'checkbox') return null;
      return <input {...props} />;
    },
  }), [getNextTask, onToggleTask, codeTheme]);

  return (
    <div className={`job-markdown-content text-pi-text text-[14px] sm:text-[13px] leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {strippedContent}
      </ReactMarkdown>
    </div>
  );
});

/**
 * Find the checked state from a checkbox <input> element in children.
      return child.props.children;
    }
    return child;
  });
}

/**
 * Filter out the default checkbox <input> element from children.
 * We render our own checkbox button instead.
 */
function filterCheckboxInput(children: any): any {
  if (!Array.isArray(children)) return children;
  return children.filter((child: any) => {
    if (child?.type === 'input' && child?.props?.type === 'checkbox') return false;
    return true;
  });
}
