import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { SessionInfo, ImageAttachment, SlashCommand as BackendSlashCommand, ModelInfo, ThinkingLevel, StartupInfo, ScopedModelInfo, ExtensionUIResponse, CustomUIInputEvent } from '@pi-web-ui/shared';
import type { PaneData } from '../hooks/usePanes';
import { MessageList } from './MessageList';
import { SlashMenu, SlashCommand } from './SlashMenu';
import { QuestionnaireUI } from './QuestionnaireUI';
import { ExtensionUIDialog } from './ExtensionUIDialog';
import { CustomUIDialog } from './CustomUIDialog';
import { StartupDisplay } from './StartupDisplay';
import { ScopedModelsDialog } from './ScopedModelsDialog';
import { X, ChevronDown, Send, Square, ImagePlus, Command } from 'lucide-react';

interface PaneProps {
  pane: PaneData;
  isFocused: boolean;
  sessions: SessionInfo[];
  models: ModelInfo[];
  backendCommands: BackendSlashCommand[];
  startupInfo: StartupInfo | null;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSendPrompt: (message: string, images?: ImageAttachment[]) => void;
  onSteer: (message: string, images?: ImageAttachment[]) => void;
  onAbort: () => void;
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  onSplit: (direction: 'vertical' | 'horizontal') => void;
  onGetForkMessages: () => void;
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  onQuestionnaireResponse: (questionId: string, response: string) => void;
  onExtensionUIResponse: (response: ExtensionUIResponse) => void;
  onCustomUIInput: (input: CustomUIInputEvent) => void;
  onCompact: () => void;
  onOpenSettings: () => void;
  onExport: () => void;
  onRenameSession: (name: string) => void;
  onShowHotkeys: () => void;
  onFollowUp: (message: string) => void;
  onReload: () => void;
  // New features
  onGetSessionTree: () => void;
  onCopyLastAssistant: () => void;
  onGetQueuedMessages: () => void;
  onClearQueue: () => void;
  onListFiles: (query?: string, requestId?: string) => void;
  onExecuteBash: (command: string, excludeFromContext?: boolean) => void;
  onToggleAllToolsCollapsed: () => void;
  onToggleAllThinkingCollapsed: () => void;
  // Scoped models
  onGetScopedModels: () => void;
  onSetScopedModels: (models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>) => void;
}

// Built-in pane commands (UI-only)
const PANE_COMMANDS: SlashCommand[] = [
  { cmd: '/split', desc: 'Split pane vertically', action: 'vsplit' },
  { cmd: '/hsplit', desc: 'Split pane horizontally', action: 'hsplit' },
  { cmd: '/close', desc: 'Close this pane', action: 'close' },
  { cmd: '/stop', desc: 'Stop the agent', action: 'stop' },
  { cmd: '/compact', desc: 'Compact conversation history', action: 'compact' },
  { cmd: '/model', desc: 'Select a model', action: 'model' },
  { cmd: '/settings', desc: 'Open settings', action: 'settings' },
  { cmd: '/export', desc: 'Export session to HTML', action: 'export' },
  { cmd: '/name', desc: 'Rename session', action: 'name' },
  { cmd: '/hotkeys', desc: 'Show keyboard shortcuts', action: 'hotkeys' },
  { cmd: '/reload', desc: 'Rebuild and restart the application', action: 'reload' },
  // New commands
  { cmd: '/tree', desc: 'Navigate session tree', action: 'tree' },
  { cmd: '/copy', desc: 'Copy last assistant response', action: 'copy' },
  { cmd: '/scoped-models', desc: 'Configure models for Ctrl+P cycling', action: 'scoped-models' },
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
  startupInfo,
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
  onExtensionUIResponse,
  onCustomUIInput,
  onCompact,
  onOpenSettings,
  onExport,
  onRenameSession,
  onShowHotkeys,
  onFollowUp,
  onReload,
  // New features
  onGetSessionTree,
  onCopyLastAssistant,
  onGetQueuedMessages,
  onClearQueue,
  onListFiles,
  onExecuteBash,
  onToggleAllToolsCollapsed,
  onToggleAllThinkingCollapsed,
  onGetScopedModels,
  onSetScopedModels,
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
  // 'steer' = immediate interrupt, 'followUp' = queue after current response
  const [streamingInputMode, setStreamingInputMode] = useState<'steer' | 'followUp'>('steer');
  // New feature state
  const [showFileMenu, setShowFileMenu] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_fileFilter, setFileFilter] = useState(''); // Used to track filter for potential future client-side filtering
  const [fileList, setFileList] = useState<Array<{ path: string; name: string }>>([]);
  const [queuedSteering, setQueuedSteering] = useState<string[]>([]);
  const [queuedFollowUp, setQueuedFollowUp] = useState<string[]>([]);
  // Local pending follow-ups (not yet sent to server) - user can edit/delete these
  const [pendingFollowUps, setPendingFollowUps] = useState<string[]>([]);
  const [editingPendingIndex, setEditingPendingIndex] = useState<number | null>(null);
  const [editingPendingText, setEditingPendingText] = useState('');
  const [showScopedModels, setShowScopedModels] = useState(false);
  const [scopedModels, setScopedModels] = useState<ScopedModelInfo[]>([]);
  // Track if Alt key is held to show follow-up mode
  const [altHeld, setAltHeld] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileListRequestIdRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);

  // Get slot data
  const slot = pane.slot;
  const messages = slot?.messages || [];
  const isStreaming = slot?.isStreaming || false;
  const streamingText = slot?.streamingText || '';
  const streamingThinking = slot?.streamingThinking || '';
  const state = slot?.state;
  const activeToolExecutions = slot?.activeToolExecutions || [];
  const questionnaireRequest = slot?.questionnaireRequest ?? state?.questionnaireRequest;
  const extensionUIRequest = slot?.extensionUIRequest ?? null;
  const customUIState = slot?.customUIState ?? null;
  const activeExtensionRequest = extensionUIRequest?.method === 'notify' ? null : extensionUIRequest;
  const hasInlineDialog = Boolean(questionnaireRequest || activeExtensionRequest || customUIState);
  const bashExecution = slot?.bashExecution ?? null;

  // Track session ID to reset scroll when workspace/session changes
  const sessionId = state?.sessionId;
  const prevSessionIdRef = useRef<string | null | undefined>(undefined);

  // Reset scroll position when session changes (workspace tab switch or session switch)
  useEffect(() => {
    if (prevSessionIdRef.current !== undefined && prevSessionIdRef.current !== sessionId) {
      // Session changed - reset scroll to top
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = 0;
      }
      userScrolledUpRef.current = false;
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Get current model and thinking level
  const currentModel = state?.model;
  const currentThinking = state?.thinkingLevel || 'off';

  // Get session status
  const sessionStatus = isStreaming ? 'running' : (state?.sessionId ? 'idle' : 'idle');

  // Get session title from first user message or session ID
  const sessionTitle = state?.sessionName
    || messages.find(m => m.role === 'user')?.content
      .find(c => c.type === 'text')?.text?.slice(0, 50)
    || 'New conversation';

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

  // Track when user scrolls away from bottom
  const handleMessagesScroll = useCallback(() => {
    // Ignore scroll events triggered by programmatic scrolling
    if (isProgrammaticScrollRef.current) return;
    
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Check if scrolled to bottom (with 100px tolerance for reliability)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    userScrolledUpRef.current = !isAtBottom;
  }, []);

  // Scroll to bottom helper - uses scrollIntoView on end marker for reliability
  const scrollToBottom = useCallback((smooth = true) => {
    isProgrammaticScrollRef.current = true;
    requestAnimationFrame(() => {
      const endMarker = messagesEndRef.current;
      if (endMarker) {
        endMarker.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'end' });
      }
      // Reset flag after a short delay to allow scroll to complete
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, smooth ? 300 : 50);
    });
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // Track total tool result content to detect updates (not just count)
  const toolResultsFingerprint = useMemo(() => {
    return activeToolExecutions.map(t => `${t.toolCallId}:${t.status}:${(t.result?.length || 0)}`).join('|');
  }, [activeToolExecutions]);

  // Track last message content length to detect in-place updates
  const lastMessageFingerprint = useMemo(() => {
    if (messages.length === 0) return '';
    const lastMsg = messages[messages.length - 1];
    // Track content length as a simple fingerprint for changes
    return `${lastMsg.id}:${JSON.stringify(lastMsg.content).length}`;
  }, [messages]);

  // Scroll during streaming (text, thinking, or tool output changes)
  useEffect(() => {
    if (isStreaming && !userScrolledUpRef.current) {
      // Use instant scroll during rapid streaming updates
      scrollToBottom(false);
    }
  }, [isStreaming, streamingText, streamingThinking, toolResultsFingerprint, lastMessageFingerprint, scrollToBottom]);

  // Scroll when bash execution output changes
  useEffect(() => {
    if (bashExecution && !userScrolledUpRef.current) {
      scrollToBottom(false);
    }
  }, [bashExecution?.output, bashExecution?.isRunning, scrollToBottom]);

  // Track previous streaming state to detect when streaming ends
  const prevIsStreamingRef = useRef(isStreaming);
  useEffect(() => {
    // When streaming ends (was streaming, now not), send any pending follow-ups
    if (prevIsStreamingRef.current && !isStreaming && pendingFollowUps.length > 0) {
      console.log(`[Pane] Streaming ended, sending ${pendingFollowUps.length} pending follow-ups`);
      // Send each pending follow-up as a new prompt
      pendingFollowUps.forEach((msg, i) => {
        // Small delay between messages to ensure ordering
        setTimeout(() => {
          onSendPrompt(msg);
        }, i * 100);
      });
      setPendingFollowUps([]);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming, pendingFollowUps, onSendPrompt]);

  // Focus input when pane becomes focused
  useEffect(() => {
    if (isFocused && !hasInlineDialog) {
      // Use setTimeout to ensure DOM is ready (especially for new panes)
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isFocused, hasInlineDialog]);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (inputValue === '' && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [inputValue]);

  // Listen for file list events (@ reference)
  useEffect(() => {
    const handleFileList = (e: CustomEvent<{ files: Array<{ path: string; name: string }>; requestId?: string }>) => {
      if (fileListRequestIdRef.current && e.detail.requestId !== fileListRequestIdRef.current) {
        return;
      }
      setFileList(e.detail.files);
    };
    window.addEventListener('pi:fileList', handleFileList as EventListener);
    return () => window.removeEventListener('pi:fileList', handleFileList as EventListener);
  }, []);

  // Listen for queued messages events (filtered by this pane's slotId)
  useEffect(() => {
    const handleQueuedMessages = (e: CustomEvent<{ sessionSlotId: string; steering: string[]; followUp: string[] }>) => {
      console.log(`[Pane.queuedMessages] Received event - eventSlotId: ${e.detail.sessionSlotId}, mySlotId: ${pane.sessionSlotId}, match: ${e.detail.sessionSlotId === pane.sessionSlotId}`);
      console.log(`[Pane.queuedMessages] steering: ${JSON.stringify(e.detail.steering)}, followUp: ${JSON.stringify(e.detail.followUp)}`);
      // Only update if this event is for this pane's slot
      if (e.detail.sessionSlotId === pane.sessionSlotId) {
        console.log(`[Pane.queuedMessages] Updating state for this pane`);
        setQueuedSteering(e.detail.steering);
        setQueuedFollowUp(e.detail.followUp);
      }
    };
    window.addEventListener('pi:queuedMessages', handleQueuedMessages as EventListener);
    return () => window.removeEventListener('pi:queuedMessages', handleQueuedMessages as EventListener);
  }, [pane.sessionSlotId]);

  // Listen for copy result (filtered by this pane's slotId)
  useEffect(() => {
    const handleCopyResult = (e: CustomEvent<{ sessionSlotId: string; success: boolean; text?: string; error?: string }>) => {
      // Only handle if this event is for this pane's slot
      if (e.detail.sessionSlotId !== pane.sessionSlotId) return;
      
      if (e.detail.success && e.detail.text) {
        navigator.clipboard.writeText(e.detail.text).then(() => {
          // Could show a toast notification here
          console.log('Copied to clipboard');
        });
      } else if (e.detail.error) {
        console.error('Copy failed:', e.detail.error);
      }
    };
    window.addEventListener('pi:copyResult', handleCopyResult as EventListener);
    return () => window.removeEventListener('pi:copyResult', handleCopyResult as EventListener);
  }, [pane.sessionSlotId]);

  // Listen for scoped models response (filtered by this pane's slotId)
  useEffect(() => {
    const handleScopedModels = (e: CustomEvent<{ sessionSlotId: string; models: ScopedModelInfo[] }>) => {
      // Only handle if this event is for this pane's slot
      if (e.detail.sessionSlotId !== pane.sessionSlotId) return;
      
      setScopedModels(e.detail.models);
      setShowScopedModels(true);
    };
    window.addEventListener('pi:scopedModels', handleScopedModels as EventListener);
    return () => window.removeEventListener('pi:scopedModels', handleScopedModels as EventListener);
  }, [pane.sessionSlotId]);

  // Track Alt key to toggle between steer and follow-up modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && isStreaming) {
        setAltHeld(true);
        setStreamingInputMode('followUp');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setAltHeld(false);
        setStreamingInputMode('steer');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isStreaming]);

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

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length === 0) return;
    
    e.preventDefault();
    
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const attachment = await fileToImageAttachment(file);
        if (attachment) {
          setAttachedImages(prev => [...prev, attachment]);
          const previewUrl = URL.createObjectURL(file);
          setImagePreviews(prev => [...prev, previewUrl]);
        }
      }
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Handle file input change (for mobile attach button)
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    for (const file of imageFiles) {
      const attachment = await fileToImageAttachment(file);
      if (attachment) {
        setAttachedImages(prev => [...prev, attachment]);
        const previewUrl = URL.createObjectURL(file);
        setImagePreviews(prev => [...prev, previewUrl]);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  // Handle send button click
  const handleSend = useCallback(() => {
    if (!inputValue.trim() && attachedImages.length === 0) return;

    const trimmedMessage = inputValue.trim();
    if (trimmedMessage.startsWith('!!')) {
      const command = trimmedMessage.slice(2).trim();
      if (command) {
        onExecuteBash(command, true);
      }
      setInputValue('');
      return;
    }

    if (trimmedMessage.startsWith('!') && !trimmedMessage.startsWith('!!')) {
      const command = trimmedMessage.slice(1).trim();
      if (command) {
        onExecuteBash(command, false);
      }
      setInputValue('');
      return;
    }
    
    // Reset scroll tracking - user sent a message, so resume auto-scroll
    userScrolledUpRef.current = false;
    
    // Determine the effective mode - if Alt is held, use followUp
    const effectiveMode = altHeld ? 'followUp' : streamingInputMode;
    
    console.log(`[Pane.handleSend] isStreaming: ${isStreaming}, effectiveMode: ${effectiveMode}, streamingInputMode: ${streamingInputMode}, altHeld: ${altHeld}`);
    console.log(`[Pane.handleSend] message: "${trimmedMessage.substring(0, 50)}"`);
    
    if (isStreaming) {
      if (effectiveMode === 'steer') {
        console.log(`[Pane.handleSend] Calling onSteer (immediate)`);
        // Steer messages are sent immediately to interrupt/guide the agent
        onSteer(trimmedMessage, attachedImages.length > 0 ? attachedImages : undefined);
        // Clear steering messages from the queue
        setQueuedSteering(prev => prev.filter(msg => msg !== trimmedMessage));
      } else {
        console.log(`[Pane.handleSend] Queueing follow-up locally`);
        // Queue follow-up messages locally - they'll be sent when agent finishes
        setPendingFollowUps(prev => [...prev, trimmedMessage]);
      }
    } else {
      console.log(`[Pane.handleSend] Calling onSendPrompt (not streaming)`);
      onSendPrompt(trimmedMessage, attachedImages.length > 0 ? attachedImages : undefined);
    }
    // Clear images after sending
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setAttachedImages([]);
    setImagePreviews([]);
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [inputValue, attachedImages, imagePreviews, isStreaming, streamingInputMode, altHeld, onSteer, onFollowUp, onSendPrompt, onExecuteBash]);

  const requestFileList = useCallback((query?: string) => {
    const requestId = `pane-${pane.sessionSlotId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    fileListRequestIdRef.current = requestId;
    onListFiles(query, requestId);
  }, [onListFiles, pane.sessionSlotId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (val.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashFilter(val);
      setSelectedCmdIdx(0);
      setShowResumeMenu(false);
      setShowFileMenu(false);
    } else if (val.includes('@')) {
      // Check if we should show file menu (@ at start or after whitespace)
      const lastAtIndex = val.lastIndexOf('@');
      const charBefore = lastAtIndex > 0 ? val[lastAtIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        setShowSlashMenu(false);
        setShowResumeMenu(false);
        setShowFileMenu(true);
        setFileFilter(val.slice(lastAtIndex + 1));
        setSelectedCmdIdx(0);
        // Request file list from server
        requestFileList(val.slice(lastAtIndex + 1));
      }
    } else {
      setShowSlashMenu(false);
      setShowResumeMenu(false);
      setShowFileMenu(false);
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
      case 'compact':
        onCompact();
        break;
      case 'model':
        setShowSlashMenu(false);
        setShowModelMenu(true);
        setShowThinkingMenu(false);
        setInputValue('');
        return;
      case 'settings':
        onOpenSettings();
        break;
      case 'export':
        onExport();
        break;
      case 'name':
        // Prompt for name - for now just use a simple prompt
        const newName = window.prompt('Enter session name:');
        if (newName) {
          onRenameSession(newName);
        }
        break;
      case 'hotkeys':
        onShowHotkeys();
        break;
      case 'reload':
        onReload();
        break;
      case 'resume':
        setShowSlashMenu(false);
        setShowResumeMenu(true);
        setResumeFilter('');
        setSelectedCmdIdx(0); // Reset selection
        setInputValue('');
        return; // Don't clear input yet
      // New commands
      case 'tree':
        onGetSessionTree();
        break;
      case 'copy':
        onCopyLastAssistant();
        break;
      case 'scoped-models':
        onGetScopedModels();
        break;
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
    // Focus the input after session loads
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        selectSession(filteredSessions[selectedCmdIdx].path);
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

    // Ctrl+C to clear input (when there's no selection to copy)
    if (key === 'c' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const input = e.target as HTMLTextAreaElement;
      const hasSelection = input.selectionStart !== input.selectionEnd;
      if (!hasSelection) {
        e.preventDefault();
        setInputValue('');
        return;
      }
    }

    // Ctrl+U - Delete to line start
    if (key === 'u' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const input = e.target as HTMLTextAreaElement;
      const pos = input.selectionStart || 0;
      setInputValue(inputValue.slice(pos));
      setTimeout(() => input.setSelectionRange(0, 0), 0);
      return;
    }

    // Ctrl+K - Delete to line end
    if (key === 'k' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const input = e.target as HTMLTextAreaElement;
      const pos = input.selectionStart || 0;
      setInputValue(inputValue.slice(0, pos));
      return;
    }

    // Ctrl+L - Open model selector
    if (key === 'l' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      setShowModelMenu(true);
      setShowThinkingMenu(false);
      return;
    }

    // Shift+Tab - Cycle thinking level
    if (key === 'Tab' && e.shiftKey && !showSlashMenu && !showResumeMenu) {
      e.preventDefault();
      const currentIdx = THINKING_LEVELS.indexOf(currentThinking);
      const nextIdx = (currentIdx + 1) % THINKING_LEVELS.length;
      onSetThinkingLevel(THINKING_LEVELS[nextIdx]);
      return;
    }

    // Tab - Path completion (when not in a menu and typing a path)
    if (key === 'Tab' && !e.shiftKey && !showSlashMenu && !showResumeMenu && !showFileMenu && !showModelMenu && !showThinkingMenu) {
      // Check if we're in a path context (after @ or typing a path-like string)
      const input = e.target as HTMLTextAreaElement;
      const cursorPos = input.selectionStart || 0;
      const textBeforeCursor = inputValue.slice(0, cursorPos);
      
      // Find the start of the current word/path
      const lastSpaceOrNewline = Math.max(textBeforeCursor.lastIndexOf(' '), textBeforeCursor.lastIndexOf('\n'));
      const wordStart = lastSpaceOrNewline + 1;
      const currentWord = textBeforeCursor.slice(wordStart);
      
      // Check if it looks like a path (starts with @, ., /, or ~) or contains /
      if (currentWord && (currentWord.startsWith('@') || currentWord.startsWith('.') || currentWord.startsWith('/') || currentWord.startsWith('~') || currentWord.includes('/'))) {
        e.preventDefault();
        // Request file completion
        const query = currentWord.startsWith('@') ? currentWord.slice(1) : currentWord;
        requestFileList(query);
        setShowFileMenu(true);
        setFileFilter(query);
        setSelectedCmdIdx(0);
        return;
      }
    }

    // Ctrl+P - Cycle to next model (use scoped models if configured)
    if (key === 'p' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      // Use scoped models if any are enabled, otherwise use all models
      const enabledScoped = scopedModels.filter(m => m.enabled);
      const cycleModels = enabledScoped.length > 0 
        ? enabledScoped.map(sm => ({ provider: sm.provider, id: sm.modelId, thinkingLevel: sm.thinkingLevel }))
        : models.map(m => ({ provider: m.provider, id: m.id }));
      
      if (cycleModels.length > 0 && currentModel) {
        const currentIdx = cycleModels.findIndex(m => m.id === currentModel.id && m.provider === currentModel.provider);
        const nextIdx = (currentIdx + 1) % cycleModels.length;
        const nextModel = cycleModels[nextIdx];
        onSetModel(nextModel.provider, nextModel.id);
        // Also set thinking level if scoped model has one
        if ('thinkingLevel' in nextModel && nextModel.thinkingLevel) {
          onSetThinkingLevel(nextModel.thinkingLevel as ThinkingLevel);
        }
      }
      return;
    }

    // Shift+Ctrl+P - Cycle to previous model (use scoped models if configured)
    if (key === 'p' && e.ctrlKey && e.shiftKey && !e.metaKey) {
      e.preventDefault();
      const enabledScoped = scopedModels.filter(m => m.enabled);
      const cycleModels = enabledScoped.length > 0 
        ? enabledScoped.map(sm => ({ provider: sm.provider, id: sm.modelId, thinkingLevel: sm.thinkingLevel }))
        : models.map(m => ({ provider: m.provider, id: m.id }));
      
      if (cycleModels.length > 0 && currentModel) {
        const currentIdx = cycleModels.findIndex(m => m.id === currentModel.id && m.provider === currentModel.provider);
        const prevIdx = (currentIdx - 1 + cycleModels.length) % cycleModels.length;
        const prevModel = cycleModels[prevIdx];
        onSetModel(prevModel.provider, prevModel.id);
        if ('thinkingLevel' in prevModel && prevModel.thinkingLevel) {
          onSetThinkingLevel(prevModel.thinkingLevel as ThinkingLevel);
        }
      }
      return;
    }

    // Ctrl+O - Toggle all tools collapsed
    if (key === 'o' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      onToggleAllToolsCollapsed();
      return;
    }

    // Ctrl+T - Toggle all thinking collapsed
    if (key === 't' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      onToggleAllThinkingCollapsed();
      return;
    }

    // Alt+Up - Retrieve queued messages
    if (key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      // Request queued messages then clear them
      onGetQueuedMessages();
      return;
    }

    // Alt+Enter - Queue follow-up message
    if (key === 'Enter' && e.altKey && inputValue.trim()) {
      e.preventDefault();
      onFollowUp(inputValue.trim());
      setInputValue('');
      return;
    }

    // File menu navigation
    if (showFileMenu && fileList.length > 0) {
      if (key === 'ArrowDown' || key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i + 1) % fileList.length);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedCmdIdx(i => (i - 1 + fileList.length) % fileList.length);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        // Replace the @query with the file path
        const lastAtIndex = inputValue.lastIndexOf('@');
        const newValue = inputValue.slice(0, lastAtIndex) + '@' + fileList[selectedCmdIdx].path + ' ';
        setInputValue(newValue);
        setShowFileMenu(false);
        setFileList([]);
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowFileMenu(false);
        return;
      }
    }

    // Send message - check for !command and !!command
    if (key === 'Enter' && !e.shiftKey && !e.altKey && (inputValue.trim() || attachedImages.length > 0)) {
      e.preventDefault();
      const trimmed = inputValue.trim();
      
      // Check for !!command (bash without sending to LLM)
      if (trimmed.startsWith('!!')) {
        const command = trimmed.slice(2).trim();
        if (command) {
          onExecuteBash(command, true); // excludeFromContext = true
        }
        setInputValue('');
        return;
      }
      
      // Check for !command (bash and send to LLM)
      if (trimmed.startsWith('!') && !trimmed.startsWith('!!')) {
        const command = trimmed.slice(1).trim();
        if (command) {
          onExecuteBash(command, false); // excludeFromContext = false
        }
        setInputValue('');
        return;
      }
      
      // Reset scroll tracking - user sent a message, so resume auto-scroll
      userScrolledUpRef.current = false;
      
      if (isStreaming) {
        // Use current streaming mode
        if (streamingInputMode === 'steer') {
          onSteer(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
        } else {
          onFollowUp(trimmed);
        }
      } else {
        onSendPrompt(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
      }
      // Clear images after sending
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
      setAttachedImages([]);
      setImagePreviews([]);
      setInputValue('');
    }
  };

  const hasSession = state?.sessionId != null;

  // Format model display
  const modelDisplay = currentModel 
    ? `${currentModel.name || currentModel.id}` 
    : 'No model';

  // Handle click on pane - focus pane and input
  const handlePaneClick = useCallback(() => {
    onFocus();
    if (!hasInlineDialog) {
      inputRef.current?.focus();
    }
  }, [onFocus, hasInlineDialog]);

  return (
    <div
      onClick={handlePaneClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex-1 flex flex-col bg-pi-surface rounded overflow-hidden min-w-0 min-h-0 border border-pi-border relative"
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
      <div className="px-3 py-3 sm:py-2 border-b border-pi-border flex items-center justify-between gap-3 sm:gap-2 text-[14px] sm:text-[13px]">
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
              className="flex items-center gap-1.5 sm:gap-1 p-2 sm:p-0 -m-2 sm:m-0 text-pi-muted hover:text-pi-text transition-colors"
            >
              <span className="text-pi-accent">⚡</span>
              <span className="max-w-[120px] truncate">{modelDisplay}</span>
              <ChevronDown className="w-4 h-4 sm:w-3 sm:h-3" />
            </button>
            
            {showModelMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowModelMenu(false)} 
                />
                <div className="absolute top-full right-0 mt-1 bg-pi-bg border border-pi-border rounded shadow-lg z-50 min-w-[300px] max-h-[300px] overflow-y-auto">
                  {models.map((model) => (
                    <button
                      key={`${model.provider}:${model.id}`}
                      onClick={() => {
                        onSetModel(model.provider, model.id);
                        setShowModelMenu(false);
                      }}
                      className={`w-full px-4 py-3 sm:px-3 sm:py-2 text-left text-[14px] sm:text-[13px] hover:bg-pi-surface transition-colors ${
                        currentModel?.id === model.id ? 'text-pi-accent' : 'text-pi-text'
                      }`}
                    >
                      <div className="truncate">{model.name || model.id}</div>
                      <div className="text-[12px] sm:text-[11px] text-pi-muted truncate">{model.provider}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* Thinking level selector */}
          <div className="relative">
            <button
              onClick={() => { setShowThinkingMenu(!showThinkingMenu); setShowModelMenu(false); }}
              className="flex items-center gap-1.5 sm:gap-1 p-2 sm:p-0 -m-2 sm:m-0 text-pi-muted hover:text-pi-text transition-colors"
            >
              <span className={currentThinking !== 'off' ? 'text-pi-accent' : ''}>
                {currentThinking === 'off' ? 'Off' : currentThinking}
              </span>
              <ChevronDown className="w-4 h-4 sm:w-3 sm:h-3" />
            </button>
            
            {showThinkingMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowThinkingMenu(false)} 
                />
                <div className="absolute top-full right-0 mt-1 bg-pi-bg border border-pi-border rounded shadow-lg z-50 min-w-[100px]">
                  {THINKING_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        onSetThinkingLevel(level);
                        setShowThinkingMenu(false);
                      }}
                      className={`w-full px-4 py-3 sm:px-3 sm:py-2 text-left text-[14px] sm:text-[13px] hover:bg-pi-surface transition-colors ${
                        currentThinking === level ? 'text-pi-accent' : 'text-pi-text'
                      }`}
                    >
                      {level === 'off' ? 'Off' : level}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* Close pane button */}
          {canClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 sm:p-1 text-pi-muted hover:text-pi-error transition-colors"
              title="Close pane"
            >
              <X className="w-5 h-5 sm:w-3.5 sm:h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-5 relative"
      >
        {/* Startup overlay - shown when no messages and user hasn't started typing */}
        {messages.length === 0 && !inputValue.trim() && startupInfo && !bashExecution && !hasInlineDialog && (
          <div className="absolute inset-0 p-3 bg-pi-surface z-10 transition-opacity duration-200">
            <StartupDisplay startupInfo={startupInfo} />
          </div>
        )}
        
        <MessageList
          keyPrefix={pane.id}
          messages={messages}
          streamingText={streamingText}
          streamingThinking={streamingThinking}
          isStreaming={isStreaming}
          activeToolExecutions={activeToolExecutions}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-pi-border">
        {hasInlineDialog && (
          <div className="border-b border-pi-border bg-pi-bg p-3 flex flex-col gap-3">
            {questionnaireRequest && (
              <QuestionnaireUI
                request={questionnaireRequest}
                onResponse={onQuestionnaireResponse}
              />
            )}

            {activeExtensionRequest && (
              <ExtensionUIDialog
                request={activeExtensionRequest}
                onResponse={onExtensionUIResponse}
              />
            )}

            {customUIState && (
              <CustomUIDialog
                state={customUIState}
                onInput={onCustomUIInput}
                onClose={() => {}}
              />
            )}
          </div>
        )}

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

          {/* File reference menu (@ trigger) */}
          {showFileMenu && fileList.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[200px] overflow-y-auto z-50">
              {fileList.map((file, i) => (
                <button
                  key={file.path}
                  onClick={() => {
                    const lastAtIndex = inputValue.lastIndexOf('@');
                    const newValue = inputValue.slice(0, lastAtIndex) + '@' + file.path + ' ';
                    setInputValue(newValue);
                    setShowFileMenu(false);
                    setFileList([]);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-pi-surface transition-colors flex items-center gap-2 ${
                    i === selectedCmdIdx ? 'bg-pi-surface' : ''
                  }`}
                >
                  <span className="text-pi-muted">@</span>
                  <span className="text-pi-text truncate">{file.path}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pending follow-ups (local queue - editable/deletable) */}
          {pendingFollowUps.length > 0 && (
            <div className="mb-2 px-2 py-1.5 bg-pi-accent/10 border border-pi-accent/30 rounded text-[12px]">
              <div className="flex items-center gap-2 text-pi-accent mb-1">
                <span className="font-medium">Queued ({pendingFollowUps.length})</span>
                <span className="text-pi-muted text-[11px]">will send when agent finishes</span>
                <button
                  onClick={() => setPendingFollowUps([])}
                  className="text-pi-muted hover:text-pi-error ml-auto text-[11px]"
                  title="Clear all queued messages"
                >
                  ✕ clear all
                </button>
              </div>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {pendingFollowUps.map((msg, i) => (
                  <div key={i} className="flex items-start gap-2 group">
                    {editingPendingIndex === i ? (
                      <input
                        type="text"
                        value={editingPendingText}
                        onChange={(e) => setEditingPendingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (editingPendingText.trim()) {
                              setPendingFollowUps(prev => prev.map((m, idx) => idx === i ? editingPendingText.trim() : m));
                            } else {
                              // Delete if empty
                              setPendingFollowUps(prev => prev.filter((_, idx) => idx !== i));
                            }
                            setEditingPendingIndex(null);
                            setEditingPendingText('');
                          } else if (e.key === 'Escape') {
                            setEditingPendingIndex(null);
                            setEditingPendingText('');
                          }
                        }}
                        onBlur={() => {
                          if (editingPendingText.trim()) {
                            setPendingFollowUps(prev => prev.map((m, idx) => idx === i ? editingPendingText.trim() : m));
                          }
                          setEditingPendingIndex(null);
                          setEditingPendingText('');
                        }}
                        className="flex-1 bg-pi-surface border border-pi-border rounded px-2 py-0.5 text-pi-text text-[12px] outline-none focus:border-pi-accent"
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="text-pi-accent flex-shrink-0">→</span>
                        <span 
                          className="flex-1 text-pi-text cursor-pointer hover:text-pi-accent truncate"
                          onClick={() => {
                            setEditingPendingIndex(i);
                            setEditingPendingText(msg);
                          }}
                          title="Click to edit"
                        >
                          {msg}
                        </span>
                        <button
                          onClick={() => setPendingFollowUps(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-pi-muted hover:text-pi-error opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          title="Delete this message"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Server-side queued messages indicator (from steer) */}
          {(queuedSteering.length > 0 || queuedFollowUp.length > 0) && (
            <div className="mb-2 px-2 py-1.5 bg-pi-surface/50 rounded text-[11px] text-pi-muted">
              <div className="flex items-center gap-2">
                <span>Server queue:</span>
                {queuedSteering.length > 0 && (
                  <span className="text-pi-warning">{queuedSteering.length} steer</span>
                )}
                {queuedFollowUp.length > 0 && (
                  <span className="text-pi-accent">{queuedFollowUp.length} follow-up</span>
                )}
                <button
                  onClick={() => {
                    onClearQueue();
                    // Restore queued messages to input
                    const allQueued = [...queuedSteering, ...queuedFollowUp];
                    if (allQueued.length > 0) {
                      setInputValue(allQueued.join('\n'));
                      setQueuedSteering([]);
                      setQueuedFollowUp([]);
                    }
                  }}
                  className="text-pi-muted hover:text-pi-text ml-auto"
                >
                  ✕ clear
                </button>
              </div>
              {/* Show actual message content */}
              <div className="mt-1 space-y-0.5 max-h-[60px] overflow-y-auto">
                {queuedSteering.map((msg, i) => (
                  <div key={`steer-${i}`} className="text-pi-warning truncate">
                    → {msg}
                  </div>
                ))}
                {queuedFollowUp.map((msg, i) => (
                  <div key={`followup-${i}`} className="text-pi-accent truncate">
                    → {msg}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Resume session menu */}
          {showResumeMenu && (
            <div 
              className="absolute bottom-full left-3 right-3 mb-1 bg-pi-bg border border-pi-border rounded shadow-lg max-h-[300px] overflow-y-auto z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-2 border-b border-pi-border">
                <input
                  type="text"
                  value={resumeFilter}
                  onChange={(e) => { setResumeFilter(e.target.value); setSelectedCmdIdx(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'Tab') {
                      e.preventDefault();
                      setSelectedCmdIdx(i => (i + 1) % Math.max(1, filteredSessions.length));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedCmdIdx(i => (i - 1 + filteredSessions.length) % Math.max(1, filteredSessions.length));
                    } else if (e.key === 'Enter' && filteredSessions.length > 0) {
                      e.preventDefault();
                      selectSession(filteredSessions[selectedCmdIdx].path);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowResumeMenu(false);
                      setInputValue('');
                    }
                  }}
                  placeholder="Filter sessions..."
                  className="w-full bg-transparent border-none outline-none text-pi-text text-[16px]"
                  autoFocus
                />
              </div>
              {filteredSessions.map((session, i) => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.path)}
                  className={`w-full px-4 py-3 sm:px-3 sm:py-2 text-left text-[14px] sm:text-[13px] hover:bg-pi-surface transition-colors ${
                    i === selectedCmdIdx ? 'bg-pi-surface' : ''
                  }`}
                >
                  <div className="text-pi-text truncate">
                    {session.firstMessage || session.name || session.id}
                  </div>
                  <div className="text-[12px] sm:text-[11px] text-pi-muted">
                    {session.id.slice(0, 8)}
                  </div>
                </button>
              ))}
              {filteredSessions.length === 0 && (
                <div className="px-3 py-2 text-pi-muted text-[13px]">No sessions found</div>
              )}
            </div>
          )}

          {/* Hidden file input (shared between mobile and desktop) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex items-start gap-2">
            <span className={`text-[14px] mt-0.5 ${isStreaming ? 'text-pi-warning' : 'text-pi-muted'} hidden sm:block`}>
              {isStreaming ? '›' : '›'}
            </span>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={onFocus}
              placeholder={isStreaming ? (streamingInputMode === 'steer' ? 'steer...' : 'queue follow-up...') : 'Message or /command'}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-pi-text text-[14px] font-mono resize-none min-h-[21px] max-h-[200px] overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
              }}
            />
            {/* Desktop action buttons */}
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
              {/* Attach image */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-pi-muted hover:text-pi-text transition-colors rounded"
                title="Attach image"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              
              {/* Streaming mode toggle */}
              {isStreaming && (
                <button
                  onClick={() => setStreamingInputMode(m => m === 'steer' ? 'followUp' : 'steer')}
                  className={`px-1.5 text-[10px] opacity-60 hover:opacity-100 transition-opacity ${
                    streamingInputMode === 'steer' ? 'text-pi-warning' : 'text-pi-accent'
                  }`}
                  title={streamingInputMode === 'steer' 
                    ? 'Steer: interrupt immediately (hold Alt for follow-up)' 
                    : 'Follow-up: queue after response (release Alt for steer)'}
                >
                  {streamingInputMode === 'steer' ? 'steer' : 'follow-up'}
                </button>
              )}
              
              {/* Stop agent */}
              {isStreaming && (
                <button
                  onClick={onAbort}
                  className="p-1.5 text-pi-error hover:text-pi-error/80 transition-colors rounded"
                  title="Stop agent"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}
              
              {/* Send message */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() && attachedImages.length === 0}
                className={`p-1.5 transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed ${
                  isStreaming && streamingInputMode === 'steer'
                    ? 'text-pi-warning hover:text-pi-warning/80'
                    : 'text-pi-accent hover:text-pi-accent-hover'
                }`}
                title={isStreaming ? (streamingInputMode === 'steer' ? "Steer agent" : "Queue follow-up") : "Send message"}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Mobile action buttons */}
          <div className="flex sm:hidden items-center gap-1 mt-2 pt-2 border-t border-pi-border">
            
            {/* Slash command menu */}
            <button
              onClick={() => {
                setInputValue('/');
                setShowSlashMenu(true);
                setSlashFilter('/');
                inputRef.current?.focus();
              }}
              className="p-3 text-pi-muted hover:text-pi-text active:text-pi-accent transition-colors rounded"
              title="Commands"
            >
              <Command className="w-6 h-6" />
            </button>
            
            {/* Attach image */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-pi-muted hover:text-pi-text active:text-pi-accent transition-colors rounded"
              title="Attach image"
            >
              <ImagePlus className="w-6 h-6" />
            </button>
            
            <div className="flex-1" />
            
            {/* Streaming mode toggle - only show when streaming */}
            {isStreaming && (
              <button
                onClick={() => setStreamingInputMode(m => m === 'steer' ? 'followUp' : 'steer')}
                className={`px-2 py-1 text-[12px] opacity-70 active:opacity-100 transition-opacity ${
                  streamingInputMode === 'steer' ? 'text-pi-warning' : 'text-pi-accent'
                }`}
                title={streamingInputMode === 'steer' 
                  ? 'Steer: interrupt immediately (tap to switch)' 
                  : 'Follow-up: queue after response (tap to switch)'}
              >
                {streamingInputMode === 'steer' ? 'steer' : 'follow-up'}
              </button>
            )}
            
            {/* Stop agent */}
            {isStreaming && (
              <button
                onClick={onAbort}
                className="p-3 text-pi-error hover:text-pi-error/80 active:text-pi-error/60 transition-colors rounded"
                title="Stop agent"
              >
                <Square className="w-6 h-6" />
              </button>
            )}
            
            {/* Send message */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() && attachedImages.length === 0}
              className={`p-3 transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed ${
                isStreaming && streamingInputMode === 'steer'
                  ? 'text-pi-warning hover:text-pi-warning/80 active:text-pi-warning/60'
                  : 'text-pi-accent hover:text-pi-accent-hover active:text-pi-accent/60'
              }`}
              title={isStreaming ? (streamingInputMode === 'steer' ? "Steer agent" : "Queue follow-up") : "Send message"}
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Scoped Models Dialog */}
      <ScopedModelsDialog
        isOpen={showScopedModels}
        models={models}
        scopedModels={scopedModels}
        onSave={(selectedModels) => {
          onSetScopedModels(selectedModels);
          setShowScopedModels(false);
        }}
        onClose={() => setShowScopedModels(false)}
      />
    </div>
  );
}
