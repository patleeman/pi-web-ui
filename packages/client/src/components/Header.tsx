import { useState } from 'react';
import { Menu } from 'lucide-react';
import type { ModelInfo, SessionState, ThinkingLevel } from '@pi-web-ui/shared';

interface HeaderProps {
  state: SessionState | null;
  models: ModelInfo[];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  isMobile?: boolean;
  onToggleSidebar?: () => void;
}

const THINKING_LEVELS: { value: ThinkingLevel; label: string; icon: string }[] = [
  { value: 'off', label: 'Off', icon: '○' },
  { value: 'minimal', label: 'Minimal', icon: '◔' },
  { value: 'low', label: 'Low', icon: '◑' },
  { value: 'medium', label: 'Medium', icon: '◕' },
  { value: 'high', label: 'High', icon: '●' },
  { value: 'xhigh', label: 'XHigh', icon: '◉' },
];

export function Header({ state, models, onSetModel, onSetThinkingLevel, isMobile = false, onToggleSidebar }: HeaderProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showThinkingDropdown, setShowThinkingDropdown] = useState(false);

  const currentThinking = THINKING_LEVELS.find((t) => t.value === state?.thinkingLevel) || THINKING_LEVELS[0];

  // Group models by provider
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>);

  // Close dropdowns when clicking outside
  const closeDropdowns = () => {
    setShowModelDropdown(false);
    setShowThinkingDropdown(false);
  };

  return (
    <header className="flex-shrink-0 border-b border-pi-border bg-pi-surface px-2 md:px-3 py-1">
      <div className="flex items-center justify-between gap-2">
        {/* Mobile menu button + Logo */}
        <div className="flex items-center gap-2 text-sm min-w-0">
          {isMobile && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1 text-pi-muted hover:text-pi-accent transition-colors"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <span className="text-pi-accent font-mono">π</span>
          <span className="text-pi-muted hidden sm:inline">/</span>
          <span className="text-pi-text hidden sm:inline truncate">pi-web-ui</span>
        </div>

        {/* Model and thinking controls */}
        <div className="flex items-center gap-1 md:gap-2 text-sm flex-shrink-0">
          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowModelDropdown(!showModelDropdown);
                setShowThinkingDropdown(false);
              }}
              className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 bg-pi-bg border border-pi-border hover:border-pi-accent/50 font-mono text-xs md:text-sm"
            >
              <span className="text-pi-accent">⚡</span>
              <span className="max-w-[80px] md:max-w-none truncate">{state?.model?.name || 'No model'}</span>
              <span className="text-pi-muted">▾</span>
            </button>

            {showModelDropdown && (
              <>
                {/* Backdrop for mobile */}
                <div
                  className="fixed inset-0 z-40 md:hidden"
                  onClick={closeDropdowns}
                />
                <div className="absolute right-0 top-full mt-0.5 w-64 md:w-64 bg-pi-surface border border-pi-border z-50 max-h-[60vh] md:max-h-80 overflow-y-auto">
                  {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                    <div key={provider}>
                      <div className="px-2 py-1.5 md:py-1 text-xs text-pi-muted border-b border-pi-border bg-pi-bg/50 font-mono sticky top-0">
                        {provider}
                      </div>
                      {providerModels.map((model) => (
                        <button
                          key={`${model.provider}-${model.id}`}
                          onClick={() => {
                            onSetModel(model.provider, model.id);
                            setShowModelDropdown(false);
                          }}
                          className={`w-full text-left px-2 py-2 md:py-1 hover:bg-pi-bg active:bg-pi-bg transition-colors flex items-center justify-between font-mono text-sm ${
                            state?.model?.id === model.id ? 'bg-pi-accent/10 text-pi-accent' : ''
                          }`}
                        >
                          <span className="truncate">{model.name}</span>
                          <span className="text-xs text-pi-muted flex-shrink-0 ml-2">
                            {model.reasoning && '🧠 '}
                            {Math.round(model.contextWindow / 1000)}k
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Thinking level selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowThinkingDropdown(!showThinkingDropdown);
                setShowModelDropdown(false);
              }}
              className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 bg-pi-bg border border-pi-border hover:border-pi-accent/50 font-mono text-xs md:text-sm"
            >
              <span className="text-pi-accent">{currentThinking.icon}</span>
              <span className="hidden sm:inline">{currentThinking.label}</span>
              <span className="text-pi-muted">▾</span>
            </button>

            {showThinkingDropdown && (
              <>
                {/* Backdrop for mobile */}
                <div
                  className="fixed inset-0 z-40 md:hidden"
                  onClick={closeDropdowns}
                />
                <div className="absolute right-0 top-full mt-0.5 w-32 bg-pi-surface border border-pi-border z-50">
                  {THINKING_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => {
                        onSetThinkingLevel(level.value);
                        setShowThinkingDropdown(false);
                      }}
                      className={`w-full text-left px-2 py-2 md:py-1 hover:bg-pi-bg active:bg-pi-bg transition-colors flex items-center justify-between font-mono text-sm ${
                        state?.thinkingLevel === level.value ? 'bg-pi-accent/10 text-pi-accent' : ''
                      }`}
                    >
                      <span>{level.icon} {level.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
