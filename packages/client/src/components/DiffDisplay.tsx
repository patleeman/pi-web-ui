import * as Diff from 'diff';
import type { ReactNode } from 'react';

interface DiffDisplayProps {
  oldText: string;
  newText: string;
  contextLines?: number;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  lineNum: number;
  // For intra-line highlighting
  highlightedContent?: ReactNode;
}

/**
 * Generate structured diff data with line numbers and context.
 */
function generateDiffLines(oldContent: string, newContent: string, contextLines = 4): DiffLine[] {
  const parts = Diff.diffLines(oldContent, newContent);
  const output: DiffLine[] = [];
  
  // Note: we don't need maxLineNum here since we track line numbers as we go
  
  let oldLineNum = 1;
  let newLineNum = 1;
  let lastWasChange = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = part.value.split('\n');
    // Remove trailing empty string from split
    if (raw[raw.length - 1] === '') {
      raw.pop();
    }

    if (part.added || part.removed) {
      // Show the change
      for (const line of raw) {
        if (part.added) {
          output.push({
            type: 'added',
            content: line,
            lineNum: newLineNum,
          });
          newLineNum++;
        } else {
          output.push({
            type: 'removed',
            content: line,
            lineNum: oldLineNum,
          });
          oldLineNum++;
        }
      }
      lastWasChange = true;
    } else {
      // Context lines - only show a few before/after changes
      const nextPartIsChange = i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);
      
      if (lastWasChange || nextPartIsChange) {
        let linesToShow = raw;
        let skipStart = 0;
        let skipEnd = 0;

        if (!lastWasChange) {
          // Show only last N lines as leading context
          skipStart = Math.max(0, raw.length - contextLines);
          linesToShow = raw.slice(skipStart);
        }

        if (!nextPartIsChange && linesToShow.length > contextLines) {
          // Show only first N lines as trailing context
          skipEnd = linesToShow.length - contextLines;
          linesToShow = linesToShow.slice(0, contextLines);
        }

        // Add ellipsis if we skipped lines at start
        if (skipStart > 0) {
          output.push({
            type: 'context',
            content: '...',
            lineNum: -1, // Special marker for ellipsis
          });
          oldLineNum += skipStart;
          newLineNum += skipStart;
        }

        for (const line of linesToShow) {
          output.push({
            type: 'context',
            content: line,
            lineNum: oldLineNum,
          });
          oldLineNum++;
          newLineNum++;
        }

        // Add ellipsis if we skipped lines at end
        if (skipEnd > 0) {
          output.push({
            type: 'context',
            content: '...',
            lineNum: -1,
          });
          oldLineNum += skipEnd;
          newLineNum += skipEnd;
        }
      } else {
        // Skip these context lines entirely
        oldLineNum += raw.length;
        newLineNum += raw.length;
      }
      lastWasChange = false;
    }
  }

  return output;
}

/**
 * Apply intra-line highlighting to consecutive removed/added pairs.
 * When there's exactly one removed line followed by one added line,
 * we do word-level diff highlighting.
 */
function applyIntraLineHighlighting(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];

    // Look for single removed+added pair
    if (current.type === 'removed' && 
        i + 1 < lines.length && 
        lines[i + 1].type === 'added') {
      // Check it's a single pair (not part of a larger block)
      const isIsolatedPair = 
        (i === 0 || lines[i - 1].type !== 'removed') &&
        (i + 2 >= lines.length || lines[i + 2].type !== 'added');

      if (isIsolatedPair) {
        const removed = current;
        const added = lines[i + 1];
        
        // Do word-level diff
        const wordDiff = Diff.diffWords(removed.content, added.content);
        
        // Build highlighted content for removed line
        const removedParts: ReactNode[] = [];
        const addedParts: ReactNode[] = [];
        let isFirstRemoved = true;
        let isFirstAdded = true;

        wordDiff.forEach((part, idx) => {
          if (part.removed) {
            let value = part.value;
            // Strip leading whitespace from first removed part (don't highlight indentation)
            if (isFirstRemoved) {
              const leadingWs = value.match(/^(\s*)/)?.[1] || '';
              value = value.slice(leadingWs.length);
              if (leadingWs) {
                removedParts.push(<span key={`r-ws-${idx}`}>{leadingWs}</span>);
              }
              isFirstRemoved = false;
            }
            if (value) {
              removedParts.push(
                <span key={`r-${idx}`} className="bg-pi-diff-remove-bg rounded-sm">
                  {value}
                </span>
              );
            }
          } else if (part.added) {
            let value = part.value;
            if (isFirstAdded) {
              const leadingWs = value.match(/^(\s*)/)?.[1] || '';
              value = value.slice(leadingWs.length);
              if (leadingWs) {
                addedParts.push(<span key={`a-ws-${idx}`}>{leadingWs}</span>);
              }
              isFirstAdded = false;
            }
            if (value) {
              addedParts.push(
                <span key={`a-${idx}`} className="bg-pi-diff-add-bg rounded-sm">
                  {value}
                </span>
              );
            }
          } else {
            // Unchanged - add to both
            removedParts.push(<span key={`u-r-${idx}`}>{part.value}</span>);
            addedParts.push(<span key={`u-a-${idx}`}>{part.value}</span>);
          }
        });

        result.push({
          ...removed,
          highlightedContent: <>{removedParts}</>,
        });
        result.push({
          ...added,
          highlightedContent: <>{addedParts}</>,
        });
        i += 2;
        continue;
      }
    }

    result.push(current);
    i++;
  }

  return result;
}

/**
 * Render a proper line-by-line diff display matching TUI style.
 */
export function DiffDisplay({ oldText, newText, contextLines = 4 }: DiffDisplayProps) {
  // Generate diff lines
  let diffLines = generateDiffLines(oldText, newText, contextLines);
  
  // Apply intra-line highlighting for single-line changes
  diffLines = applyIntraLineHighlighting(diffLines);

  // Calculate line number width
  const maxLineNum = Math.max(
    ...diffLines.filter(l => l.lineNum > 0).map(l => l.lineNum)
  );
  const lineNumWidth = String(maxLineNum).length;

  return (
    <div className="text-[12px] font-mono leading-relaxed">
      {diffLines.map((line, i) => {
        const lineNumStr = line.lineNum > 0 
          ? String(line.lineNum).padStart(lineNumWidth, ' ')
          : ''.padStart(lineNumWidth, ' ');
        
        const content = line.highlightedContent || line.content;

        if (line.type === 'removed') {
          return (
            <div key={i} className="text-pi-diff-remove-text bg-pi-diff-remove-bg px-2 -mx-2 whitespace-pre">
              <span className="text-pi-diff-remove-text/60 select-none">-{lineNumStr} </span>
              {content}
            </div>
          );
        }
        
        if (line.type === 'added') {
          return (
            <div key={i} className="text-pi-diff-add-text bg-pi-diff-add-bg px-2 -mx-2 whitespace-pre">
              <span className="text-pi-diff-add-text/60 select-none">+{lineNumStr} </span>
              {content}
            </div>
          );
        }
        
        // Context line
        return (
          <div key={i} className="text-pi-muted/70 px-2 -mx-2 whitespace-pre">
            <span className="text-pi-muted/40 select-none"> {lineNumStr} </span>
            {content}
          </div>
        );
      })}
    </div>
  );
}
