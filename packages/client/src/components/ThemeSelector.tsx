import { useState, useRef, useEffect } from 'react';
import { Palette, Sun, Moon, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../themes';

interface ThemeSelectorProps {
  compact?: boolean;
}

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
  const { theme, setTheme, darkThemes, lightThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const ThemeOption = ({ t }: { t: Theme }) => (
    <button
      onClick={() => {
        setTheme(t);
        setIsOpen(false);
      }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-pi-surface transition-colors ${
        theme.id === t.id ? 'text-pi-accent' : 'text-pi-text'
      }`}
    >
      {/* Color preview dot */}
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: t.colors.accent }}
      />
      <span className="flex-1 truncate">{t.name}</span>
      {theme.id === t.id && <Check className="w-3 h-3 flex-shrink-0" />}
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-pi-muted hover:text-pi-text hover:bg-pi-surface rounded transition-colors"
        title="Change theme"
      >
        <Palette className="w-4 h-4" />
        {!compact && (
          <span className="text-xs font-mono hidden sm:inline">{theme.name}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-pi-bg border border-pi-border rounded shadow-lg z-50 py-1 font-mono">
          {/* Dark themes */}
          <div className="px-3 py-1 text-xs text-pi-muted flex items-center gap-1.5 border-b border-pi-border">
            <Moon className="w-3 h-3" />
            <span>Dark</span>
          </div>
          {darkThemes.map((t) => (
            <ThemeOption key={t.id} t={t} />
          ))}

          {/* Light themes */}
          <div className="px-3 py-1 text-xs text-pi-muted flex items-center gap-1.5 border-b border-pi-border mt-1">
            <Sun className="w-3 h-3" />
            <span>Light</span>
          </div>
          {lightThemes.map((t) => (
            <ThemeOption key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
