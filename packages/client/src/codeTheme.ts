/**
 * Theme-aware syntax highlighting for react-syntax-highlighter.
 * Returns oneDark or oneLight base, with transparent backgrounds
 * (parent containers provide the bg via CSS variables).
 */
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ThemeMode } from './themes';

const darkCodeTheme: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...(oneDark as any)['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: '12px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  'code[class*="language-"]': {
    ...(oneDark as any)['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '13px',
  },
};

const lightCodeTheme: Record<string, React.CSSProperties> = {
  ...oneLight,
  'pre[class*="language-"]': {
    ...(oneLight as any)['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: '12px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  'code[class*="language-"]': {
    ...(oneLight as any)['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '13px',
  },
};

export function getCodeTheme(mode: ThemeMode): Record<string, React.CSSProperties> {
  return mode === 'dark' ? darkCodeTheme : lightCodeTheme;
}
