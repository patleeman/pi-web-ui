import { memo, useMemo } from 'react';

/**
 * File extensions recognized as clickable file paths.
 * Matches the set in MarkdownContent.tsx.
 */
const FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'md', 'py', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'html', 'yml', 'yaml', 'sh',
  'zsh', 'toml', 'txt', 'xml', 'sql', 'rb', 'php', 'swift', 'kt',
  'lock', 'env', 'cfg', 'ini', 'conf', 'log', 'csv', 'svg',
  'dockerfile', 'makefile', 'gitignore',
]);



// URL pattern - matches http(s) URLs and www. URLs
const URL_PATTERN = /https?:\/\/[^\s<>\"')\]]+|www\.[^\s<>\"')\]]+/g;

// File path pattern - matches:
//   /absolute/path/to/file.ext
//   ./relative/path/to/file.ext
//   ../parent/path/to/file.ext
//   packages/foo/bar.ts (relative with known extension)
// Only paths with a known file extension are made clickable to avoid false positives.
const FILE_PATH_PATTERN = /(?:^|(?<=\s|`|'|"|,|\(|\[))(?:\.\.?\/[\w./@-]+|~\/[\w./@-]+(?:\/[\w./@-]+)*|\/[\w./@-]+(?:\/[\w./@-]+)+)/gm;

interface Segment {
  type: 'text' | 'url' | 'file';
  value: string;
}

function hasKnownExtension(path: string): boolean {
  const clean = path.replace(/[.:;,)}\]]+$/, '');
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = clean.slice(lastDot + 1).toLowerCase();
  return FILE_EXTENSIONS.has(ext);
}

function isLikelyFilePath(path: string): boolean {
  // Only match paths with a known file extension to avoid false positives
  // on directory paths, bash commands, etc.
  const clean = path.replace(/[.:;,)}\]]+$/, '');
  return hasKnownExtension(clean);
}

/**
 * Parse text into segments of plain text, URLs, and file paths.
 */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  
  // Collect all matches with their positions
  const matches: { start: number; end: number; type: 'url' | 'file'; value: string }[] = [];
  
  // Find URLs
  let match: RegExpExecArray | null;
  const urlRe = new RegExp(URL_PATTERN.source, 'g');
  while ((match = urlRe.exec(text)) !== null) {
    // Strip trailing punctuation that's likely not part of the URL
    let value = match[0];
    while (/[.,;:!?)}\]>]$/.test(value) && value.length > 1) {
      value = value.slice(0, -1);
    }
    matches.push({ start: match.index, end: match.index + value.length, type: 'url', value });
  }
  
  // Find file paths
  const fileRe = new RegExp(FILE_PATH_PATTERN.source, FILE_PATH_PATTERN.flags);
  while ((match = fileRe.exec(text)) !== null) {
    let value = match[0];
    // Strip trailing punctuation
    while (/[.,;:!?)}\]>]$/.test(value) && value.length > 1) {
      value = value.slice(0, -1);
    }
    
    if (!isLikelyFilePath(value)) continue;
    
    // Don't overlap with URLs
    const start = match.index;
    const end = start + value.length;
    const overlaps = matches.some(m => start < m.end && end > m.start);
    if (overlaps) continue;
    
    matches.push({ start, end, type: 'file', value });
  }
  
  // Sort by position
  matches.sort((a, b) => a.start - b.start);
  
  // Build segments
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, m.start) });
    }
    segments.push({ type: m.type, value: m.value });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  
  return segments;
}

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent('pi:openFile', { detail: { path } }));
}

interface InteractiveTextProps {
  content: string;
  className?: string;
}

/**
 * Renders text with clickable URLs (open in new tab) and file paths (open in file editor).
 * Used as a drop-in replacement for plain text rendering in chat messages.
 */
export const InteractiveText = memo(function InteractiveText({ 
  content, 
  className = '' 
}: InteractiveTextProps) {
  const segments = useMemo(() => parseSegments(content), [content]);
  
  // Fast path: no links or files found
  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <div className={`text-pi-text text-[14px] leading-relaxed whitespace-pre-wrap ${className}`}>
        {content}
      </div>
    );
  }
  
  return (
    <div className={`text-pi-text text-[14px] leading-relaxed whitespace-pre-wrap ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'url') {
          const href = seg.value.startsWith('www.') ? `https://${seg.value}` : seg.value;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pi-accent hover:underline"
            >
              {seg.value}
            </a>
          );
        }
        if (seg.type === 'file') {
          return (
            <button
              key={i}
              type="button"
              className="text-pi-accent hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit text-left"
              onClick={() => openFile(seg.value)}
              title={`Open ${seg.value}`}
            >
              {seg.value}
            </button>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </div>
  );
});
