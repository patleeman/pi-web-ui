import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Image, Send, Square } from 'lucide-react';
import type { ImageAttachment } from '@pi-web-ui/shared';

interface InputEditorProps {
  isStreaming: boolean;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onSteer: (message: string) => void;
  onFollowUp: (message: string) => void;
  onAbort: () => void;
}

export interface InputEditorHandle {
  addImageFile: (file: File) => void;
}

export const InputEditor = forwardRef<InputEditorHandle, InputEditorProps>(function InputEditor({
  isStreaming,
  initialValue = '',
  onValueChange,
  onSend,
  onSteer,
  onFollowUp,
  onAbort,
}, ref) {
  const [value, setValue] = useState(initialValue);
  
  // Debounce persisting value changes to avoid excessive localStorage writes
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onValueChangeRef.current?.(value);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;

    if (isStreaming) {
      // If streaming, use steer by default (interrupt)
      onSteer(trimmed);
    } else {
      onSend(trimmed, images.length > 0 ? images : undefined);
    }

    setValue('');
    onValueChange?.(''); // Clear persisted draft
    setImages([]);
    textareaRef.current?.focus();
  }, [value, images, isStreaming, onSend, onSteer, onValueChange]);

  const handleFollowUp = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !isStreaming) return;

    onFollowUp(trimmed);
    setValue('');
    textareaRef.current?.focus();
  }, [value, isStreaming, onFollowUp]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: new line
        return;
      }
      if (e.altKey && isStreaming) {
        // Alt+Enter while streaming: follow up
        e.preventDefault();
        handleFollowUp();
        return;
      }
      // Enter: submit
      e.preventDefault();
      handleSubmit();
    }
  };

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setImages((prev) => [
        ...prev,
        {
          type: 'image',
          source: {
            type: 'base64',
            mediaType: file.type,
            data: base64,
          },
        },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  // Expose addImageFile to parent via ref
  useImperativeHandle(ref, () => ({
    addImageFile,
  }), [addImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addImageFile(file);
        }
        break;
      }
    }
  }, [addImageFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        addImageFile(file);
      }
    }
  }, [addImageFile]);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex-shrink-0 border-t border-pi-border bg-pi-surface px-3 py-1.5 font-mono text-sm">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-1 mb-1 flex-wrap items-center">
          <span className="text-pi-muted">attached:</span>
          {images.map((img, index) => (
            <div
              key={index}
              className="relative group w-10 h-10 overflow-hidden border border-pi-border"
            >
              <img
                src={`data:${img.source.mediaType};base64,${img.source.data}`}
                alt="Attachment"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute inset-0 bg-pi-bg/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-pi-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Prompt indicator */}
        <span className="text-pi-accent py-1">&gt;</span>

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-pi-muted hover:text-pi-accent py-1"
          title="Attach image"
        >
          <Image className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              addImageFile(file);
            }
            e.target.value = '';
          }}
        />

        {/* Textarea */}
        <div
          className="flex-1"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isStreaming ? 'steer...' : 'message...'}
            rows={1}
            className={`w-full resize-none bg-transparent py-1 text-pi-text placeholder-pi-muted focus:outline-none ${
              isStreaming ? 'border-b border-pi-warning/50' : ''
            }`}
          />
        </div>

        {/* Action buttons */}
        {isStreaming ? (
          <button
            onClick={onAbort}
            className="text-pi-error hover:text-pi-error/80 py-1"
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && images.length === 0}
            className="text-pi-accent hover:text-pi-accent-hover disabled:opacity-30 disabled:cursor-not-allowed py-1"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});
