import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Square, Image, X } from 'lucide-react';
import type { ImageAttachment } from '@pi-web-ui/shared';

interface InputEditorProps {
  isStreaming: boolean;
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
  onSend,
  onSteer,
  onFollowUp,
  onAbort,
}, ref) {
  const [value, setValue] = useState('');
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
    setImages([]);
    textareaRef.current?.focus();
  }, [value, images, isStreaming, onSend, onSteer]);

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
    <div className="flex-shrink-0 border-t border-pi-border bg-pi-surface p-4">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {images.map((img, index) => (
            <div
              key={index}
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-pi-border"
            >
              <img
                src={`data:${img.source.mediaType};base64,${img.source.data}`}
                alt="Attachment"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-pi-bg/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-pi-error"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 p-2 rounded-lg border border-pi-border hover:border-pi-accent/50 hover:bg-pi-bg transition-colors text-pi-muted hover:text-pi-accent"
          title="Attach image"
        >
          <Image className="w-5 h-5" />
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
          className={`flex-1 rounded-lg border bg-pi-bg transition-colors ${
            isStreaming
              ? 'border-pi-warning/50'
              : 'border-pi-border focus-within:border-pi-accent/50'
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isStreaming
                ? 'Enter to steer, Alt+Enter for follow-up...'
                : 'Type a message... (Shift+Enter for new line)'
            }
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3 text-pi-text placeholder-pi-muted focus:outline-none"
          />
        </div>

        {/* Action buttons */}
        {isStreaming ? (
          <button
            onClick={onAbort}
            className="flex-shrink-0 p-3 rounded-lg bg-pi-error/20 hover:bg-pi-error/30 transition-colors text-pi-error"
            title="Stop"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && images.length === 0}
            className="flex-shrink-0 p-3 rounded-lg bg-pi-accent hover:bg-pi-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
            title="Send"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Help text */}
      <div className="mt-2 text-xs text-pi-muted">
        {isStreaming ? (
          <span>
            <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Enter</kbd> to steer (interrupt) •{' '}
            <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Alt+Enter</kbd> for follow-up •{' '}
            <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Esc</kbd> to stop
          </span>
        ) : (
          <span>
            <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Enter</kbd> to send •{' '}
            <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Shift+Enter</kbd> for new line •{' '}
            Paste images with <kbd className="px-1 py-0.5 rounded bg-pi-bg border border-pi-border">Ctrl+V</kbd>
          </span>
        )}
      </div>
    </div>
  );
});
