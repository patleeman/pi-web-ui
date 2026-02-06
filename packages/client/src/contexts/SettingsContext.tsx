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
}

const DEFAULT_SETTINGS: Settings = {
  autoCollapseThinking: false, // User said they like reading thinking traces
  autoCollapseTools: true,
  notificationsEnabled: true,
  doubleEscapeAction: 'tree',
};

const STORAGE_KEY = 'pi-settings';

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

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

  // Save settings when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        isSettingsOpen,
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
