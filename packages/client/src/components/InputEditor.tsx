import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Image, Send, Square, Command, FileText, Wand2 } from 'lucide-react';
import type { ImageAttachment, SlashCommand } from '@pi-web-ui/shared';

interface InputEditorProps {
  isStreaming: boolean;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onSteer: (message: string) => void;
  onFollowUp: (message: string) => void;
  onAbort: () => void;
  commands?: SlashCommand[];
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
  commands = [],
}, ref) {
  const [value, setValue] = useState(initialValue);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
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
  const commandsRef = useRef<HTMLDivElement>(null);

  // Calculate which slash command prefix is being typed
  const slashMatch = useMemo(() => {
    // Check if input starts with /
    if (!value.startsWith('/')) return null;
    // Extract the command being typed (up to first space or end)
    const spaceIndex = value.indexOf(' ');
    const prefix = spaceIndex === -1 ? value.slice(1) : value.slice(1, spaceIndex);
    return { prefix, hasSpace: spaceIndex !== -1 };
  }, [value]);

  // Filter commands based on prefix
  const filteredCommands = useMemo(() => {
    if (!slashMatch || slashMatch.hasSpace) return [];
    const prefix = slashMatch.prefix.toLowerCase();
    return commands.filter((cmd) =>
      cmd.name.toLowerCase().includes(prefix) ||
      cmd.description?.toLowerCase().includes(prefix)
    ).slice(0, 10); // Limit to 10 results
  }, [commands, slashMatch]);

  // Show/hide commands popup
  useEffect(() => {
    if (slashMatch && !slashMatch.hasSpace && filteredCommands.length > 0) {
      setShowCommands(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [slashMatch, filteredCommands.length]);

  // Scroll selected command into view
  useEffect(() => {
    if (showCommands && commandsRef.current) {
      const selected = commandsRef.current.children[selectedCommandIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedCommandIndex, showCommands]);

  const insertCommand = useCallback((command: SlashCommand) => {
    setValue(`/${command.name} `);
    setShowCommands(false);
    textareaRef.current?.focus();
  }, []);

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
    // Handle command selection keyboard navigation
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

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

  // Helper to get icon for command source
  const getCommandIcon = (source: SlashCommand['source']) => {
    switch (source) {
      case 'skill':
        return <Wand2 className="w-3.5 h-3.5" />;
      case 'template':
        return <FileText className="w-3.5 h-3.5" />;
      case 'extension':
        return <Command className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-pi-border bg-pi-surface px-2 md:px-3 py-1.5 font-mono text-sm relative">
      {/* Slash command autocomplete popup */}
      {showCommands && filteredCommands.length > 0 && (
        <div
          ref={commandsRef}
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 md:mx-3 max-h-64 overflow-y-auto bg-pi-bg border border-pi-border shadow-lg z-10 font-mono text-sm"
        >
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.name}
              onClick={() => insertCommand(cmd)}
              onMouseEnter={() => setSelectedCommandIndex(index)}
              className={`w-full px-3 py-2 flex items-start gap-3 text-left hover:bg-pi-surface transition-colors ${
                index === selectedCommandIndex ? 'bg-pi-surface' : ''
              }`}
            >
              <span className="text-pi-muted mt-0.5 flex-shrink-0">
                {getCommandIcon(cmd.source)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-pi-accent">/{cmd.name}</span>
                  <span className="text-xs text-pi-muted opacity-60">{cmd.source}</span>
                </div>
                {cmd.description && (
                  <div className="text-pi-muted text-xs truncate mt-0.5">
                    {cmd.description}
                  </div>
                )}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 text-xs text-pi-muted border-t border-pi-border flex items-center gap-4">
            <span>↑↓ navigate</span>
            <span>Tab/Enter select</span>
            <span>Esc close</span>
          </div>
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-1 mb-1 flex-wrap items-center">
          <span className="text-pi-muted text-xs md:text-sm">attached:</span>
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
                className="absolute inset-0 bg-pi-bg/80 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center justify-center text-pi-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 md:gap-2 items-end">
        {/* Prompt indicator */}
        <span className="text-pi-accent py-1">&gt;</span>

        {/* Textarea */}
        <div
          className="flex-1 min-w-0"
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
            className={`w-full resize-none bg-transparent py-1 text-pi-text placeholder-pi-muted focus:outline-none text-base md:text-sm ${
              isStreaming ? 'border-b border-pi-warning/50' : ''
            }`}
            style={{ fontSize: '16px' }} // Prevents iOS zoom on focus
          />
        </div>

        {/* Image upload button - larger tap target on mobile */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-pi-muted hover:text-pi-accent active:text-pi-accent p-1 -m-0.5"
          title="Attach image"
        >
          <Image className="w-5 h-5 md:w-4 md:h-4" />
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

        {/* Action buttons - larger tap targets on mobile */}
        {isStreaming ? (
          <>
            {/* Steer button - send message while agent is working */}
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="text-pi-warning hover:text-pi-warning/80 active:text-pi-warning/80 disabled:opacity-30 disabled:cursor-not-allowed p-1 -m-0.5"
              title="Steer (send while agent is working)"
            >
              <Send className="w-5 h-5 md:w-4 md:h-4" />
            </button>
            {/* Stop button */}
            <button
              onClick={onAbort}
              className="text-pi-error hover:text-pi-error/80 active:text-pi-error/80 p-1 -m-0.5"
              title="Stop"
            >
              <Square className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && images.length === 0}
            className="text-pi-accent hover:text-pi-accent-hover active:text-pi-accent-hover disabled:opacity-30 disabled:cursor-not-allowed p-1 -m-0.5"
            title="Send"
          >
            <Send className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        )}
      </div>
    </div>
  );
});
