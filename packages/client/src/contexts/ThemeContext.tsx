import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, themes, applyTheme, getSavedTheme, darkThemes, lightThemes } from '../themes';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  setThemeById: (id: string) => void;
  themes: Theme[];
  darkThemes: Theme[];
  lightThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getSavedTheme());

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      // Only auto-switch if no theme was explicitly saved
      if (!localStorage.getItem('pi-theme')) {
        setThemeState(getSavedTheme());
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setThemeById = (id: string) => {
    const found = themes.find((t) => t.id === id);
    if (found) {
      setThemeState(found);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        setThemeById,
        themes,
        darkThemes,
        lightThemes,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
