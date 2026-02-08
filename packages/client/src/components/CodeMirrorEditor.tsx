import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '../contexts/ThemeContext';

export type EditorLanguage = 'markdown' | 'javascript' | 'typescript' | 'json' | 'text';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: EditorLanguage;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

const createTheme = (isDark: boolean): Extension => {
  const darkColors = {
    background: '#0d1117',
    foreground: '#c9d1d9',
    caret: '#58a6ff',
    selection: '#264f78',
    lineHighlight: '#161b22',
    gutterBackground: '#0d1117',
    gutterForeground: '#7d8590',
  };

  const lightColors = {
    background: '#ffffff',
    foreground: '#24292f',
    caret: '#0969da',
    selection: '#b4d7ff',
    lineHighlight: '#f6f8fa',
    gutterBackground: '#ffffff',
    gutterForeground: '#6e7781',
  };

  const colors = isDark ? darkColors : lightColors;

  return EditorView.theme({
    '&': {
      backgroundColor: colors.background,
      color: colors.foreground,
      fontSize: '13px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      height: '100%',
    },
    '.cm-scroller': {
      height: '100%',
    },
    '.cm-content': {
      caretColor: colors.caret,
      padding: '8px 0',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: colors.caret,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: colors.selection,
    },
    '.cm-activeLine': {
      backgroundColor: colors.lineHighlight,
    },
    '.cm-gutters': {
      backgroundColor: colors.gutterBackground,
      color: colors.gutterForeground,
      borderRight: '1px solid var(--pi-border, #30363d)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: colors.lineHighlight,
    },
    '.cm-lineNumbers': {
      minWidth: '36px',
    },
  }, { dark: isDark });
};

const getLanguageExtension = (language: EditorLanguage): Extension => {
  switch (language) {
    case 'markdown':
      return markdown();
    case 'javascript':
    case 'typescript':
      return javascript({ typescript: language === 'typescript' });
    case 'json':
      return json();
    default:
      return [];
  }
};

export function CodeMirrorEditor({
  value,
  onChange,
  language = 'markdown',
  placeholder,
  readOnly = false,
  className = '',
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageRef = useRef<Extension | null>(null);
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  // Initialize editor (rebuilds when theme mode changes)
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(language);
    languageRef.current = langExt;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      langExt,
      ...(isDark ? [oneDark] : []),
      createTheme(isDark),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
      EditorState.readOnly.of(readOnly),
    ];

    if (placeholder) {
      extensions.push(
        EditorView.theme({
          '.cm-placeholder': { color: '#7d8590' },
        })
      );
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark]);

  // Update value when prop changes (but only if different from current editor content)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  // Note: Language switching not supported in this simplified version
  // The editor would need to be re-mounted to change languages

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden rounded border border-pi-border bg-pi-surface ${className}`}
    />
  );
}

export default CodeMirrorEditor;
