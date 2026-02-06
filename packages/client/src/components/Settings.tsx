import { useEffect, useState } from 'react';
import { X, Bell, BellOff, Palette, Moon, Sun, Check, Eye, RotateCw, Wrench, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../themes';

interface SettingsProps {
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
  deployStatus: 'idle' | 'building' | 'restarting' | 'error';
  deployMessage: string | null;
  onDeploy: () => void;
  allowedRoots: string[];
  onUpdateAllowedRoots: (roots: string[]) => void;
}

export function Settings({ notificationPermission, onRequestNotificationPermission, deployStatus, deployMessage, onDeploy, allowedRoots, onUpdateAllowedRoots }: SettingsProps) {
  const { settings, updateSettings, isSettingsOpen, closeSettings } = useSettings();
  const { theme, setTheme, darkThemes, lightThemes } = useTheme();
  const [newDirectory, setNewDirectory] = useState('');

  // Close on escape
  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSettings();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  const ThemeOption = ({ t }: { t: Theme }) => (
    <button
      onClick={() => setTheme(t)}
      className={`flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-pi-surface transition-colors rounded ${
        theme.id === t.id ? 'bg-pi-surface text-pi-accent' : 'text-pi-text'
      }`}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: t.colors.accent }}
      />
      <span className="flex-1 truncate">{t.name}</span>
      {theme.id === t.id && <Check className="w-3 h-3 flex-shrink-0" />}
    </button>
  );

  const Toggle = ({ 
    enabled, 
    onChange, 
    label,
    description 
  }: { 
    enabled: boolean; 
    onChange: (value: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        onClick={() => onChange(!enabled)}
        className={`relative mt-0.5 w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
          enabled ? 'bg-pi-accent' : 'bg-pi-surface'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-pi-text group-hover:text-pi-accent transition-colors">{label}</span>
        {description && (
          <p className="text-xs text-pi-muted mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={closeSettings}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[80vh] bg-pi-bg border border-pi-border rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border flex-shrink-0">
          <h2 className="text-lg font-mono text-pi-text">Settings</h2>
          <button
            onClick={closeSettings}
            className="p-1 text-pi-muted hover:text-pi-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Display Section */}
          <section>
            <h3 className="text-sm font-mono text-pi-muted mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Display
            </h3>
            <div className="space-y-4 pl-1">
              <Toggle
                enabled={settings.autoCollapseThinking}
                onChange={(value) => updateSettings({ autoCollapseThinking: value })}
                label="Hide thinking blocks"
                description="Hide all thinking traces in the conversation"
              />
              <Toggle
                enabled={settings.autoCollapseTools}
                onChange={(value) => updateSettings({ autoCollapseTools: value })}
                label="Auto-collapse tools"
                description="Collapse tool results by default"
              />
            </div>
          </section>

          {/* Notifications Section */}
          <section>
            <h3 className="text-sm font-mono text-pi-muted mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </h3>
            <div className="pl-1 space-y-3">
              {notificationPermission === 'unsupported' ? (
                <p className="text-sm text-pi-muted">
                  Notifications are not supported in this browser.
                </p>
              ) : notificationPermission === 'denied' ? (
                <div className="flex items-start gap-2 text-sm">
                  <BellOff className="w-4 h-4 mt-0.5 text-pi-error flex-shrink-0" />
                  <p className="text-pi-muted">
                    Notifications are blocked. Enable them in your browser settings to receive alerts when tasks complete.
                  </p>
                </div>
              ) : notificationPermission === 'granted' ? (
                <Toggle
                  enabled={settings.notificationsEnabled}
                  onChange={(value) => updateSettings({ notificationsEnabled: value })}
                  label="Enable notifications"
                  description="Get notified when tasks complete"
                />
              ) : (
                <button
                  onClick={onRequestNotificationPermission}
                  className="flex items-center gap-2 px-3 py-2 bg-pi-surface hover:bg-pi-border text-pi-text text-sm rounded transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  Enable notifications
                </button>
              )}
            </div>
          </section>

          {/* Theme Section */}
          <section>
            <h3 className="text-sm font-mono text-pi-muted mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Theme
            </h3>
            
            {/* Dark themes */}
            <div className="mb-3">
              <div className="text-xs text-pi-muted flex items-center gap-1.5 mb-2 pl-1">
                <Moon className="w-3 h-3" />
                <span>Dark</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {darkThemes.map((t) => (
                  <ThemeOption key={t.id} t={t} />
                ))}
              </div>
            </div>

            {/* Light themes */}
            <div>
              <div className="text-xs text-pi-muted flex items-center gap-1.5 mb-2 pl-1">
                <Sun className="w-3 h-3" />
                <span>Light</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {lightThemes.map((t) => (
                  <ThemeOption key={t.id} t={t} />
                ))}
              </div>
            </div>
          </section>

          {/* Allowed Directories Section */}
          <section>
            <h3 className="text-sm font-mono text-pi-muted mb-3 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Allowed Directories
            </h3>
            <div className="pl-1 space-y-2">
              {allowedRoots.map((root) => (
                <div
                  key={root}
                  className="flex items-center gap-2 px-3 py-2 bg-pi-surface rounded text-sm group"
                >
                  <span className="flex-1 text-pi-text truncate font-mono text-xs">{root}</span>
                  <button
                    onClick={() => onUpdateAllowedRoots(allowedRoots.filter(r => r !== root))}
                    className="p-1 text-pi-muted hover:text-pi-error opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove directory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              
              {/* Add new directory */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newDirectory}
                  onChange={(e) => setNewDirectory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDirectory.trim()) {
                      const trimmed = newDirectory.trim();
                      if (!allowedRoots.includes(trimmed)) {
                        onUpdateAllowedRoots([...allowedRoots, trimmed]);
                      }
                      setNewDirectory('');
                    }
                  }}
                  placeholder="Add directory path..."
                  className="flex-1 px-3 py-2 bg-pi-surface border border-pi-border rounded text-[16px] text-pi-text placeholder:text-pi-muted font-mono"
                />
                <button
                  onClick={() => {
                    const trimmed = newDirectory.trim();
                    if (trimmed && !allowedRoots.includes(trimmed)) {
                      onUpdateAllowedRoots([...allowedRoots, trimmed]);
                    }
                    setNewDirectory('');
                  }}
                  disabled={!newDirectory.trim()}
                  className="p-2 bg-pi-surface hover:bg-pi-border text-pi-muted hover:text-pi-accent disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                  title="Add directory"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-xs text-pi-muted mt-2">
                Changes require server restart to take effect.
              </p>
            </div>
          </section>

          {/* Developer Section */}
          <section>
            <h3 className="text-sm font-mono text-pi-muted mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Developer
            </h3>
            <div className="pl-1">
              <div className="flex flex-col gap-2">
                <button
                  onClick={onDeploy}
                  disabled={deployStatus === 'building' || deployStatus === 'restarting'}
                  className={`flex items-center gap-2 px-4 py-3 md:py-2 text-base md:text-sm rounded transition-colors ${
                    deployStatus === 'building' || deployStatus === 'restarting'
                      ? 'bg-pi-surface text-pi-muted cursor-wait'
                      : deployStatus === 'error'
                      ? 'bg-pi-error/20 text-pi-error hover:bg-pi-error/30'
                      : 'bg-pi-surface hover:bg-pi-border text-pi-text'
                  }`}
                >
                  <RotateCw className={`w-5 h-5 md:w-4 md:h-4 ${
                    deployStatus === 'building' || deployStatus === 'restarting' ? 'animate-spin' : ''
                  }`} />
                  {deployStatus === 'building' ? 'Building...' :
                   deployStatus === 'restarting' ? 'Restarting...' :
                   'Rebuild & Restart Server'}
                </button>
                {deployMessage && (
                  <p className={`text-sm ${deployStatus === 'error' ? 'text-pi-error' : 'text-pi-muted'}`}>
                    {deployMessage}
                  </p>
                )}
                <p className="text-xs text-pi-muted">
                  Rebuilds the project and restarts the server. Use after making code changes.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
