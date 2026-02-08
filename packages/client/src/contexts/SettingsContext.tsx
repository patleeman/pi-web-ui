import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type DoubleEscapeAction = 'tree' | 'fork' | 'none';

export interface Settings {
  // Display settings
  autoCollapseThinking: boolean;
  autoCollapseTools: boolean;
  
  // Notification settings
  notificationsEnabled: boolean;

  // Keyboard behavior
  doubleEscapeAction: DoubleEscapeAction;

  // Hotkey overrides (action ID → binding string, empty = use default)
  hotkeyOverrides: Record<string, string>;

  // Model preferences
  /** Default model for new sessions ("provider:modelId") */
  defaultModelKey: string | null;
  /** Default thinking level for the default model */
  defaultThinkingLevel: string;
  /** Models pinned to top of selector ("provider:modelId" list, synced from scoped models) */
  pinnedModelKeys: string[];
}

const DEFAULT_SETTINGS: Settings = {
  autoCollapseThinking: false,
  autoCollapseTools: true,
  notificationsEnabled: true,
  doubleEscapeAction: 'tree',
  hotkeyOverrides: {},
  defaultModelKey: null,
  defaultThinkingLevel: 'off',
  pinnedModelKeys: [],
};

const STORAGE_KEY = 'pi-settings';

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  isSettingsOpen: boolean;
  /** Category to scroll to when opening (null = default) */
  openSettingsCategory: string | null;
  openSettings: (category?: string) => void;
  closeSettings: () => void;
}

// Persist context across HMR reloads — avoids "useSettings must be used within SettingsProvider"
const _global = globalThis as unknown as { __piSettingsCtx?: ReturnType<typeof createContext<SettingsContextValue | null>> };
if (!_global.__piSettingsCtx) {
  _global.__piSettingsCtx = createContext<SettingsContextValue | null>(null);
}
const SettingsContext = _global.__piSettingsCtx;

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openSettingsCategory, setOpenSettingsCategory] = useState<string | null>(null);

  // Save settings when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const openSettings = useCallback((category?: string) => {
    setOpenSettingsCategory(category || null);
    setIsSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setOpenSettingsCategory(null);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        isSettingsOpen,
        openSettingsCategory,
        openSettings,
        closeSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
