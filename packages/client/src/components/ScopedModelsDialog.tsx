import { useState, useEffect, useCallback } from 'react';
import { X, Check, Zap } from 'lucide-react';
import type { ModelInfo, ThinkingLevel, ScopedModelInfo } from '@pi-deck/shared';

interface ScopedModelsDialogProps {
  isOpen: boolean;
  models: ModelInfo[];
  scopedModels: ScopedModelInfo[];
  onSave: (models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) => void;
  onClose: () => void;
}

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

interface ModelSelection {
  provider: string;
  modelId: string;
  modelName: string;
  thinkingLevel: ThinkingLevel;
  enabled: boolean;
}

export function ScopedModelsDialog({ 
  isOpen, 
  models, 
  scopedModels,
  onSave, 
  onClose 
}: ScopedModelsDialogProps) {
  const [selections, setSelections] = useState<ModelSelection[]>([]);

  // Initialize selections from models and scopedModels
  useEffect(() => {
    if (isOpen) {
      const scopedMap = new Map(scopedModels.map(sm => [`${sm.provider}:${sm.modelId}`, sm]));
      
      setSelections(models.map(m => {
        const key = `${m.provider}:${m.id}`;
        const scoped = scopedMap.get(key);
        return {
          provider: m.provider,
          modelId: m.id,
          modelName: m.name,
          thinkingLevel: scoped?.thinkingLevel || 'off',
          enabled: scoped?.enabled || false,
        };
      }));
    }
  }, [isOpen, models, scopedModels]);

  // Toggle model enabled state
  const toggleModel = useCallback((index: number) => {
    setSelections(prev => prev.map((s, i) => 
      i === index ? { ...s, enabled: !s.enabled } : s
    ));
  }, []);

  // Change thinking level for a model
  const setThinkingLevel = useCallback((index: number, level: ThinkingLevel) => {
    setSelections(prev => prev.map((s, i) => 
      i === index ? { ...s, thinkingLevel: level } : s
    ));
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    const enabled = selections.filter(s => s.enabled);
    onSave(enabled.map(s => ({
      provider: s.provider,
      modelId: s.modelId,
      thinkingLevel: s.thinkingLevel,
    })));
    onClose();
  }, [selections, onSave, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [isOpen, onClose, handleSave]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const enabledCount = selections.filter(s => s.enabled).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[80vh] bg-pi-bg border border-pi-border rounded z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border flex-shrink-0">
          <div className="flex items-center gap-2 text-pi-text">
            <Zap className="w-4 h-4" />
            <span className="text-[14px]">Scoped Models</span>
            <span className="text-[12px] text-pi-muted">
              ({enabledCount} selected for Ctrl+P cycling)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-pi-muted hover:text-pi-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="px-4 py-2 text-[12px] text-pi-muted border-b border-pi-border">
          Select models to include in Ctrl+P / Shift+Ctrl+P cycling. 
          Set a thinking level for each model.
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto">
          {selections.length === 0 ? (
            <div className="p-4 text-pi-muted text-[14px] text-center">
              No models available
            </div>
          ) : (
            <div className="divide-y divide-pi-border">
              {selections.map((selection, index) => (
                <div
                  key={`${selection.provider}:${selection.modelId}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-pi-surface/50 ${
                    selection.enabled ? 'bg-pi-surface/30' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleModel(index)}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      selection.enabled 
                        ? 'bg-pi-accent border-pi-accent text-pi-bg' 
                        : 'border-pi-border hover:border-pi-muted'
                    }`}
                  >
                    {selection.enabled && <Check className="w-3 h-3" />}
                  </button>

                  {/* Model info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-pi-text truncate">
                      {selection.modelName}
                    </div>
                    <div className="text-[11px] text-pi-muted truncate">
                      {selection.provider}
                    </div>
                  </div>

                  {/* Thinking level selector */}
                  <select
                    value={selection.thinkingLevel}
                    onChange={(e) => setThinkingLevel(index, e.target.value as ThinkingLevel)}
                    disabled={!selection.enabled}
                    className={`px-2 py-1 text-[12px] bg-pi-surface border border-pi-border rounded ${
                      selection.enabled ? 'text-pi-text' : 'text-pi-muted opacity-50'
                    }`}
                  >
                    {THINKING_LEVELS.map(level => (
                      <option key={level} value={level}>
                        {level === 'off' ? 'Off' : level}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-pi-border flex items-center justify-between">
          <div className="text-[11px] text-pi-muted">
            ⌘Enter to save
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clear all selections
                setSelections(prev => prev.map(s => ({ ...s, enabled: false })));
              }}
              className="px-3 py-1.5 text-[12px] text-pi-muted hover:text-pi-text border border-pi-border rounded"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-pi-muted hover:text-pi-text border border-pi-border rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-[12px] text-pi-bg bg-pi-accent hover:bg-pi-accent-hover rounded"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
