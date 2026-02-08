import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ExtensionUIRequest, ExtensionUIResponse, ExtensionUISelectOption, ExtensionUISelectRequest, ExtensionUIConfirmRequest, ExtensionUIInputRequest, ExtensionUIEditorRequest } from '@pi-deck/shared';
import { CodeMirrorEditor } from './CodeMirrorEditor';

interface ExtensionUIDialogProps {
  request: ExtensionUIRequest;
  onResponse: (response: ExtensionUIResponse) => void;
}

type RequestWithId = ExtensionUISelectRequest | ExtensionUIConfirmRequest | ExtensionUIInputRequest | ExtensionUIEditorRequest;

// Type guard to check if request has requestId (all except notify)
function hasRequestId(request: ExtensionUIRequest): request is RequestWithId {
  return request.method !== 'notify';
}

/**
 * Dialog for handling extension UI requests (select, confirm, input, editor).
 * Used by extension commands like /review that need user interaction.
 */
export function ExtensionUIDialog({ request, onResponse }: ExtensionUIDialogProps) {
  // Get requestId safely - empty string for notify (which won't be used)
  const requestId = hasRequestId(request) ? request.requestId : '';

  const handleCancel = useCallback(() => {
    onResponse({ requestId, cancelled: true });
  }, [requestId, onResponse]);

  const handleSubmit = useCallback((value: string | boolean) => {
    onResponse({ requestId, cancelled: false, value });
  }, [requestId, onResponse]);

  // Don't render for notify requests (they're handled elsewhere)
  if (request.method === 'notify') {
    return null;
  }

  // Render appropriate dialog based on method
  switch (request.method) {
    case 'select':
      return (
        <SelectDialog
          title={request.title}
          options={request.options}
          timeout={request.timeout}
          onSelect={handleSubmit}
          onCancel={handleCancel}
        />
      );
    case 'confirm':
      return (
        <ConfirmDialog
          title={request.title}
          message={request.message}
          timeout={request.timeout}
          onConfirm={() => handleSubmit(true)}
          onCancel={handleCancel}
        />
      );
    case 'input':
      return (
        <InputDialog
          title={request.title}
          placeholder={request.placeholder}
          timeout={request.timeout}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      );
    case 'editor':
      return (
        <EditorDialog
          title={request.title}
          prefill={request.prefill}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      );
    default:
      return null;
  }
}

// ============================================================================
// Select Dialog
// ============================================================================

interface SelectDialogProps {
  title: string;
  options: string[] | ExtensionUISelectOption[];
  timeout?: number;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

function SelectDialog({ title, options: rawOptions, timeout, onSelect, onCancel }: SelectDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(timeout);

  // Normalize options to rich format
  const options: ExtensionUISelectOption[] = useMemo(() => {
    if (rawOptions.length === 0) return [];
    if (typeof rawOptions[0] === 'string') {
      return (rawOptions as string[]).map(opt => ({ value: opt, label: opt }));
    }
    return rawOptions as ExtensionUISelectOption[];
  }, [rawOptions]);

  // Timeout countdown
  useEffect(() => {
    if (!timeout) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(t => {
        if (t && t <= 1000) {
          onCancel();
          return 0;
        }
        return t ? t - 1000 : undefined;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeout, onCancel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, options.length - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(options[selectedIndex].label);
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
        default:
          // Number keys for quick selection
          const num = parseInt(e.key);
          if (num >= 1 && num <= options.length) {
            onSelect(options[num - 1].label);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [options, selectedIndex, onSelect, onCancel]);

  return (
    <div className="w-full bg-pi-bg border border-pi-border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pi-border flex items-center justify-between">
        <h2 className="text-pi-text font-medium">{title}</h2>
        {timeRemaining && (
          <span className="text-pi-muted text-sm">
            {Math.ceil(timeRemaining / 1000)}s
          </span>
        )}
      </div>

      {/* Options */}
      <div className="py-2 max-h-80 overflow-y-auto">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(option.label)}
            className={`w-full px-4 py-2 text-left flex items-start gap-3 transition-colors ${
              i === selectedIndex
                ? 'bg-pi-accent/20 text-pi-text'
                : 'text-pi-muted hover:bg-pi-surface hover:text-pi-text'
            }`}
          >
            <span className="text-pi-accent w-5 text-sm flex-shrink-0">{i + 1}.</span>
            <div className="min-w-0">
              <div className="truncate">{option.label}</div>
              {option.description && (
                <div className="text-xs text-pi-muted mt-0.5 truncate">{option.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-pi-border text-xs text-pi-muted">
        ↑↓ navigate • Enter select • 1-{options.length} quick select • Esc cancel
      </div>
    </div>
  );
}

// ============================================================================
// Confirm Dialog
// ============================================================================

interface ConfirmDialogProps {
  title: string;
  message: string;
  timeout?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, timeout, onConfirm, onCancel }: ConfirmDialogProps) {
  const [timeRemaining, setTimeRemaining] = useState(timeout);
  const [focusedButton, setFocusedButton] = useState<'yes' | 'no'>('yes');

  // Timeout countdown
  useEffect(() => {
    if (!timeout) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(t => {
        if (t && t <= 1000) {
          onCancel();
          return 0;
        }
        return t ? t - 1000 : undefined;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeout, onCancel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Tab':
          e.preventDefault();
          setFocusedButton(f => f === 'yes' ? 'no' : 'yes');
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedButton === 'yes') {
            onConfirm();
          } else {
            onCancel();
          }
          break;
        case 'y':
        case 'Y':
          e.preventDefault();
          onConfirm();
          break;
        case 'n':
        case 'N':
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusedButton, onConfirm, onCancel]);

  return (
    <div className="w-full bg-pi-bg border border-pi-border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pi-border flex items-center justify-between">
        <h2 className="text-pi-text font-medium">{title}</h2>
        {timeRemaining && (
          <span className="text-pi-muted text-sm">
            {Math.ceil(timeRemaining / 1000)}s
          </span>
        )}
      </div>

      {/* Message */}
      <div className="px-4 py-4 text-pi-text">
        {message}
      </div>

      {/* Buttons */}
      <div className="px-4 py-3 border-t border-pi-border flex justify-end gap-2">
        <button
          onClick={onCancel}
          className={`px-4 py-2 rounded transition-colors ${
            focusedButton === 'no'
              ? 'bg-pi-surface text-pi-text ring-2 ring-pi-accent'
              : 'text-pi-muted hover:text-pi-text hover:bg-pi-surface'
          }`}
        >
          No
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 rounded transition-colors ${
            focusedButton === 'yes'
              ? 'bg-pi-accent text-white ring-2 ring-pi-accent'
              : 'bg-pi-accent/50 text-white/80 hover:bg-pi-accent'
          }`}
        >
          Yes
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-pi-border text-xs text-pi-muted">
        Y/N or ←→ and Enter
      </div>
    </div>
  );
}

// ============================================================================
// Input Dialog
// ============================================================================

interface InputDialogProps {
  title: string;
  placeholder?: string;
  timeout?: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function InputDialog({ title, placeholder, timeout, onSubmit, onCancel }: InputDialogProps) {
  const [value, setValue] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(timeout);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Timeout countdown
  useEffect(() => {
    if (!timeout) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(t => {
        if (t && t <= 1000) {
          onCancel();
          return 0;
        }
        return t ? t - 1000 : undefined;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeout, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onSubmit(value.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="w-full bg-pi-bg border border-pi-border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pi-border flex items-center justify-between">
        <h2 className="text-pi-text font-medium">{title}</h2>
        {timeRemaining && (
          <span className="text-pi-muted text-sm">
            {Math.ceil(timeRemaining / 1000)}s
          </span>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-4">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Enter text...'}
          className="w-full bg-pi-surface border border-pi-border rounded px-3 py-2 text-pi-text placeholder-pi-muted focus:outline-none focus:ring-2 focus:ring-pi-accent"
        />
      </div>

      {/* Buttons */}
      <div className="px-4 py-3 border-t border-pi-border flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-pi-muted hover:text-pi-text hover:bg-pi-surface transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => value.trim() && onSubmit(value.trim())}
          disabled={!value.trim()}
          className="px-4 py-2 rounded bg-pi-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pi-accent/80 transition-colors"
        >
          Submit
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-pi-border text-xs text-pi-muted">
        Enter to submit • Esc to cancel
      </div>
    </div>
  );
}

// ============================================================================
// Editor Dialog (Multi-line text)
// ============================================================================

interface EditorDialogProps {
  title: string;
  prefill?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function EditorDialog({ title, prefill, onSubmit, onCancel }: EditorDialogProps) {
  const [value, setValue] = useState(prefill || '');

  return (
    <div className="w-full bg-pi-bg border border-pi-border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pi-border">
        <h2 className="text-pi-text font-medium">{title}</h2>
      </div>

      {/* Editor */}
      <div className="p-4">
        <div className="h-64 rounded overflow-hidden">
          <CodeMirrorEditor
            value={value}
            onChange={setValue}
            language="markdown"
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="px-4 py-3 border-t border-pi-border flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-pi-muted hover:text-pi-text hover:bg-pi-surface transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(value)}
          className="px-4 py-2 rounded bg-pi-accent text-white hover:bg-pi-accent/80 transition-colors"
        >
          Submit
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-pi-border text-xs text-pi-muted">
        Esc to cancel
      </div>
    </div>
  );
}
