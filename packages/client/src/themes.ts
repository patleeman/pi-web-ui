/**
 * Theme definitions for Pi-Deck
 * 
 * Dark themes: Pi Default, Catppuccin Mocha, Cobalt2, Gruvbox Dark,
 *   Dracula, Tokyo Night, Nord, One Dark, Solarized Dark, Rosé Pine, Kanagawa
 * Light themes: GitHub Light, Noctis Lux, Rosé Pine Dawn,
 *   Catppuccin Latte, Solarized Light, One Light
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

// --- Color mixing utilities (used to derive semantic colors from base palette) ---

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('');
}

/** Mix two hex colors. amount=0 returns c1, amount=1 returns c2. */
function mixColors(c1: string, c2: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  );
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
      muted: '#767b91',
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

  // Dracula - Popular purple-tinted dark theme
  {
    id: 'dracula',
    name: 'Dracula',
    mode: 'dark',
    colors: {
      bg: '#282a36',
      surface: '#343746',
      border: '#44475a',
      text: '#f8f8f2',
      muted: '#7080b1',
      accent: '#bd93f9',
      accentHover: '#d6acff',
      success: '#50fa7b',
      error: '#ff5555',
      warning: '#ffb86c',
      codeKeyword: '#ff79c6',
      codeString: '#50fa7b',
      codeComment: '#6272a4',
      codeFunction: '#f1fa8c',
      codeNumber: '#ffb86c',
      codeOperator: '#8be9fd',
      codeVariable: '#bd93f9',
    },
  },

  // Tokyo Night Storm - Modern cool-toned dark theme
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    mode: 'dark',
    colors: {
      bg: '#24283b',
      surface: '#1f2335',
      border: '#1b1e2e',
      text: '#abb3d7',
      muted: '#737b9e',
      accent: '#7aa2f7',
      accentHover: '#89b4fa',
      success: '#9ece6a',
      error: '#f7768e',
      warning: '#e0af68',
      codeKeyword: '#bb9af7',
      codeString: '#9ece6a',
      codeComment: '#565f89',
      codeFunction: '#7aa2f7',
      codeNumber: '#ff9e64',
      codeOperator: '#89ddff',
      codeVariable: '#c0caf5',
    },
  },

  // Nord - Arctic-inspired muted blue theme
  {
    id: 'nord',
    name: 'Nord',
    mode: 'dark',
    colors: {
      bg: '#2e3440',
      surface: '#3b4252',
      border: '#434c5e',
      text: '#eceff4',
      muted: '#838da1',
      accent: '#88c0d0',
      accentHover: '#8fbcbb',
      success: '#a3be8c',
      error: '#bf616a',
      warning: '#d08770',
      codeKeyword: '#81a1c1',
      codeString: '#a3be8c',
      codeComment: '#4c566a',
      codeFunction: '#88c0d0',
      codeNumber: '#b48ead',
      codeOperator: '#81a1c1',
      codeVariable: '#d8dee9',
    },
  },

  // One Dark Pro - Atom's classic dark theme
  {
    id: 'one-dark',
    name: 'One Dark',
    mode: 'dark',
    colors: {
      bg: '#282c34',
      surface: '#21252b',
      border: '#3e4451',
      text: '#b1b8c4',
      muted: '#7b8089',
      accent: '#61afef',
      accentHover: '#79bff5',
      success: '#98c379',
      error: '#e06c75',
      warning: '#d19a66',
      codeKeyword: '#c678dd',
      codeString: '#98c379',
      codeComment: '#5c6370',
      codeFunction: '#61afef',
      codeNumber: '#d19a66',
      codeOperator: '#56b6c2',
      codeVariable: '#e06c75',
    },
  },

  // Solarized Dark - Ethan Schoonover's classic
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    mode: 'dark',
    colors: {
      bg: '#002b36',
      surface: '#073642',
      border: '#586e75',
      text: '#a6b4b6',
      muted: '#687e85',
      accent: '#268bd2',
      accentHover: '#2aa198',
      success: '#859900',
      error: '#dc322f',
      warning: '#cb4b16',
      codeKeyword: '#859900',
      codeString: '#2aa198',
      codeComment: '#586e75',
      codeFunction: '#268bd2',
      codeNumber: '#d33682',
      codeOperator: '#93a1a1',
      codeVariable: '#b58900',
    },
  },

  // Rosé Pine - Elegant dark variant
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    mode: 'dark',
    colors: {
      bg: '#191724',
      surface: '#1f1d2e',
      border: '#26233a',
      text: '#e0def4',
      muted: '#6e6a86',
      accent: '#c4a7e7',
      accentHover: '#ebbcba',
      success: '#9ccfd8',
      error: '#eb6f92',
      warning: '#f6c177',
      codeKeyword: '#c4a7e7',
      codeString: '#9ccfd8',
      codeComment: '#6e6a86',
      codeFunction: '#ebbcba',
      codeNumber: '#f6c177',
      codeOperator: '#908caa',
      codeVariable: '#31748f',
    },
  },

  // Kanagawa - Inspired by The Great Wave off Kanagawa
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    mode: 'dark',
    colors: {
      bg: '#1f1f28',
      surface: '#2a2a37',
      border: '#363646',
      text: '#dcd7ba',
      muted: '#77756c',
      accent: '#7e9cd8',
      accentHover: '#7fb4ca',
      success: '#98bb6c',
      error: '#e82424',
      warning: '#ffa066',
      codeKeyword: '#957fb8',
      codeString: '#98bb6c',
      codeComment: '#727169',
      codeFunction: '#7e9cd8',
      codeNumber: '#d27e99',
      codeOperator: '#c0a36e',
      codeVariable: '#e6c384',
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
      text: '#534e76',
      muted: '#847f93',
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

  // Catppuccin Latte - Soft pastel light theme
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    mode: 'light',
    colors: {
      bg: '#eff1f5',
      surface: '#e6e9ef',
      border: '#ccd0da',
      text: '#4c4f69',
      muted: '#7b7e92',
      accent: '#8839ef',
      accentHover: '#7287fd',
      success: '#40a02b',
      error: '#d20f39',
      warning: '#fe640b',
      codeKeyword: '#8839ef',
      codeString: '#40a02b',
      codeComment: '#9ca0b0',
      codeFunction: '#1e66f5',
      codeNumber: '#fe640b',
      codeOperator: '#04a5e5',
      codeVariable: '#e64553',
    },
  },

  // Solarized Light - Ethan Schoonover's classic light variant
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    mode: 'light',
    colors: {
      bg: '#fdf6e3',
      surface: '#eee8d5',
      border: '#93a1a1',
      text: '#43575f',
      muted: '#748686',
      accent: '#268bd2',
      accentHover: '#2aa198',
      success: '#859900',
      error: '#dc322f',
      warning: '#cb4b16',
      codeKeyword: '#859900',
      codeString: '#2aa198',
      codeComment: '#93a1a1',
      codeFunction: '#268bd2',
      codeNumber: '#d33682',
      codeOperator: '#586e75',
      codeVariable: '#b58900',
    },
  },

  // One Light - Atom's classic light theme
  {
    id: 'one-light',
    name: 'One Light',
    mode: 'light',
    colors: {
      bg: '#fafafa',
      surface: '#f0f0f0',
      border: '#dbdbdc',
      text: '#383a42',
      muted: '#84858b',
      accent: '#4078f2',
      accentHover: '#526fff',
      success: '#50a14f',
      error: '#e45649',
      warning: '#c18401',
      codeKeyword: '#a626a4',
      codeString: '#50a14f',
      codeComment: '#a0a1a7',
      codeFunction: '#4078f2',
      codeNumber: '#986801',
      codeOperator: '#0184bc',
      codeVariable: '#e45649',
    },
  },
];

// Helpers
export const darkThemes = themes.filter((t) => t.mode === 'dark');
export const lightThemes = themes.filter((t) => t.mode === 'light');

export function getThemeById(id: string): Theme | undefined {
  return themes.find((t) => t.id === id);
}

export const defaultDarkTheme = themes.find((t) => t.id === 'pi-default')!;
export const defaultLightTheme = themes.find((t) => t.id === 'github-light')!;

/**
 * Apply theme CSS variables to document
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  const isDark = theme.mode === 'dark';

  // Set color scheme for browser UI
  root.style.setProperty('color-scheme', theme.mode);

  // Apply all color variables
  root.style.setProperty('--pi-bg', c.bg);
  root.style.setProperty('--pi-surface', c.surface);
  root.style.setProperty('--pi-border', c.border);
  root.style.setProperty('--pi-text', c.text);
  root.style.setProperty('--pi-muted', c.muted);
  root.style.setProperty('--pi-accent', c.accent);
  root.style.setProperty('--pi-accent-hover', c.accentHover);
  root.style.setProperty('--pi-success', c.success);
  root.style.setProperty('--pi-error', c.error);
  root.style.setProperty('--pi-warning', c.warning);

  // Syntax highlighting colors
  root.style.setProperty('--pi-code-keyword', c.codeKeyword);
  root.style.setProperty('--pi-code-string', c.codeString);
  root.style.setProperty('--pi-code-comment', c.codeComment);
  root.style.setProperty('--pi-code-function', c.codeFunction);
  root.style.setProperty('--pi-code-number', c.codeNumber);
  root.style.setProperty('--pi-code-operator', c.codeOperator);
  root.style.setProperty('--pi-code-variable', c.codeVariable);

  // Derived semantic colors — computed from base palette so every theme gets them
  root.style.setProperty('--pi-code-bg', isDark
    ? mixColors(c.bg, '#000000', 0.2)
    : mixColors(c.bg, '#000000', 0.04));
  root.style.setProperty('--pi-tool-bg', isDark
    ? mixColors(c.bg, c.success, 0.08)
    : mixColors(c.bg, c.success, 0.07));
  root.style.setProperty('--pi-tool-border', isDark
    ? mixColors(c.muted, c.success, 0.5)
    : mixColors(c.muted, c.success, 0.6));
  root.style.setProperty('--pi-user-bg', isDark
    ? mixColors(c.bg, c.accent, 0.1)
    : mixColors(c.bg, c.accent, 0.06));
  root.style.setProperty('--pi-user-border', isDark
    ? mixColors(c.border, c.accent, 0.2)
    : mixColors(c.border, c.accent, 0.15));
  root.style.setProperty('--pi-diff-add-bg', isDark
    ? mixColors(c.bg, c.success, 0.1)
    : mixColors(c.bg, c.success, 0.1));
  root.style.setProperty('--pi-diff-add-text', c.success);
  root.style.setProperty('--pi-diff-remove-bg', isDark
    ? mixColors(c.bg, c.error, 0.1)
    : mixColors(c.bg, c.error, 0.1));
  root.style.setProperty('--pi-diff-remove-text', c.error);

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
