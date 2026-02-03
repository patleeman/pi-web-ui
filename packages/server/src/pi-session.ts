import { EventEmitter } from 'events';
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  VERSION,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { ImageContent, TextContent } from '@mariozechner/pi-ai';
import type {
  BashResult,
  ChatMessage,
  ImageAttachment,
  MessageContent,
  ModelInfo,
  SessionInfo,
  SessionState,
  SessionStats,
  SessionEvent,
  SlashCommand,
  StartupInfo,
  StartupResourceInfo,
  ThinkingLevel,
  TokenUsage,
  SessionTreeNode,
  ScopedModelInfo,
  FileInfo,
  ExtensionUIRequest,
  ExtensionUIResponse,
} from '@pi-web-ui/shared';
import { getGitInfo } from './git-info.js';
import { WebExtensionUIContext } from './web-extension-ui.js';

export class PiSession extends EventEmitter {
  private session: AgentSession | null = null;
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private cwd: string;
  private messageMap = new Map<string, ChatMessage>();
  private unsubscribe: (() => void) | null = null;
  private extensionUIContext: WebExtensionUIContext | null = null;
  /** Stored editor text for extensions (since there's no real editor in web UI) */
  private editorText = '';

  constructor(cwd: string) {
    super();
    this.cwd = cwd;
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }

  async initialize(): Promise<void> {
    const { session } = await createAgentSession({
      cwd: this.cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      sessionManager: SessionManager.create(this.cwd),
    });

    this.session = session;
    this.unsubscribe = session.subscribe((event) => this.handleEvent(event));

    // Create and bind the extension UI context
    this.extensionUIContext = new WebExtensionUIContext({
      sendRequest: (request: ExtensionUIRequest) => {
        this.emit('extensionUIRequest', request);
      },
      sendNotification: (message: string, type: 'info' | 'warning' | 'error') => {
        // Emit as a notification event (could be handled by client)
        this.emit('extensionNotification', { message, type });
      },
      setEditorText: (text: string) => {
        this.editorText = text;
        this.emit('editorTextChange', text);
      },
      getEditorText: () => {
        return this.editorText;
      },
      // Custom UI callbacks (for ctx.ui.custom())
      sendCustomUIStart: (state) => {
        this.emit('customUIStart', state);
      },
      sendCustomUIUpdate: (update) => {
        this.emit('customUIUpdate', update);
      },
      sendCustomUIClose: (close) => {
        this.emit('customUIClose', close);
      },
    });

    // Bind extensions with UI context
    await session.bindExtensions({
      uiContext: this.extensionUIContext,
      // TODO: Could also bind commandContextActions for navigateTree, etc.
    });
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.extensionUIContext) {
      this.extensionUIContext.cancelAllPending();
      this.extensionUIContext = null;
    }
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }

  /**
   * Handle an extension UI response from the client.
   */
  handleExtensionUIResponse(response: ExtensionUIResponse): void {
    if (this.extensionUIContext) {
      this.extensionUIContext.handleResponse(response);
    }
  }

  /**
   * Handle custom UI input from the client.
   */
  handleCustomUIInput(input: import('@pi-web-ui/shared').CustomUIInputEvent): void {
    if (this.extensionUIContext) {
      this.extensionUIContext.handleCustomUIInput(input);
    }
  }

  /**
   * Set the editor text (for extensions that call ctx.ui.setEditorText)
   */
  setEditorTextFromClient(text: string): void {
    this.editorText = text;
  }

  private handleEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.emit('event', { type: 'agentStart' } satisfies SessionEvent);
        break;

      case 'agent_end':
        this.emit('event', { type: 'agentEnd' } satisfies SessionEvent);
        break;

      case 'message_start': {
        const startMsg = this.convertMessage(event.message);
        this.messageMap.set(startMsg.id, startMsg);
        this.emit('event', { type: 'messageStart', message: startMsg } satisfies SessionEvent);
        break;
      }

      case 'message_update':
        this.handleMessageUpdate(event);
        break;

      case 'message_end': {
        const endMsg = this.convertMessage(event.message);
        this.messageMap.set(endMsg.id, endMsg);
        this.emit('event', { type: 'messageEnd', message: endMsg } satisfies SessionEvent);
        break;
      }

      case 'tool_execution_start':
        this.emit('event', {
          type: 'toolStart',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args as Record<string, unknown>,
        } satisfies SessionEvent);
        break;

      case 'tool_execution_update': {
        const partialText = this.extractTextFromContent(event.partialResult?.content);
        this.emit('event', {
          type: 'toolUpdate',
          toolCallId: event.toolCallId,
          partialResult: partialText,
        } satisfies SessionEvent);
        break;
      }

      case 'tool_execution_end': {
        const resultText = this.extractTextFromContent(event.result?.content);
        this.emit('event', {
          type: 'toolEnd',
          toolCallId: event.toolCallId,
          result: resultText,
          isError: event.isError,
        } satisfies SessionEvent);
        break;
      }

      case 'auto_compaction_start':
        this.emit('event', { type: 'compactionStart' } satisfies SessionEvent);
        break;

      case 'auto_compaction_end':
        this.emit('event', {
          type: 'compactionEnd',
          summary: event.result?.summary || '',
        } satisfies SessionEvent);
        break;
    }
  }

  private extractTextFromContent(content: (TextContent | ImageContent)[] | undefined): string {
    if (!content) return '';
    return content
      .filter((c): c is TextContent => c.type === 'text')
      .map((c) => c.text)
      .join('');
  }

  private handleMessageUpdate(event: Extract<AgentSessionEvent, { type: 'message_update' }>): void {
    const { assistantMessageEvent } = event;
    const messageId = event.message.timestamp?.toString() || Date.now().toString();

    switch (assistantMessageEvent.type) {
      case 'text_delta':
        this.emit('event', {
          type: 'messageUpdate',
          messageId,
          update: {
            type: 'textDelta',
            delta: assistantMessageEvent.delta,
            contentIndex: assistantMessageEvent.contentIndex,
          },
        } satisfies SessionEvent);
        break;

      case 'thinking_delta':
        this.emit('event', {
          type: 'messageUpdate',
          messageId,
          update: {
            type: 'thinkingDelta',
            delta: assistantMessageEvent.delta,
            contentIndex: assistantMessageEvent.contentIndex,
          },
        } satisfies SessionEvent);
        break;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertMessage(msg: any): ChatMessage {
    const id = msg.timestamp?.toString() || Date.now().toString();
    const timestamp = msg.timestamp || Date.now();

    if (msg.role === 'user') {
      return {
        id,
        role: 'user',
        timestamp,
        content: this.convertContent(msg.content),
      };
    }

    if (msg.role === 'toolResult') {
      return {
        id,
        role: 'toolResult',
        timestamp,
        content: this.convertContent(msg.content),
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        isError: msg.isError,
      };
    }

    // Assistant message
    return {
      id,
      role: 'assistant',
      timestamp,
      content: this.convertContent(msg.content),
      model: msg.model,
      provider: msg.provider,
      usage: msg.usage ? {
        input: msg.usage.input || 0,
        output: msg.usage.output || 0,
        cacheRead: msg.usage.cacheRead || 0,
        cacheWrite: msg.usage.cacheWrite || 0,
        total: (msg.usage.input || 0) + (msg.usage.output || 0),
      } : undefined,
    };
  }

  private convertContent(content: unknown): MessageContent[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    if (!Array.isArray(content)) {
      return [];
    }

    return content.map((block: { type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown>; data?: string; mimeType?: string }) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text || '' };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking' as const, thinking: block.thinking || '' };
      }
      if (block.type === 'toolCall') {
        return {
          type: 'toolCall' as const,
          id: block.id || '',
          name: block.name || '',
          arguments: block.arguments || {},
          status: 'complete' as const,
        };
      }
      if (block.type === 'image') {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            mediaType: block.mimeType || 'image/png',
            data: block.data || '',
          },
        };
      }
      return { type: 'text' as const, text: JSON.stringify(block) };
    });
  }

  async getState(): Promise<SessionState> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const model = this.session.model;
    const messages = this.session.messages;

    // Calculate token usage from messages
    const tokens: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

    for (const msg of messages) {
      // Check if this is an assistant message with usage info
      if (msg.role === 'assistant' && 'usage' in msg && msg.usage) {
        const usage = msg.usage as { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
        tokens.input += usage.input || 0;
        tokens.output += usage.output || 0;
        tokens.cacheRead += usage.cacheRead || 0;
        tokens.cacheWrite += usage.cacheWrite || 0;
      }
    }
    tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;

    // Get context window usage from Pi SDK
    const contextUsage = this.session.getContextUsage();
    const contextWindowPercent = contextUsage?.percent ?? 0;

    // Get git info for this workspace
    const git = getGitInfo(this.cwd);

    return {
      sessionId: this.session.sessionId,
      sessionFile: this.session.sessionFile,
      model: model ? {
        id: model.id,
        name: model.name,
        provider: model.provider,
        reasoning: model.reasoning || false,
        contextWindow: model.contextWindow || 0,
      } : null,
      thinkingLevel: this.session.thinkingLevel as ThinkingLevel,
      isStreaming: this.session.isStreaming,
      isCompacting: this.session.isCompacting,
      autoCompactionEnabled: this.session.autoCompactionEnabled,
      autoRetryEnabled: this.session.autoRetryEnabled,
      steeringMode: this.session.steeringMode,
      followUpMode: this.session.followUpMode,
      messageCount: messages.length,
      tokens,
      contextWindowPercent,
      git,
    };
  }

  getMessages(): ChatMessage[] {
    if (!this.session) {
      return [];
    }

    return this.session.messages.map((msg) => this.convertMessage(msg));
  }

  async prompt(message: string, images?: ImageAttachment[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    // Convert ImageAttachment to Pi SDK's ImageContent format
    const imageContents: ImageContent[] | undefined = images?.map((img) => ({
      type: 'image' as const,
      data: img.source.data,
      mimeType: img.source.mediaType,
    }));

    await this.session.prompt(message, { images: imageContents });
  }

  async steer(message: string, images?: ImageAttachment[]): Promise<void> {
    console.log(`[PiSession.steer] message: "${message?.substring(0, 50)}", hasImages: ${!!images && images.length > 0}`);
    if (!this.session) {
      console.log(`[PiSession.steer] ERROR: Session not initialized`);
      throw new Error('Session not initialized');
    }
    
    console.log(`[PiSession.steer] Session isStreaming: ${this.session.isStreaming}`);
    
    if (images && images.length > 0) {
      // Use sendUserMessage with deliverAs: 'steer' when there are images
      console.log(`[PiSession.steer] Using sendUserMessage with images`);
      const imageContents: ImageContent[] = images.map((img) => ({
        type: 'image' as const,
        data: img.source.data,
        mimeType: img.source.mediaType,
      }));
      
      const content: (TextContent | ImageContent)[] = [
        { type: 'text' as const, text: message },
        ...imageContents,
      ];
      
      await this.session.sendUserMessage(content, { deliverAs: 'steer' });
      console.log(`[PiSession.steer] sendUserMessage completed`);
    } else {
      // Use simple steer() for text-only
      console.log(`[PiSession.steer] Using simple steer()`);
      await this.session.steer(message);
      console.log(`[PiSession.steer] session.steer() completed`);
    }
  }

  async followUp(message: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    await this.session.followUp(message);
  }

  async abort(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    await this.session.abort();
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const model = this.modelRegistry.find(provider, modelId);
    if (!model) {
      throw new Error(`Model not found: ${provider}/${modelId}`);
    }

    await this.session.setModel(model);
  }

  setThinkingLevel(level: ThinkingLevel): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setThinkingLevel(level);
  }

  async newSession(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    await this.session.newSession();
  }

  async switchSession(sessionPath: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    await this.session.switchSession(sessionPath);
  }

  async compact(customInstructions?: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    await this.session.compact(customInstructions);
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sessions = await SessionManager.list(this.cwd);
    return sessions.map((s) => ({
      id: s.id,
      path: s.path,
      name: s.name,
      firstMessage: s.firstMessage,
      messageCount: s.messageCount,
      updatedAt: s.modified.getTime(),
      cwd: s.cwd,
    }));
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const models = await this.modelRegistry.getAvailable();
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      reasoning: m.reasoning || false,
      contextWindow: m.contextWindow || 0,
    }));
  }

  /**
   * Get available slash commands (prompt templates, skills, extension commands)
   */
  getCommands(): SlashCommand[] {
    if (!this.session) {
      return [];
    }

    const commands: SlashCommand[] = [];

    // Add prompt templates
    for (const template of this.session.promptTemplates) {
      commands.push({
        name: template.name,
        description: template.description,
        source: 'template',
        path: template.filePath,
      });
    }

    // Add skills
    const { skills } = this.session.resourceLoader.getSkills();
    for (const skill of skills) {
      commands.push({
        name: `skill:${skill.name}`,
        description: skill.description,
        source: 'skill',
        path: skill.filePath,
      });
    }

    // Add extension commands
    const extensionCommands = this.session.extensionRunner?.getRegisteredCommands() ?? [];
    for (const cmd of extensionCommands) {
      commands.push({
        name: cmd.name,
        description: cmd.description ?? '(extension command)',
        source: 'extension',
      });
    }

    return commands;
  }

  /**
   * Check if the session is currently streaming/active
   */
  isActive(): boolean {
    return this.session?.isStreaming ?? false;
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Fork the conversation at a specific message entry
   */
  async fork(entryId: string): Promise<{ text: string; cancelled: boolean }> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    const result = await this.session.fork(entryId);
    return { text: result.selectedText, cancelled: result.cancelled };
  }

  /**
   * Get messages available for forking
   */
  getForkMessages(): Array<{ entryId: string; text: string }> {
    if (!this.session) {
      return [];
    }
    return this.session.getUserMessagesForForking();
  }

  /**
   * Set the session name
   */
  setSessionName(name: string): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setSessionName(name);
  }

  /**
   * Export the session to HTML
   */
  async exportHtml(outputPath?: string): Promise<string> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    return await this.session.exportToHtml(outputPath);
  }

  // ============================================================================
  // Model/Thinking Cycling
  // ============================================================================

  /**
   * Cycle to the next/previous model
   */
  async cycleModel(direction: 'forward' | 'backward' = 'forward'): Promise<{ model: ModelInfo; thinkingLevel: ThinkingLevel; isScoped: boolean } | null> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    const result = await this.session.cycleModel(direction);
    if (!result) return null;
    return {
      model: {
        id: result.model.id,
        name: result.model.name,
        provider: result.model.provider,
        reasoning: result.model.reasoning || false,
        contextWindow: result.model.contextWindow || 0,
      },
      thinkingLevel: result.thinkingLevel as ThinkingLevel,
      isScoped: result.isScoped,
    };
  }

  /**
   * Cycle to the next thinking level
   */
  cycleThinkingLevel(): ThinkingLevel | null {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    const level = this.session.cycleThinkingLevel();
    return level ? (level as ThinkingLevel) : null;
  }

  // ============================================================================
  // Mode Settings
  // ============================================================================

  /**
   * Set steering mode (how steering messages are delivered)
   */
  setSteeringMode(mode: 'all' | 'one-at-a-time'): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setSteeringMode(mode);
  }

  /**
   * Set follow-up mode (how follow-up messages are delivered)
   */
  setFollowUpMode(mode: 'all' | 'one-at-a-time'): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setFollowUpMode(mode);
  }

  /**
   * Enable/disable auto-compaction
   */
  setAutoCompaction(enabled: boolean): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setAutoCompactionEnabled(enabled);
  }

  /**
   * Enable/disable auto-retry on errors
   */
  setAutoRetry(enabled: boolean): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.setAutoRetryEnabled(enabled);
  }

  /**
   * Abort an ongoing retry attempt
   */
  abortRetry(): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.abortRetry();
  }

  // ============================================================================
  // Bash Execution
  // ============================================================================

  /**
   * Execute a bash command
   * @param excludeFromContext If true, output won't be sent to LLM (!! prefix)
   */
  async executeBash(command: string, onChunk?: (chunk: string) => void, excludeFromContext = false): Promise<BashResult> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    const result = await this.session.executeBash(command, onChunk, { excludeFromContext });
    return {
      stdout: result.output,
      stderr: '',  // Pi SDK combines stdout/stderr into output
      exitCode: result.exitCode ?? null,
      signal: result.cancelled ? 'SIGTERM' : null,
      timedOut: false,  // Pi SDK uses cancelled for this
      truncated: result.truncated,
    };
  }

  /**
   * Abort a running bash command
   */
  abortBash(): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    this.session.abortBash();
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get detailed session statistics
   */
  getSessionStats(): SessionStats {
    if (!this.session) {
      throw new Error('Session not initialized');
    }
    return this.session.getSessionStats();
  }

  /**
   * Get the last assistant response text
   */
  getLastAssistantText(): string | null {
    if (!this.session) {
      return null;
    }
    return this.session.getLastAssistantText() ?? null;
  }

  // ============================================================================
  // Startup Info
  // ============================================================================

  /**
   * Get startup info for display (version, context, skills, extensions, themes)
   */
  getStartupInfo(): StartupInfo {
    if (!this.session) {
      return {
        version: VERSION,
        contextFiles: [],
        skills: [],
        extensions: [],
        themes: [],
        shortcuts: [],
      };
    }

    const resourceLoader = this.session.resourceLoader;
    const pathMetadata = resourceLoader.getPathMetadata();

    // Helper to determine scope from path
    const getScope = (filePath: string): 'user' | 'project' => {
      const meta = pathMetadata.get(filePath);
      if (meta) {
        return meta.scope as 'user' | 'project';
      }
      // Fallback: check if path contains home directory pattern
      return filePath.includes('/.pi/') ? 'user' : 'project';
    };

    // Get context files (AGENTS.md) - extract just the paths
    const { agentsFiles } = resourceLoader.getAgentsFiles();
    const contextFilePaths = agentsFiles.map(f => f.path);
    
    // Get skills
    const { skills } = resourceLoader.getSkills();
    const skillInfos: StartupResourceInfo[] = skills.map(skill => ({
      name: skill.name,
      path: skill.filePath,
      description: skill.description,
      scope: getScope(skill.filePath),
    }));

    // Get extensions
    const extensionsResult = resourceLoader.getExtensions();
    const extensionInfos: StartupResourceInfo[] = extensionsResult.extensions.map(ext => ({
      name: ext.path.split('/').pop() || ext.path,
      path: ext.resolvedPath,
      scope: getScope(ext.resolvedPath),
    }));

    // Get themes - Theme class has name and sourcePath properties
    const { themes } = resourceLoader.getThemes();
    const themeInfos: StartupResourceInfo[] = themes
      .filter(theme => theme.name && theme.sourcePath)  // Filter out built-in themes without paths
      .map(theme => ({
        name: theme.name!,
        path: theme.sourcePath!,
        scope: getScope(theme.sourcePath!),
      }));

    // Web UI shortcuts (different from TUI)
    const shortcuts = [
      { key: '⌘O', description: 'Open directory' },
      { key: '⌘,', description: 'Settings' },
      { key: '⌘\\', description: 'Split pane' },
      { key: '⌘.', description: 'Stop agent' },
      { key: 'Ctrl+L', description: 'Select model' },
      { key: 'Shift+Tab', description: 'Cycle thinking' },
      { key: 'Ctrl+P', description: 'Cycle models' },
      { key: 'Alt+Enter', description: 'Queue follow-up' },
      { key: '/', description: 'Commands' },
    ];

    return {
      version: VERSION,
      contextFiles: contextFilePaths,
      skills: skillInfos,
      extensions: extensionInfos,
      themes: themeInfos,
      shortcuts,
    };
  }

  // ============================================================================
  // Session Tree Navigation
  // ============================================================================

  /**
   * Get the session tree structure for navigation
   */
  getSessionTree(): { tree: SessionTreeNode[]; currentLeafId: string | null } {
    if (!this.session) {
      return { tree: [], currentLeafId: null };
    }

    const sessionManager = this.session.sessionManager;
    const sdkTree = sessionManager.getTree();
    const currentLeafId = sessionManager.getLeafId();

    // Convert SDK tree to our format
    const convertNode = (node: { entry: { id: string; parentId: string | null; type: string; timestamp: string; message?: { role?: string; content?: unknown } }; children: typeof sdkTree; label?: string }): SessionTreeNode => {
      let role: 'user' | 'assistant' | 'toolResult' | undefined;
      let text = '';

      if (node.entry.type === 'message' && node.entry.message) {
        const msg = node.entry.message;
        role = msg.role as 'user' | 'assistant' | 'toolResult' | undefined;
        // Extract text preview
        const content = msg.content;
        if (typeof content === 'string') {
          text = content.slice(0, 100);
        } else if (Array.isArray(content)) {
          const textBlock = content.find((c: { type: string }) => c.type === 'text');
          if (textBlock && 'text' in textBlock) {
            text = (textBlock.text as string).slice(0, 100);
          }
        }
      } else if (node.entry.type === 'compaction') {
        text = '[Compaction]';
      } else if (node.entry.type === 'branch_summary') {
        text = '[Branch Summary]';
      } else if (node.entry.type === 'model_change') {
        text = '[Model Change]';
      } else if (node.entry.type === 'thinking_level_change') {
        text = '[Thinking Level Change]';
      }

      return {
        id: node.entry.id,
        parentId: node.entry.parentId,
        type: node.entry.type === 'message' ? 'message' :
              node.entry.type === 'compaction' ? 'compaction' :
              node.entry.type === 'branch_summary' ? 'branch_summary' :
              node.entry.type === 'model_change' ? 'model_change' :
              node.entry.type === 'thinking_level_change' ? 'thinking_level_change' : 'other',
        role,
        text,
        label: node.label,
        timestamp: new Date(node.entry.timestamp).getTime(),
        children: node.children.map(convertNode),
      };
    };

    return {
      tree: sdkTree.map(convertNode),
      currentLeafId,
    };
  }

  /**
   * Navigate to a different point in the session tree
   */
  async navigateTree(targetId: string, summarize = false): Promise<{ success: boolean; editorText?: string; error?: string }> {
    if (!this.session) {
      return { success: false, error: 'Session not initialized' };
    }

    try {
      const result = await this.session.navigateTree(targetId, { summarize });
      return {
        success: !result.cancelled && !result.aborted,
        editorText: result.editorText,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed',
      };
    }
  }

  // ============================================================================
  // Queued Messages
  // ============================================================================

  /**
   * Get pending queued messages
   */
  getQueuedMessages(): { steering: string[]; followUp: string[] } {
    if (!this.session) {
      return { steering: [], followUp: [] };
    }
    return {
      steering: [...this.session.getSteeringMessages()],
      followUp: [...this.session.getFollowUpMessages()],
    };
  }

  /**
   * Clear queued messages and return them
   */
  clearQueue(): { steering: string[]; followUp: string[] } {
    if (!this.session) {
      return { steering: [], followUp: [] };
    }
    return this.session.clearQueue();
  }

  // ============================================================================
  // Scoped Models
  // ============================================================================

  /**
   * Get scoped models (for Ctrl+P cycling)
   */
  async getScopedModels(): Promise<ScopedModelInfo[]> {
    if (!this.session) {
      return [];
    }

    const scopedModels = this.session.scopedModels;
    const allModels = await this.modelRegistry.getAvailable();

    // If scoped models are set, return them with enabled=true
    if (scopedModels.length > 0) {
      return scopedModels.map(sm => ({
        provider: sm.model.provider,
        modelId: sm.model.id,
        modelName: sm.model.name,
        thinkingLevel: sm.thinkingLevel as ThinkingLevel,
        enabled: true,
      }));
    }

    // Otherwise return all models with enabled=false (using session defaults)
    return allModels.map(m => ({
      provider: m.provider,
      modelId: m.id,
      modelName: m.name,
      thinkingLevel: 'off' as ThinkingLevel,
      enabled: false,
    }));
  }

  /**
   * Set scoped models for cycling
   */
  async setScopedModels(models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const scopedModels = [];
    for (const m of models) {
      const model = this.modelRegistry.find(m.provider, m.modelId);
      if (model) {
        scopedModels.push({ model, thinkingLevel: m.thinkingLevel });
      }
    }

    this.session.setScopedModels(scopedModels);
  }
}
