import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { SessionInfo, ImageAttachment, SlashCommand as BackendSlashCommand, ModelInfo, ThinkingLevel } from '@pi-web-ui/shared';
import type { PaneData } from '../hooks/usePanes';
import { MessageList } from './MessageList';
import { SlashMenu, SlashCommand } from './SlashMenu';
import { QuestionnaireUI } from './QuestionnaireUI';
import { X, ChevronDown } from 'lucide-react';

interface PaneProps {
  pane: PaneData;
  isFocused: boolean;
  sessions: SessionInfo[];
  models: ModelInfo[];
  backendCommands: BackendSlashCommand[];
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSendPrompt: (message: string, images?: ImageAttachment[]) => void;
  onSteer: (message: string) => void;
  onAbort: () => void;
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  onSplit: (direction: 'vertical' | 'horizontal') => void;
  onGetForkMessages: () => void;
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  onQuestionnaireResponse: (questionId: string, response: string) => void;
}

// Built-in pane commands (UI-only)
const PANE_COMMANDS: SlashCommand[] = [
  { cmd: '/split', desc: 'Split pane vertically', action: 'vsplit' },
  { cmd: '/hsplit', desc: 'Split pane horizontally', action: 'hsplit' },
  { cmd: '/close', desc: 'Close this pane', action: 'close' },
  { cmd: '/stop', desc: 'Stop the agent', action: 'stop' },
];

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-pi-success',
  paused: 'bg-pi-warning',
  done: 'bg-pi-muted',
  idle: 'bg-pi-idle',
  error: 'bg-pi-error',
};

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

// Convert file to base64 image attachment
async function fileToImageAttachment(file: File): Promise<ImageAttachment | null> {
  if (!file.type.startsWith('image/')) return null;
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({
        type: 'image',
        source: {
          type: 'base64',
          mediaType: file.type,
          data: base64,
        },
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function Pane({
  pane,
  isFocused,
  sessions,
  models,
  backendCommands,
  canClose,
  onFocus,
  onClose,
  onSendPrompt,
  onSteer,
  onAbort,
  onLoadSession,
  onNewSession,
  onSplit,
  onGetForkMessages,
  onSetModel,
  onSetThinkingLevel,
  onQuestionnaireResponse,
}: PaneProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showThinkingMenu, setShowThinkingMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // Get slot data
  const slot = pane.slot;
  const messages = slot?.messages || [];
  const isStreaming = slot?.isStreaming || false;
  const streamingText = slot?.streamingText || '';
  const streamingThinking = slot?.streamingThinking || '';
  const state = slot?.state;
  const activeToolExecutions = slot?.activeToolExecutions || [];
  const questionnaireRequest = state?.questionnaireRequest;

  // Get current model and thinking level
  const currentModel = state?.model;
  const currentThinking = state?.thinkingLevel || 'off';

  // Get session status
  const sessionStatus = isStreaming ? 'running' : (state?.sessionId ? 'idle' : 'idle');

  // Get session title from first user message or session ID
  const sessionTitle = messages.find(m => m.role === 'user')?.content
    .find(c => c.type === 'text')?.text?.slice(0, 50) || 
    state?.sessionId?.slice(0, 12) || 'New session';

  // Merge pane commands with backend commands
  const allCommands = useMemo(() => {
    const cmds: SlashCommand[] = [...PANE_COMMANDS];
    
    // Add backend commands
    for (const bc of backendCommands) {
      cmds.push({
        cmd: `/${bc.name}`,
        desc: bc.description || bc.source,
        action: `backend:${bc.name}`,
      });
    }
    
    // Add resume command for sessions
    if (sessions.length > 0) {
      cmds.push({
        cmd: '/resume',
        desc: 'Resume a previous session',
        action: 'resume',
      });
    }
    
    // Add new session command
    cmds.push({
      cmd: '/new',
      desc: 'Start a new session',
      action: 'new',
    });
    
    // Add fork command
    cmds.push({
      cmd: '/fork',
      desc: 'Fork from a previous message',
      action: 'fork',
    });
    
    return cmds;
  }, [backendCommands, sessions.length]);

  // Filter commands based on input - simple prefix/substring match on command name only
  const filteredCommands = useMemo(() => {
    if (!slashFilter || slashFilter === '/') return allCommands;
    
    // Remove leading slash for matching
    const query = slashFilter.startsWith('/') ? slashFilter.slice(1).toLowerCase() : slashFilter.toLowerCase();
    if (!query) return allCommands;
    
    // Filter and sort: exact prefix matches first, then substring matches
    const prefixMatches: SlashCommand[] = [];
    const substringMatches: SlashCommand[] = [];
    
    for (const c of allCommands) {
      const cmdName = (c.cmd.startsWith('/') ? c.cmd.slice(1) : c.cmd).toLowerCase();
      
      if (cmdName.startsWith(query)) {
        prefixMatches.push(c);
      } else if (cmdName.includes(query)) {
        substringMatches.push(c);
      }
    }
    
    return [...prefixMatches, ...substringMatches];
  }, [allCommands, slashFilter]);

  // Session list for /resume
  const [showResumeMenu, setShowResumeMenu] = useState(false);
  const [resumeFilter, setResumeFilter] = useState('');
  const filteredSessions = useMemo(() => {
    if (!resumeFilter) return sessions;
    const lower = resumeFilter.toLowerCase();
    return sessions.filter(s => 
      s.name?.toLowerCase().includes(lower) ||
      s.firstMessage?.toLowerCase().includes(lower) ||
      s.id.toLowerCase().includes(lower)
    );
  }, [sessions, resumeFilter]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  // Focus input when pane becomes focused
  useEffect(() => {
    if (isFocused && !questionnaireRequest) {
      // Use setTimeout to ensure DOM is ready (especially for new panes)
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isFocused, questionnaireRequest]);

  // Handle image drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    for (const file of imageFiles) {
      const attachment = await fileToImageAttachment(file);
      if (attachment) {
        setAttachedImages(prev => [...prev, attachment]);
        const previewUrl = URL.createObjectURL(file);
        setImagePreviews(prev => [...prev, previewUrl]);
      }
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (val.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashFilter(val);
      setSelectedCmdIdx(0);
      setShowResumeMenu(false);
    } else {
      setShowSlashMenu(false);
      setShowResumeMenu(false);
    }
  };

  const executeCommand = (action: string) => {
    switch (action) {
      case 'vsplit':
        onSplit('vertical');
        break;
      case 'hsplit':
        onSplit('horizontal');
        break;
      case 'close':
        if (canClose) onClose();
        break;
      case 'new':
        onNewSession();
        break;
      case 'stop':
        onAbort();
        break;
      case 'fork':
        onGetForkMessages();
        break;
      case 'resume':
        setShowSlashMenu(false);
        setShowResumeMenu(true);
        setResumeFilter('');
        setInputValue('');
        return; // Don't clear input yet
      default:
        // Backend command
        if (action.startsWith('backend:')) {
          const cmdName = action.slice(8);
          // Send as a prompt with the command
          onSendPrompt(`/${cmdName}`);
        }
        break;
    }
    setShowSlashMenu(false);
    setShowResumeMenu(false);
    setInputValue('');
  };

  const selectSession = (sessionId: string) => {
    onLoadSession(sessionId);
    setShowResumeMenu(false);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    
    // Resume menu navigation
    if (showResumeMenu && filteredSessions.length > 0) {
      if (key === 'ArrowDown' || key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i + 1) % filteredSessions.length);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i - 1 + filteredSessions.length) % filteredSessions.length);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        selectSession(filteredSessions[selectedCmdIdx].id);
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowResumeMenu(false);
        setInputValue('');
        return;
      }
    }

    // Slash menu navigation
    if (showSlashMenu && filteredCommands.length > 0) {
      if (key === 'ArrowDown' || key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i + 1) % filteredCommands.length);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        executeCommand(filteredCommands[selectedCmdIdx].action);
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowSlashMenu(false);
        setInputValue('');
        return;
      }
    }

    // Escape to clear input
    if (key === 'Escape') {
      e.preventDefault();
      setInputValue('');
      return;
    }

    // Send message
    if (key === 'Enter' && !e.shiftKey && (inputValue.trim() || attachedImages.length > 0)) {
      e.preventDefault();
      if (isStreaming) {
        // Steering mode
        onSteer(inputValue.trim());
      } else {
        onSendPrompt(inputValue.trim(), attachedImages.length > 0 ? attachedImages : undefined);
        imagePreviews.forEach(url => URL.revokeObjectURL(url));
        setAttachedImages([]);
        setImagePreviews([]);
      }
      setInputValue('');
    }
  };

  const hasSession = state?.sessionId != null;

  // Format model display
  const modelDisplay = currentModel 
    ? `${currentModel.name || currentModel.id}` 
    : 'No model';

  return (
    <div
      onClick={onFocus}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col bg-pi-surface rounded overflow-hidden min-w-0 min-h-0 border relative ${
        isFocused ? 'border-pi-border-focus' : 'border-pi-border'
      }`}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-pi-bg/90 flex items-center justify-center pointer-events-none">
          <div className="border border-dashed border-pi-accent p-4 text-pi-accent text-[14px]">
            Drop images to attach
          </div>
        </div>
      )}

      {/* Header with model/thinking selectors */}
      <div className="px-3 py-2 border-b border-pi-border flex items-center justify-between gap-2 text-[13px]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[sessionStatus]} ${
              sessionStatus === 'running' ? 'status-running' : ''
            }`}
          />
          <span className="text-pi-text truncate">
            {hasSession ? sessionTitle : 'No session'}
          </span>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => { setShowModelMenu(!showModelMenu); setShowThinkingMenu(false); }}
              className="flex items-center gap-1 text-pi-muted hover:text-pi-text transition-colors"
            >
              <span className="text-pi-accent">⚡</span>
              <span className="max-w-[120px] truncate">{modelDisplay}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showModelMenu && (
              <div className="absolute top-full right-0 mt-1 bg-pi-bg border border-pi-border rounded shadow-lg z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                {models.map((model) => (
                  <button
                    key={`${model.provider}:${model.id}`}
                    onClick={() => {
                      onSetModel(model.provider, model.id);
                      setShowModelMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[13px] hover:bg-pi-surface transition-colors ${
                      currentModel?.id === model.id ? 'text-pi-accent' : 'text-pi-text'
                    }`}
                  >
                    <div className="truncate">{model.name || model.id}</div>
                    <div className="text-[11px] text-pi-muted truncate">{model.provider}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Thinking level selector */}
          <div className="relative">
            <button
              onClick={() => { setShowThinkingMenu(!showThinkingMenu); setShowModelMenu(false); }}
              className="flex items-center gap-1 text-pi-muted hover:text-pi-text transition-colors"
            >
              <span className={currentThinking !== 'off' ? 'text-pi-accent' : ''}>
                {currentThinking === 'off' ? 'Off' : currentThinking}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showThinkingMenu && (
              <div className="absolute top-full right-0 mt-1 bg-pi-bg border border-pi-border rounded shadow-lg z-50 min-w-[100px]">
                {THINKING_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      onSetThinkingLevel(level);
                      setShowThinkingMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[13px] hover:bg-pi-surface transition-colors ${
                      currentThinking === level ? 'text-pi-accent' : 'text-pi-text'
                    }`}
                  >
                    {level === 'off' ? 'Off' : level}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Close pane button */}
          {canClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 text-pi-muted hover:text-pi-error transition-colors"
              title="Close pane"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {!hasSession && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-pi-muted text-[14px]">
            Type a message or /new to start
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
              isStreaming={isStreaming}
              activeToolExecutions={activeToolExecutions}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Questionnaire UI */}
      {questionnaireRequest && (
        <QuestionnaireUI
          request={questionnaireRequest}
          onResponse={onQuestionnaireResponse}
        />
      )}

      {/* Input area */}
      <div className="border-t border-pi-border">
        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="px-3 pt-2 flex gap-2 flex-wrap">
            {imagePreviews.map((url, i) => (
              <div key={i} className="relative group">
                <img 
                  src={url} 
                  alt={`Attached ${i + 1}`}
                  className="h-12 w-12 object-cover rounded border border-pi-border"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-pi-error text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Slash menu */}
        <div className="p-3 relative">
          {showSlashMenu && filteredCommands.length > 0 && (
            <SlashMenu
              commands={filteredCommands}
              selectedIndex={selectedCmdIdx}
              onSelect={(cmd) => executeCommand(cmd.action)}
            />
          )}
          
          {/* Resume session menu */}
          {showResumeMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[300px] overflow-y-auto">
              <div className="p-2 border-b border-pi-border">
                <input
                  type="text"
                  value={resumeFilter}
                  onChange={(e) => { setResumeFilter(e.target.value); setSelectedCmdIdx(0); }}
                  placeholder="Filter sessions..."
                  className="w-full bg-transparent border-none outline-none text-pi-text text-[13px]"
                  autoFocus
                />
              </div>
              {filteredSessions.map((session, i) => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`w-full px-3 py-2 text-left text-[13px] hover:bg-pi-surface transition-colors ${
                    i === selectedCmdIdx ? 'bg-pi-surface' : ''
                  }`}
                >
                  <div className="text-pi-text truncate">
                    {session.firstMessage || session.name || session.id}
                  </div>
                  <div className="text-[11px] text-pi-muted">
                    {session.id.slice(0, 8)}
                  </div>
                </button>
              ))}
              {filteredSessions.length === 0 && (
                <div className="px-3 py-2 text-pi-muted text-[13px]">No sessions found</div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className={`text-[14px] ${isStreaming ? 'text-pi-warning' : 'text-pi-muted'}`}>
              {isStreaming ? '›' : '›'}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={onFocus}
              placeholder={isStreaming ? 'steer...' : 'Message or /command'}
              className="flex-1 bg-transparent border-none outline-none text-pi-text text-[14px] font-mono"
            />
            {isStreaming && (
              <span className="text-[11px] text-pi-warning">steering</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
