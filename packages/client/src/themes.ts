/**
 * Theme definitions for Pi-Deck
 * 
 * Dark themes: Catppuccin Mocha, Cobalt2, Gruvbox Dark
 * Light themes: GitHub Light, Noctis Lux, Rosé Pine Dawn
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  success: string;
  error: string;
  warning: string;
  // Code syntax colors
  codeKeyword: string;
  codeString: string;
  codeComment: string;
  codeFunction: string;
  codeNumber: string;
  codeOperator: string;
  codeVariable: string;
}

export interface Theme {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
}

export const themes: Theme[] = [
  // ============= DARK THEMES =============
  
  // Pi Default - Terminal-inspired dark theme (mockup design)
  {
    id: 'pi-default',
    name: 'Pi Default',
    mode: 'dark',
    colors: {
      bg: '#0a0f14',
      surface: '#0d1117',
      border: '#21262d',
      text: '#e6edf3',
      muted: '#7d8590',
      accent: '#4a9eff',
      accentHover: '#79b8ff',
      success: '#3fb950',
      error: '#f85149',
      warning: '#d29922',
      codeKeyword: '#ff7b72',
      codeString: '#a5d6ff',
      codeComment: '#7d8590',
      codeFunction: '#d2a8ff',
      codeNumber: '#79c0ff',
      codeOperator: '#e6edf3',
      codeVariable: '#ffa657',
    },
  },

  // Catppuccin Mocha - Soothing pastel theme
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    mode: 'dark',
    colors: {
      bg: '#1e1e2e',
      surface: '#313244',
      border: '#45475a',
      text: '#cdd6f4',
      muted: '#6c7086',
      accent: '#cba6f7',
      accentHover: '#b4befe',
      success: '#a6e3a1',
      error: '#f38ba8',
      warning: '#fab387',
      codeKeyword: '#cba6f7',
      codeString: '#a6e3a1',
      codeComment: '#6c7086',
      codeFunction: '#89b4fa',
      codeNumber: '#fab387',
      codeOperator: '#89dceb',
      codeVariable: '#f5c2e7',
    },
  },

  // Cobalt2 - Vibrant blue theme by Wes Bos
  {
    id: 'cobalt2',
    name: 'Cobalt2',
    mode: 'dark',
    colors: {
      bg: '#193549',
      surface: '#15232d',
      border: '#0d3a58',
      text: '#ffffff',
      muted: '#a4c6e0',
      accent: '#ffc600',
      accentHover: '#ffd740',
      success: '#3ad900',
      error: '#ff628c',
      warning: '#ff9d00',
      codeKeyword: '#ff9d00',
      codeString: '#3ad900',
      codeComment: '#0088ff',
      codeFunction: '#ffc600',
      codeNumber: '#ff628c',
      codeOperator: '#e1efff',
      codeVariable: '#9effff',
    },
  },

  // Gruvbox Dark - Retro groove
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    mode: 'dark',
    colors: {
      bg: '#282828',
      surface: '#3c3836',
      border: '#504945',
      text: '#ebdbb2',
      muted: '#928374',
      accent: '#d79921',
      accentHover: '#fabd2f',
      success: '#98971a',
      error: '#cc241d',
      warning: '#d65d0e',
      codeKeyword: '#fb4934',
      codeString: '#b8bb26',
      codeComment: '#928374',
      codeFunction: '#fabd2f',
      codeNumber: '#d3869b',
      codeOperator: '#8ec07c',
      codeVariable: '#83a598',
    },
  },

  // ============= LIGHT THEMES =============

  // GitHub Light - Clean and professional
  {
    id: 'github-light',
    name: 'GitHub Light',
    mode: 'light',
    colors: {
      bg: '#ffffff',
      surface: '#f6f8fa',
      border: '#d0d7de',
      text: '#1f2328',
      muted: '#656d76',
      accent: '#0969da',
      accentHover: '#0550ae',
      success: '#1a7f37',
      error: '#cf222e',
      warning: '#9a6700',
      codeKeyword: '#cf222e',
      codeString: '#0a3069',
      codeComment: '#6e7781',
      codeFunction: '#8250df',
      codeNumber: '#0550ae',
      codeOperator: '#1f2328',
      codeVariable: '#953800',
    },
  },

  // Noctis Lux - Warm light theme
  {
    id: 'noctis-lux',
    name: 'Noctis Lux',
    mode: 'light',
    colors: {
      bg: '#fef8ec',
      surface: '#f5efe0',
      border: '#e1dbcc',
      text: '#004d57',
      muted: '#7a8a8e',
      accent: '#0c969b',
      accentHover: '#087d82',
      success: '#2d8f4e',
      error: '#c02b4e',
      warning: '#a35f00',
      codeKeyword: '#c02b4e',
      codeString: '#2d8f4e',
      codeComment: '#9e9e9e',
      codeFunction: '#8b41b0',
      codeNumber: '#ab7920',
      codeOperator: '#7b5833',
      codeVariable: '#0c969b',
    },
  },

  // Rosé Pine Dawn - Soft elegant theme
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    mode: 'light',
    colors: {
      bg: '#faf4ed',
      surface: '#fffaf3',
      border: '#dfdad9',
      text: '#575279',
      muted: '#9893a5',
      accent: '#d7827e',
      accentHover: '#b4637a',
      success: '#56949f',
      error: '#b4637a',
      warning: '#ea9d34',
      codeKeyword: '#907aa9',
      codeString: '#56949f',
      codeComment: '#9893a5',
      codeFunction: '#d7827e',
      codeNumber: '#ea9d34',
      codeOperator: '#575279',
      codeVariable: '#286983',
    },
  },
];

// Helpers
export const darkThemes = themes.filter((t) => t.mode === 'dark');
export const lightThemes = themes.filter((t) => t.mode === 'light');

export function getThemeById(id: string): Theme | undefined {
  return themes.find((t) => t.id === id);
}

export const defaultDarkTheme = themes[0]; // Pi Default
export const defaultLightTheme = themes[3]; // GitHub Light

/**
 * Apply theme CSS variables to document
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const colors = theme.colors;

  // Set color scheme for browser UI
  root.style.setProperty('color-scheme', theme.mode);

  // Apply all color variables
  root.style.setProperty('--pi-bg', colors.bg);
  root.style.setProperty('--pi-surface', colors.surface);
  root.style.setProperty('--pi-border', colors.border);
  root.style.setProperty('--pi-text', colors.text);
  root.style.setProperty('--pi-muted', colors.muted);
  root.style.setProperty('--pi-accent', colors.accent);
  root.style.setProperty('--pi-accent-hover', colors.accentHover);
  root.style.setProperty('--pi-success', colors.success);
  root.style.setProperty('--pi-error', colors.error);
  root.style.setProperty('--pi-warning', colors.warning);

  // Syntax highlighting colors
  root.style.setProperty('--pi-code-keyword', colors.codeKeyword);
  root.style.setProperty('--pi-code-string', colors.codeString);
  root.style.setProperty('--pi-code-comment', colors.codeComment);
  root.style.setProperty('--pi-code-function', colors.codeFunction);
  root.style.setProperty('--pi-code-number', colors.codeNumber);
  root.style.setProperty('--pi-code-operator', colors.codeOperator);
  root.style.setProperty('--pi-code-variable', colors.codeVariable);

  // Store in localStorage
  localStorage.setItem('pi-theme', theme.id);
}

/**
 * Get saved theme or detect system preference
 */
export function getSavedTheme(): Theme {
  const savedId = localStorage.getItem('pi-theme');
  if (savedId) {
    const theme = getThemeById(savedId);
    if (theme) return theme;
  }

  // Fall back to system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? defaultDarkTheme : defaultLightTheme;
}
