import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Bell, BellOff, Palette, Moon, Sun, Check, Eye, RotateCw, Wrench, Keyboard, Search, Zap, Package, Blocks, FileText } from 'lucide-react';
import type { DoubleEscapeAction } from '../contexts/SettingsContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../themes';
import { groupedHotkeyDefs, getBinding, formatBinding, eventToBinding } from '../hotkeys';
import type { ModelInfo, ThinkingLevel, ScopedModelInfo, StartupInfo, StartupResourceInfo } from '@pi-deck/shared';

interface SettingsProps {
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
  deployStatus: 'idle' | 'building' | 'restarting' | 'error';
  deployMessage: string | null;
  onDeploy: () => void;
  models: ModelInfo[];
  scopedModels: ScopedModelInfo[];
  onSaveScopedModels: (models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) => void;
  startupInfo: StartupInfo | null;
}

// Category definitions
const CATEGORIES = [
  { id: 'display', label: 'Display', icon: Eye },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'models', label: 'Models', icon: Zap },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'environment', label: 'Environment', icon: Package },
  { id: 'developer', label: 'Developer', icon: Wrench },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

// Fixed (non-configurable) shortcuts shown for reference
const FIXED_SHORTCUTS = [
  { category: 'Input (fixed)', keys: [
    { key: 'Enter', desc: 'Send message' },
    { key: 'Escape', desc: 'Abort agent / clear input' },
    { key: 'Esc Esc', desc: 'Open /tree or /fork (see above)' },
    { key: 'Ctrl+C', desc: 'Clear input (no selection)' },
    { key: 'Ctrl+U', desc: 'Delete to line start' },
    { key: 'Ctrl+K', desc: 'Delete to line end' },
    { key: '@', desc: 'Reference file' },
    { key: '/', desc: 'Slash commands' },
    { key: '!cmd', desc: 'Run bash & send to LLM' },
    { key: '!!cmd', desc: 'Run bash (no LLM)' },
    { key: 'Ctrl+1-9', desc: 'Switch tab' },
  ]},
];

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+\//, '~/').replace(/^\/home\/[^/]+\//, '~/');
}

// ── Sub-components (defined outside Settings to keep stable React identity) ──

function ThemeOption({ t, isActive, onSelect }: { t: Theme; isActive: boolean; onSelect: (t: Theme) => void }) {
  return (
    <button
      onClick={() => onSelect(t)}
      className={`flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-md transition-colors ${
        isActive
          ? 'bg-pi-accent/15 text-pi-accent ring-1 ring-pi-accent/30'
          : 'text-pi-text hover:bg-pi-surface'
      }`}
    >
      <div className="w-6 h-6 rounded flex-shrink-0 ring-1 ring-inset ring-white/10" style={{ backgroundColor: t.colors.bg }}>
        <div className="w-full h-full rounded flex items-center justify-center">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colors.accent }} />
        </div>
      </div>
      <span className="flex-1 truncate">{t.name}</span>
      {isActive && <Check className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-pi-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-pi-text">{label}</div>
        {description && <p className="text-xs text-pi-muted mt-1">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative mt-0.5 w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-pi-accent' : 'bg-pi-surface'}`}
      >
        <span className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: {
  id: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <div id={`settings-${id}`} className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-pi-muted mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      <div className="bg-pi-surface/50 rounded-lg border border-pi-border/50 px-4">
        {children}
      </div>
    </div>
  );
}

function ResourceList({ items }: { items: StartupResourceInfo[] }) {
  const userItems = items.filter(i => i.scope === 'user');
  const projectItems = items.filter(i => i.scope === 'project');

  const renderGroup = (group: StartupResourceInfo[], label: string) => {
    if (group.length === 0) return null;
    return (
      <div className="mb-3 last:mb-0">
        <div className="text-[11px] uppercase tracking-wider text-pi-muted mb-1">{label}</div>
        {group.map((item, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-pi-border/30 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-pi-text">{item.name}</div>
              {item.description && (
                <div className="text-xs text-pi-muted mt-0.5 line-clamp-2">{item.description}</div>
              )}
              <div className="text-[11px] text-pi-muted/70 font-mono truncate mt-0.5" title={item.path}>
                {shortenPath(item.path)}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (items.length === 0) return <div className="py-3 text-sm text-pi-muted">None loaded</div>;

  return (
    <div className="py-3">
      {renderGroup(projectItems, 'Project')}
      {renderGroup(userItems, 'User')}
    </div>
  );
}

export function Settings({ 
  notificationPermission, 
  onRequestNotificationPermission, 
  deployStatus, 
  deployMessage, 
  onDeploy,
  models,
  scopedModels,
  onSaveScopedModels,
  startupInfo,
}: SettingsProps) {
  const { settings, updateSettings, openSettingsCategory, closeSettings } = useSettings();
  const { theme, setTheme, darkThemes, lightThemes } = useTheme();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('display');
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Hotkey recording state
  const [recordingAction, setRecordingAction] = useState<string | null>(null);

  // Scoped models local state
  const [modelSelections, setModelSelections] = useState<Array<{
    provider: string;
    modelId: string;
    modelName: string;
    thinkingLevel: ThinkingLevel;
    enabled: boolean;
  }>>([]);
  const [scopedModelsDirty, setScopedModelsDirty] = useState(false);

  // Rebuild model selections when models or scopedModels props change.
  // Use a stable key to avoid infinite loops from unstable array references.
  const prevModelsKeyRef = useRef('');
  useEffect(() => {
    if (models.length === 0) return;

    const key = models.map(m => m.id).join(',') + '|' + scopedModels.map(s => `${s.modelId}:${s.enabled}:${s.thinkingLevel}`).join(',');
    if (key === prevModelsKeyRef.current) return;
    prevModelsKeyRef.current = key;

    const scopedMap = new Map(scopedModels.map(sm => [`${sm.provider}:${sm.modelId}`, sm]));
    setModelSelections(models.map(m => {
      const k = `${m.provider}:${m.id}`;
      const scoped = scopedMap.get(k);
      return {
        provider: m.provider,
        modelId: m.id,
        modelName: m.name,
        thinkingLevel: scoped?.thinkingLevel || 'off',
        enabled: scoped?.enabled || false,
      };
    }));
    setScopedModelsDirty(false);
  });

  const toggleModel = useCallback((index: number) => {
    setModelSelections(prev => prev.map((s, i) => i === index ? { ...s, enabled: !s.enabled } : s));
    setScopedModelsDirty(true);
  }, []);

  const setModelThinkingLevel = useCallback((index: number, level: ThinkingLevel) => {
    setModelSelections(prev => prev.map((s, i) => i === index ? { ...s, thinkingLevel: level } : s));
    setScopedModelsDirty(true);
  }, []);

  const saveScopedModels = useCallback(() => {
    const enabled = modelSelections.filter(s => s.enabled);
    onSaveScopedModels(enabled.map(s => ({
      provider: s.provider,
      modelId: s.modelId,
      thinkingLevel: s.thinkingLevel,
    })));
    // Sync pinned model keys to client settings so the model dropdown
    // can pin them to the top without a server round-trip.
    updateSettings({ pinnedModelKeys: enabled.map(s => `${s.provider}:${s.modelId}`) });
    setScopedModelsDirty(false);
  }, [modelSelections, onSaveScopedModels, updateSettings]);

  // Focus search on mount, navigate to requested category
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
    setSearchQuery('');
    const cat = (openSettingsCategory as CategoryId) || 'display';
    setActiveCategory(cat);
  }, [openSettingsCategory]);

  const isSearching = searchQuery.trim().length > 0;
  const query = searchQuery.toLowerCase();
  const matchesSearch = (text: string) => text.toLowerCase().includes(query);

  const scrollToCategory = (id: CategoryId) => {
    setActiveCategory(id);
    setSearchQuery('');
    const el = document.getElementById(`settings-${id}`);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - contentRef.current.offsetTop - 16, behavior: 'smooth' });
    }
  };

  const shouldShowSection = (id: CategoryId, ...searchableText: string[]) => {
    if (!isSearching) return activeCategory === id;
    return searchableText.some(matchesSearch);
  };

  // Detect Mac for hotkey display


  const enabledScopedCount = modelSelections.filter(s => s.enabled).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-pi-bg">
      {/* Header with search */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-pi-border flex-shrink-0">
        <h2 className="text-base font-mono text-pi-text flex-shrink-0">Settings</h2>
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pi-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-9 pr-3 py-1.5 bg-pi-surface border border-pi-border rounded-md text-sm text-pi-text placeholder:text-pi-muted focus:outline-none focus:ring-1 focus:ring-pi-accent focus:border-pi-accent"
          />
        </div>
        <button onClick={closeSettings} className="p-1.5 text-pi-muted hover:text-pi-text hover:bg-pi-surface rounded-md transition-colors flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!isSearching && (
          <nav className="w-48 flex-shrink-0 border-r border-pi-border py-3 px-2 overflow-y-auto hidden md:block">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollToCategory(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors mb-0.5 ${
                  activeCategory === id ? 'bg-pi-surface text-pi-accent' : 'text-pi-muted hover:text-pi-text hover:bg-pi-surface/50'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        )}

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto py-6 px-6 md:px-10 lg:px-16">
          <div className="max-w-2xl">

              {/* ── Display ── */}
              {shouldShowSection('display', 'display', 'thinking', 'collapse', 'tools', 'hide') && (
                <Section id="display" title="Display" icon={Eye}>
                  <Toggle
                    enabled={settings.autoCollapseThinking}
                    onChange={(v) => updateSettings({ autoCollapseThinking: v })}
                    label="Hide thinking blocks"
                    description="Hide all thinking traces in the conversation"
                  />
                  <Toggle
                    enabled={settings.autoCollapseTools}
                    onChange={(v) => updateSettings({ autoCollapseTools: v })}
                    label="Auto-collapse tools"
                    description="Collapse tool results by default"
                  />
                </Section>
              )}

              {/* ── Keyboard ── */}
              {shouldShowSection('keyboard', 'keyboard', 'hotkey', 'shortcut', 'escape', 'keybind',
                ...groupedHotkeyDefs().flatMap(g => g.defs.map(d => d.label)),
                ...FIXED_SHORTCUTS.flatMap(g => g.keys.map(k => k.desc))) && (
                <Section id="keyboard" title="Keyboard Shortcuts" icon={Keyboard}>
                  {/* Double-escape setting */}
                  <div className="py-3 border-b border-pi-border/50">
                    <div className="text-sm text-pi-text">Double-Escape action</div>
                    <p className="text-xs text-pi-muted mt-1 mb-3">When you press Escape twice quickly with an empty input</p>
                    <div className="flex gap-2">
                      {(['tree', 'fork', 'none'] as DoubleEscapeAction[]).map((action) => (
                        <button
                          key={action}
                          onClick={() => updateSettings({ doubleEscapeAction: action })}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            settings.doubleEscapeAction === action
                              ? 'bg-pi-accent text-white' : 'bg-pi-bg text-pi-text hover:bg-pi-border'
                          }`}
                        >
                          {action === 'tree' ? '/tree' : action === 'fork' ? '/fork' : 'None'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Configurable hotkeys */}
                  <div className="py-3 space-y-4">
                    {groupedHotkeyDefs().map(({ category, defs }) => (
                      <div key={category}>
                        <div className="text-xs font-semibold text-pi-muted mb-2">{category}</div>
                        <div className="space-y-0.5">
                          {defs.map((def) => {
                            const currentBinding = getBinding(def.id, settings.hotkeyOverrides);
                            const isOverridden = !!settings.hotkeyOverrides[def.id];
                            const isRecording = recordingAction === def.id;

                            return (
                              <div key={def.id} className="flex items-center justify-between text-sm py-1.5">
                                <span className="text-pi-text">{def.label}</span>
                                <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                                  {isRecording ? (
                                    <kbd
                                      className="px-3 py-1 bg-pi-accent/20 border border-pi-accent rounded text-pi-accent font-mono text-xs animate-pulse cursor-pointer min-w-[80px] text-center"
                                      tabIndex={0}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.key === 'Escape') {
                                          setRecordingAction(null);
                                          return;
                                        }
                                        const binding = eventToBinding(e as unknown as KeyboardEvent);
                                        if (binding) {
                                          const overrides = { ...settings.hotkeyOverrides };
                                          if (binding === def.defaultKey) {
                                            delete overrides[def.id];
                                          } else {
                                            overrides[def.id] = binding;
                                          }
                                          updateSettings({ hotkeyOverrides: overrides });
                                          setRecordingAction(null);
                                        }
                                      }}
                                      onBlur={() => setRecordingAction(null)}
                                    >
                                      Press a key…
                                    </kbd>
                                  ) : (
                                    <button
                                      onClick={() => setRecordingAction(def.id)}
                                      className={`px-2 py-0.5 border rounded font-mono text-xs transition-colors min-w-[80px] text-center ${
                                        isOverridden
                                          ? 'bg-pi-accent/10 border-pi-accent/40 text-pi-accent hover:bg-pi-accent/20'
                                          : 'bg-pi-bg border-pi-border text-pi-text hover:border-pi-muted'
                                      }`}
                                      title="Click to rebind"
                                    >
                                      {formatBinding(currentBinding)}
                                    </button>
                                  )}
                                  {isOverridden && !isRecording && (
                                    <button
                                      onClick={() => {
                                        const overrides = { ...settings.hotkeyOverrides };
                                        delete overrides[def.id];
                                        updateSettings({ hotkeyOverrides: overrides });
                                      }}
                                      className="text-pi-muted hover:text-pi-text text-xs px-1"
                                      title="Reset to default"
                                    >
                                      ↺
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Fixed shortcuts reference */}
                    {FIXED_SHORTCUTS.map(({ category, keys }) => (
                      <div key={category}>
                        <div className="text-xs font-semibold text-pi-muted mb-2">{category}</div>
                        <div className="space-y-0.5">
                          {keys.map(({ key, desc }) => (
                            <div key={key + desc} className="flex items-center justify-between text-sm py-1.5">
                              <span className="text-pi-muted">{desc}</span>
                              <kbd className="px-2 py-0.5 bg-pi-bg border border-pi-border rounded text-pi-muted font-mono text-xs ml-4 flex-shrink-0 min-w-[80px] text-center">
                                {formatBinding(key)}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Notifications ── */}
              {shouldShowSection('notifications', 'notification', 'alert', 'bell') && (
                <Section id="notifications" title="Notifications" icon={Bell}>
                  <div className="py-3">
                    {notificationPermission === 'unsupported' ? (
                      <p className="text-sm text-pi-muted">Notifications are not supported in this browser.</p>
                    ) : notificationPermission === 'denied' ? (
                      <div className="flex items-start gap-2 text-sm">
                        <BellOff className="w-4 h-4 mt-0.5 text-pi-error flex-shrink-0" />
                        <p className="text-pi-muted">Notifications are blocked. Enable them in your browser settings.</p>
                      </div>
                    ) : notificationPermission === 'granted' ? (
                      <Toggle
                        enabled={settings.notificationsEnabled}
                        onChange={(v) => updateSettings({ notificationsEnabled: v })}
                        label="Enable notifications"
                        description="Get notified when tasks complete"
                      />
                    ) : (
                      <button
                        onClick={onRequestNotificationPermission}
                        className="flex items-center gap-2 px-3 py-2 bg-pi-bg hover:bg-pi-border text-pi-text text-sm rounded-md transition-colors"
                      >
                        <Bell className="w-4 h-4" />
                        Enable notifications
                      </button>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Models ── */}
              {shouldShowSection('models', 'model', 'scoped', 'cycling', 'ctrl+p', 'default',
                ...models.map(m => m.name), ...models.map(m => m.provider)) && (
                <Section id="models" title="Models" icon={Zap}>
                  {/* Default Model */}
                  <div className="py-3 border-b border-pi-border/50">
                    <p className="text-xs text-pi-muted mb-2">Default model for new sessions</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={settings.defaultModelKey || ''}
                        onChange={(e) => {
                          const key = e.target.value || null;
                          updateSettings({ defaultModelKey: key });
                        }}
                        className="flex-1 px-2 py-1.5 text-sm bg-pi-bg border border-pi-border rounded text-pi-text"
                      >
                        <option value="">Use pi default</option>
                        {models.map(m => (
                          <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                            {m.name} ({m.provider})
                          </option>
                        ))}
                      </select>
                      {settings.defaultModelKey && (
                        <select
                          value={settings.defaultThinkingLevel || 'off'}
                          onChange={(e) => updateSettings({ defaultThinkingLevel: e.target.value })}
                          className="px-2 py-1.5 text-sm bg-pi-bg border border-pi-border rounded text-pi-text flex-shrink-0"
                        >
                          {THINKING_LEVELS.map(level => (
                            <option key={level} value={level}>{level === 'off' ? 'No thinking' : level}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Scoped Models */}
                  <div className="py-3">
                    <p className="text-xs text-pi-muted mb-3">
                      Select models for <kbd className="px-1 bg-pi-bg border border-pi-border rounded font-mono">{formatBinding(getBinding('nextModel', settings.hotkeyOverrides))}</kbd> / <kbd className="px-1 bg-pi-bg border border-pi-border rounded font-mono">{formatBinding(getBinding('prevModel', settings.hotkeyOverrides))}</kbd> cycling. These are also pinned to the top of the model selector.
                      {enabledScopedCount > 0 && (
                        <span className="ml-1 text-pi-accent">{enabledScopedCount} selected</span>
                      )}
                    </p>

                    {modelSelections.length === 0 ? (
                      <p className="text-sm text-pi-muted py-4 text-center">No models available</p>
                    ) : (
                      <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                        {modelSelections.map((sel, index) => (
                          <div
                            key={`${sel.provider}:${sel.modelId}`}
                            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                              sel.enabled
                                ? 'bg-pi-accent/10'
                                : ''
                            }`}
                          >
                            {/* Checkbox + label — clickable to toggle */}
                            <div
                              onClick={() => toggleModel(index)}
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none"
                            >
                              <div
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  sel.enabled
                                    ? 'bg-pi-accent border-pi-accent'
                                    : 'border-pi-muted/60 bg-transparent hover:border-pi-muted'
                                }`}
                              >
                                {sel.enabled && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                              <div className={`min-w-0 text-sm truncate ${sel.enabled ? 'text-pi-text' : 'text-pi-muted'}`}>
                                {sel.modelName}
                                <span className="text-pi-muted/60 ml-1.5 text-[11px]">{sel.provider}</span>
                              </div>
                            </div>

                            {/* Thinking dropdown */}
                            {sel.enabled && (
                              <select
                                value={sel.thinkingLevel}
                                onChange={(e) => setModelThinkingLevel(index, e.target.value as ThinkingLevel)}
                                className="px-2 py-1 text-xs bg-pi-bg border border-pi-border rounded text-pi-text flex-shrink-0"
                              >
                                {THINKING_LEVELS.map(level => (
                                  <option key={level} value={level}>{level === 'off' ? 'No thinking' : level}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save / Clear */}
                    {modelSelections.length > 0 && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-pi-border/50">
                        <button
                          onClick={saveScopedModels}
                          disabled={!scopedModelsDirty}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            scopedModelsDirty
                              ? 'bg-pi-accent text-white hover:bg-pi-accent-hover'
                              : 'bg-pi-bg text-pi-muted cursor-default'
                          }`}
                        >
                          {scopedModelsDirty ? 'Save Changes' : 'Saved'}
                        </button>
                        <button
                          onClick={() => {
                            setModelSelections(prev => prev.map(s => ({ ...s, enabled: false })));
                            setScopedModelsDirty(true);
                          }}
                          className="px-3 py-1.5 text-sm text-pi-muted hover:text-pi-text border border-pi-border rounded-md transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Theme ── */}
              {shouldShowSection('theme', 'theme', 'dark', 'light', 'color', 'appearance',
                ...darkThemes.map(t => t.name), ...lightThemes.map(t => t.name)) && (
                <Section id="theme" title="Theme" icon={Palette}>
                  <div className="py-4">
                    <div className="mb-5">
                      <div className="text-xs text-pi-muted flex items-center gap-1.5 mb-2">
                        <Moon className="w-3 h-3" /><span>Dark</span>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {darkThemes.map((t) => <ThemeOption key={t.id} t={t} isActive={theme.id === t.id} onSelect={setTheme} />)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-pi-muted flex items-center gap-1.5 mb-2">
                        <Sun className="w-3 h-3" /><span>Light</span>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {lightThemes.map((t) => <ThemeOption key={t.id} t={t} isActive={theme.id === t.id} onSelect={setTheme} />)}
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* ── Environment (skills, extensions, context) ── */}
              {shouldShowSection('environment', 'environment', 'skill', 'extension', 'tool', 'context', 'agents', 'version', 'pi',
                ...(startupInfo?.skills.map(s => s.name) || []),
                ...(startupInfo?.extensions.map(e => e.name) || []),
                ...(startupInfo?.contextFiles || [])) && (
                <Section id="environment" title="Environment" icon={Package}>
                  <div className="py-3">
                    {startupInfo ? (
                      <>
                        {/* Version */}
                        <div className="pb-3 border-b border-pi-border/50">
                          <div className="text-sm text-pi-text">
                            Pi <span className="text-pi-muted">v{startupInfo.version}</span>
                          </div>
                        </div>

                        {/* Context files */}
                        {startupInfo.contextFiles.length > 0 && (
                          <div className="py-3 border-b border-pi-border/50">
                            <div className="text-xs font-semibold text-pi-muted mb-2 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              Context Files
                            </div>
                            {startupInfo.contextFiles.map((path, i) => (
                              <div key={i} className="text-sm text-pi-text font-mono truncate py-0.5" title={path}>
                                {shortenPath(path)}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Skills */}
                        <div className="py-3 border-b border-pi-border/50">
                          <div className="text-xs font-semibold text-pi-muted mb-2 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5" />
                            Skills
                            <span className="text-pi-muted/70">({startupInfo.skills.length})</span>
                          </div>
                          <ResourceList items={startupInfo.skills} />
                        </div>

                        {/* Extensions */}
                        <div className="py-3 border-b border-pi-border/50">
                          <div className="text-xs font-semibold text-pi-muted mb-2 flex items-center gap-1.5">
                            <Blocks className="w-3.5 h-3.5" />
                            Extensions
                            <span className="text-pi-muted/70">({startupInfo.extensions.length})</span>
                          </div>
                          <ResourceList items={startupInfo.extensions} />
                        </div>

                        {/* Themes (pi-level, not the app themes) */}
                        {startupInfo.themes.length > 0 && (
                          <div className="py-3">
                            <div className="text-xs font-semibold text-pi-muted mb-2 flex items-center gap-1.5">
                              <Palette className="w-3.5 h-3.5" />
                              Pi Themes
                              <span className="text-pi-muted/70">({startupInfo.themes.length})</span>
                            </div>
                            <ResourceList items={startupInfo.themes} />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-pi-muted py-4 text-center">No workspace active</p>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Developer ── */}
              {shouldShowSection('developer', 'developer', 'rebuild', 'restart', 'server', 'deploy') && (
                <Section id="developer" title="Developer" icon={Wrench}>
                  <div className="py-3">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={onDeploy}
                        disabled={deployStatus === 'building' || deployStatus === 'restarting'}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-md transition-colors w-fit ${
                          deployStatus === 'building' || deployStatus === 'restarting'
                            ? 'bg-pi-bg text-pi-muted cursor-wait'
                            : deployStatus === 'error'
                            ? 'bg-pi-error/20 text-pi-error hover:bg-pi-error/30'
                            : 'bg-pi-bg hover:bg-pi-border text-pi-text'
                        }`}
                      >
                        <RotateCw className={`w-4 h-4 ${deployStatus === 'building' || deployStatus === 'restarting' ? 'animate-spin' : ''}`} />
                        {deployStatus === 'building' ? 'Building...' :
                         deployStatus === 'restarting' ? 'Restarting...' :
                         'Rebuild & Restart Server'}
                      </button>
                      {deployMessage && (
                        <p className={`text-sm ${deployStatus === 'error' ? 'text-pi-error' : 'text-pi-muted'}`}>{deployMessage}</p>
                      )}
                      <p className="text-xs text-pi-muted">
                        Rebuilds the project and restarts the server. Use after making code changes.
                      </p>
                    </div>
                  </div>
                </Section>
              )}

              {/* No search results */}
              {isSearching && !CATEGORIES.some(({ id }) =>
                shouldShowSection(id, query)
              ) && (
                <div className="text-center py-12 text-pi-muted">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No settings match &ldquo;{searchQuery}&rdquo;</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
