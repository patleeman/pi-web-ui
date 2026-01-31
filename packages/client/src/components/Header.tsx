import { useState } from 'react';
import { ChevronDown, Brain, Zap } from 'lucide-react';
import type { ModelInfo, SessionState, ThinkingLevel } from '@pi-web-ui/shared';

interface HeaderProps {
  state: SessionState | null;
  models: ModelInfo[];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
}

const THINKING_LEVELS: { value: ThinkingLevel; label: string; icon: string }[] = [
  { value: 'off', label: 'Off', icon: '○' },
  { value: 'minimal', label: 'Minimal', icon: '◔' },
  { value: 'low', label: 'Low', icon: '◑' },
  { value: 'medium', label: 'Medium', icon: '◕' },
  { value: 'high', label: 'High', icon: '●' },
  { value: 'xhigh', label: 'XHigh', icon: '◉' },
];

export function Header({ state, models, onSetModel, onSetThinkingLevel }: HeaderProps) {
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

  return (
    <header className="flex-shrink-0 border-b border-pi-border bg-pi-surface px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo and title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-pi-accent/20 flex items-center justify-center">
            <span className="text-pi-accent font-bold text-lg">π</span>
          </div>
          <div>
            <h1 className="font-semibold text-pi-text">Pi Web UI</h1>
            <p className="text-xs text-pi-muted">Coding Agent</p>
          </div>
        </div>

        {/* Model and thinking controls */}
        <div className="flex items-center gap-3">
          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowModelDropdown(!showModelDropdown);
                setShowThinkingDropdown(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pi-bg border border-pi-border hover:border-pi-accent/50 transition-colors"
            >
              <Zap className="w-4 h-4 text-pi-accent" />
              <span className="text-sm">
                {state?.model?.name || 'No model'}
              </span>
              <ChevronDown className="w-4 h-4 text-pi-muted" />
            </button>

            {showModelDropdown && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-pi-surface border border-pi-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                  <div key={provider}>
                    <div className="px-3 py-2 text-xs font-medium text-pi-muted uppercase border-b border-pi-border bg-pi-bg/50">
                      {provider}
                    </div>
                    {providerModels.map((model) => (
                      <button
                        key={`${model.provider}-${model.id}`}
                        onClick={() => {
                          onSetModel(model.provider, model.id);
                          setShowModelDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-pi-bg transition-colors flex items-center justify-between ${
                          state?.model?.id === model.id ? 'bg-pi-accent/10 text-pi-accent' : ''
                        }`}
                      >
                        <span className="text-sm">{model.name}</span>
                        <div className="flex items-center gap-2 text-xs text-pi-muted">
                          {model.reasoning && (
                            <Brain className="w-3 h-3" />
                          )}
                          <span>{Math.round(model.contextWindow / 1000)}k</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thinking level selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowThinkingDropdown(!showThinkingDropdown);
                setShowModelDropdown(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pi-bg border border-pi-border hover:border-pi-accent/50 transition-colors"
            >
              <Brain className="w-4 h-4 text-pi-accent" />
              <span className="text-sm">{currentThinking.label}</span>
              <span className="text-pi-muted">{currentThinking.icon}</span>
              <ChevronDown className="w-4 h-4 text-pi-muted" />
            </button>

            {showThinkingDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-pi-surface border border-pi-border rounded-lg shadow-xl z-50">
                {THINKING_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => {
                      onSetThinkingLevel(level.value);
                      setShowThinkingDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-pi-bg transition-colors flex items-center justify-between ${
                      state?.thinkingLevel === level.value ? 'bg-pi-accent/10 text-pi-accent' : ''
                    }`}
                  >
                    <span className="text-sm">{level.label}</span>
                    <span className="text-pi-muted">{level.icon}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
