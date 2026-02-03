/**
 * Shared types for Pi Web UI
 * Used by both server and client
 */

// ============================================================================
// Workspace Types (Multi-directory orchestration)
// ============================================================================

export interface DirectoryEntry {
  name: string;
  path: string;
  hasPiSessions: boolean;
}

export interface WorkspaceInfo {
  id: string;
  path: string;
  name: string;
  isActive: boolean;
  state: SessionState | null;
}

// ============================================================================
// WebSocket Messages (Client -> Server)
// ============================================================================

// Workspace management
export interface WsOpenWorkspaceMessage {
  type: 'openWorkspace';
  path: string;
}

export interface WsCloseWorkspaceMessage {
  type: 'closeWorkspace';
  workspaceId: string;
}

export interface WsListWorkspacesMessage {
  type: 'listWorkspaces';
}

export interface WsBrowseDirectoryMessage {
  type: 'browseDirectory';
  path?: string; // If not provided, returns allowed roots
}

// UI State persistence
export interface WsGetUIStateMessage {
  type: 'getUIState';
}

export interface WsSaveUIStateMessage {
  type: 'saveUIState';
  state: Partial<UIState>;
}

export interface WsSetThemeMessage {
  type: 'setTheme';
  themeId: string | null;
}

export interface WsSetSidebarWidthMessage {
  type: 'setSidebarWidth';
  width: number;
}

export interface WsSetDraftInputMessage {
  type: 'setDraftInput';
  workspacePath: string;
  value: string;
}

export interface WsSetActiveSessionMessage {
  type: 'setActiveSession';
  workspacePath: string;
  sessionId: string;
}

export interface WsSetActiveModelMessage {
  type: 'setActiveModel';
  workspacePath: string;
  provider: string;
  modelId: string;
}

export interface WsSetThinkingLevelPrefMessage {
  type: 'setThinkingLevelPref';
  workspacePath: string;
  level: ThinkingLevel;
}

// Base interface for workspace-scoped messages
interface WorkspaceScopedMessage {
  workspaceId: string;
}

// Base interface for session-slot-scoped messages (pane-specific operations)
interface SessionSlotScopedMessage extends WorkspaceScopedMessage {
  sessionSlotId: string;
}

// ============================================================================
// Pane/Layout Types
// ============================================================================

export type PaneLayout = 'single' | 'split-v' | 'split-h' | 'grid';

export interface PaneInfo {
  id: string;
  sessionSlotId: string;
  /** Flex size (1 = equal share) */
  size: number;
}

export interface PaneLayoutState {
  layout: PaneLayout;
  panes: PaneInfo[];
  focusedPaneId: string | null;
}

// Session slot management
export interface WsCreateSessionSlotMessage extends WorkspaceScopedMessage {
  type: 'createSessionSlot';
  slotId?: string; // Optional - server will generate if not provided
}

export interface WsCloseSessionSlotMessage extends WorkspaceScopedMessage {
  type: 'closeSessionSlot';
  sessionSlotId: string;
}

export interface WsListSessionSlotsMessage extends WorkspaceScopedMessage {
  type: 'listSessionSlots';
}

// Session-slot-scoped operations (these operate on a specific pane's session)
// sessionSlotId defaults to 'default' for backwards compatibility

export interface WsPromptMessage extends WorkspaceScopedMessage {
  type: 'prompt';
  sessionSlotId?: string;
  message: string;
  images?: ImageAttachment[];
}

export interface WsSteerMessage extends WorkspaceScopedMessage {
  type: 'steer';
  sessionSlotId?: string;
  message: string;
  images?: ImageAttachment[];
}

export interface WsFollowUpMessage extends WorkspaceScopedMessage {
  type: 'followUp';
  sessionSlotId?: string;
  message: string;
}

export interface WsAbortMessage extends WorkspaceScopedMessage {
  type: 'abort';
  sessionSlotId?: string;
}

export interface WsSetModelMessage extends WorkspaceScopedMessage {
  type: 'setModel';
  sessionSlotId?: string;
  provider: string;
  modelId: string;
}

export interface WsSetThinkingLevelMessage extends WorkspaceScopedMessage {
  type: 'setThinkingLevel';
  sessionSlotId?: string;
  level: ThinkingLevel;
}

export interface WsNewSessionMessage extends WorkspaceScopedMessage {
  type: 'newSession';
  sessionSlotId?: string;
}

export interface WsSwitchSessionMessage extends WorkspaceScopedMessage {
  type: 'switchSession';
  sessionSlotId?: string;
  sessionId: string;
}

export interface WsCompactMessage extends WorkspaceScopedMessage {
  type: 'compact';
  sessionSlotId?: string;
  customInstructions?: string;
}

export interface WsGetStateMessage extends WorkspaceScopedMessage {
  type: 'getState';
  sessionSlotId?: string;
}

export interface WsGetMessagesMessage extends WorkspaceScopedMessage {
  type: 'getMessages';
  sessionSlotId?: string;
}

export interface WsGetSessionsMessage extends WorkspaceScopedMessage {
  type: 'getSessions';
  // Sessions list is workspace-wide, not slot-specific
}

export interface WsGetModelsMessage extends WorkspaceScopedMessage {
  type: 'getModels';
  // Models list is workspace-wide, not slot-specific
}

export interface WsGetCommandsMessage extends WorkspaceScopedMessage {
  type: 'getCommands';
  sessionSlotId?: string;
}

// Session operations
export interface WsForkMessage extends WorkspaceScopedMessage {
  type: 'fork';
  sessionSlotId?: string;
  entryId: string;
}

export interface WsGetForkMessagesMessage extends WorkspaceScopedMessage {
  type: 'getForkMessages';
  sessionSlotId?: string;
}

export interface WsSetSessionNameMessage extends WorkspaceScopedMessage {
  type: 'setSessionName';
  sessionSlotId?: string;
  name: string;
}

export interface WsExportHtmlMessage extends WorkspaceScopedMessage {
  type: 'exportHtml';
  sessionSlotId?: string;
  outputPath?: string;
}

// Model/Thinking cycling
export interface WsCycleModelMessage extends WorkspaceScopedMessage {
  type: 'cycleModel';
  sessionSlotId?: string;
  direction?: 'forward' | 'backward';
}

export interface WsCycleThinkingLevelMessage extends WorkspaceScopedMessage {
  type: 'cycleThinkingLevel';
  sessionSlotId?: string;
}

// Mode settings
export interface WsSetSteeringModeMessage extends WorkspaceScopedMessage {
  type: 'setSteeringMode';
  sessionSlotId?: string;
  mode: 'all' | 'one-at-a-time';
}

export interface WsSetFollowUpModeMessage extends WorkspaceScopedMessage {
  type: 'setFollowUpMode';
  sessionSlotId?: string;
  mode: 'all' | 'one-at-a-time';
}

export interface WsSetAutoCompactionMessage extends WorkspaceScopedMessage {
  type: 'setAutoCompaction';
  sessionSlotId?: string;
  enabled: boolean;
}

export interface WsSetAutoRetryMessage extends WorkspaceScopedMessage {
  type: 'setAutoRetry';
  sessionSlotId?: string;
  enabled: boolean;
}

export interface WsAbortRetryMessage extends WorkspaceScopedMessage {
  type: 'abortRetry';
  sessionSlotId?: string;
}

// Bash execution
export interface WsBashMessage extends WorkspaceScopedMessage {
  type: 'bash';
  sessionSlotId?: string;
  command: string;
  /** If true, output won't be sent to LLM (!! prefix) */
  excludeFromContext?: boolean;
}

export interface WsAbortBashMessage extends WorkspaceScopedMessage {
  type: 'abortBash';
  sessionSlotId?: string;
}

// Stats
export interface WsGetSessionStatsMessage extends WorkspaceScopedMessage {
  type: 'getSessionStats';
  sessionSlotId?: string;
}

export interface WsGetLastAssistantTextMessage extends WorkspaceScopedMessage {
  type: 'getLastAssistantText';
  sessionSlotId?: string;
}

// Server management
export interface WsDeployMessage {
  type: 'deploy';
}

// Config update
export interface WsUpdateAllowedRootsMessage {
  type: 'updateAllowedRoots';
  roots: string[];
}

// Questionnaire response (user answered questions)
export interface WsQuestionnaireResponseMessage extends WorkspaceScopedMessage {
  type: 'questionnaireResponse';
  sessionSlotId?: string;
  toolCallId: string;
  answers: QuestionnaireAnswer[];
  cancelled: boolean;
}

// ============================================================================
// New Feature Messages
// ============================================================================

// Session tree navigation
export interface WsGetSessionTreeMessage extends WorkspaceScopedMessage {
  type: 'getSessionTree';
  sessionSlotId?: string;
}

export interface WsNavigateTreeMessage extends WorkspaceScopedMessage {
  type: 'navigateTree';
  sessionSlotId?: string;
  targetId: string;
  summarize?: boolean;
}

// Copy last assistant text
export interface WsCopyLastAssistantMessage extends WorkspaceScopedMessage {
  type: 'copyLastAssistant';
  sessionSlotId?: string;
}

// Share session as gist
export interface WsShareSessionMessage extends WorkspaceScopedMessage {
  type: 'shareSession';
  sessionSlotId?: string;
}

// OAuth login/logout
export interface WsLoginMessage {
  type: 'login';
  provider: string;
}

export interface WsLogoutMessage {
  type: 'logout';
  provider: string;
}

export interface WsGetAuthProvidersMessage {
  type: 'getAuthProviders';
}

// Scoped models
export interface WsGetScopedModelsMessage extends WorkspaceScopedMessage {
  type: 'getScopedModels';
  sessionSlotId?: string;
}

export interface WsSetScopedModelsMessage extends WorkspaceScopedMessage {
  type: 'setScopedModels';
  sessionSlotId?: string;
  models: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel }>;
}

// Queued messages
export interface WsGetQueuedMessagesMessage extends WorkspaceScopedMessage {
  type: 'getQueuedMessages';
  sessionSlotId?: string;
}

export interface WsClearQueueMessage extends WorkspaceScopedMessage {
  type: 'clearQueue';
  sessionSlotId?: string;
}

// File listing for @ reference
export interface WsListFilesMessage extends WorkspaceScopedMessage {
  type: 'listFiles';
  query?: string;
  limit?: number;
}

export type WsClientMessage =
  // Workspace management (not scoped to a workspace)
  | WsOpenWorkspaceMessage
  | WsCloseWorkspaceMessage
  | WsListWorkspacesMessage
  | WsBrowseDirectoryMessage
  // Session slot management
  | WsCreateSessionSlotMessage
  | WsCloseSessionSlotMessage
  | WsListSessionSlotsMessage
  // UI State persistence
  | WsGetUIStateMessage
  | WsSaveUIStateMessage
  | WsSetThemeMessage
  | WsSetSidebarWidthMessage
  | WsSetDraftInputMessage
  | WsSetActiveSessionMessage
  | WsSetActiveModelMessage
  | WsSetThinkingLevelPrefMessage
  // Workspace-scoped operations (may include sessionSlotId)
  | WsPromptMessage
  | WsSteerMessage
  | WsFollowUpMessage
  | WsAbortMessage
  | WsSetModelMessage
  | WsSetThinkingLevelMessage
  | WsNewSessionMessage
  | WsSwitchSessionMessage
  | WsCompactMessage
  | WsGetStateMessage
  | WsGetMessagesMessage
  | WsGetSessionsMessage
  | WsGetModelsMessage
  | WsGetCommandsMessage
  // Session operations
  | WsForkMessage
  | WsGetForkMessagesMessage
  | WsSetSessionNameMessage
  | WsExportHtmlMessage
  // Model/Thinking cycling
  | WsCycleModelMessage
  | WsCycleThinkingLevelMessage
  // Mode settings
  | WsSetSteeringModeMessage
  | WsSetFollowUpModeMessage
  | WsSetAutoCompactionMessage
  | WsSetAutoRetryMessage
  | WsAbortRetryMessage
  // Bash execution
  | WsBashMessage
  | WsAbortBashMessage
  // Stats
  | WsGetSessionStatsMessage
  | WsGetLastAssistantTextMessage
  // Server management
  | WsDeployMessage
  // Questionnaire
  | WsQuestionnaireResponseMessage
  // Config
  | WsUpdateAllowedRootsMessage
  // New features
  | WsGetSessionTreeMessage
  | WsNavigateTreeMessage
  | WsCopyLastAssistantMessage
  | WsShareSessionMessage
  | WsLoginMessage
  | WsLogoutMessage
  | WsGetAuthProvidersMessage
  | WsGetScopedModelsMessage
  | WsSetScopedModelsMessage
  | WsGetQueuedMessagesMessage
  | WsClearQueueMessage
  | WsListFilesMessage
  // Extension UI
  | WsExtensionUIResponseMessage;

// ============================================================================
// WebSocket Messages (Server -> Client)
// ============================================================================

// Workspace management events
export interface WsWorkspaceOpenedEvent {
  type: 'workspaceOpened';
  workspace: WorkspaceInfo;
  state: SessionState;
  messages: ChatMessage[];
  startupInfo: StartupInfo;
}

export interface WsWorkspaceClosedEvent {
  type: 'workspaceClosed';
  workspaceId: string;
}

// Session slot events
export interface WsSessionSlotCreatedEvent {
  type: 'sessionSlotCreated';
  workspaceId: string;
  sessionSlotId: string;
  state: SessionState;
  messages: ChatMessage[];
}

export interface WsSessionSlotClosedEvent {
  type: 'sessionSlotClosed';
  workspaceId: string;
  sessionSlotId: string;
}

export interface WsSessionSlotsListEvent {
  type: 'sessionSlotsList';
  workspaceId: string;
  slots: Array<{
    slotId: string;
    loadedSessionId: string | null;
    isActive: boolean;
  }>;
}

export interface WsWorkspacesListEvent {
  type: 'workspacesList';
  workspaces: WorkspaceInfo[];
}

export interface WsDirectoryListEvent {
  type: 'directoryList';
  path: string;
  entries: DirectoryEntry[];
  allowedRoots?: string[];
}

export interface WsConnectedEvent {
  type: 'connected';
  workspaces: WorkspaceInfo[];
  allowedRoots: string[];
  homeDirectory: string;
  uiState: UIState;
}

// UI State types
export interface UIState {
  openWorkspaces: string[];
  activeWorkspacePath: string | null;
  draftInputs: Record<string, string>;
  sidebarWidth: number;
  themeId: string | null;
  /** Maps workspace path to active session ID */
  activeSessions: Record<string, string>;
  /** Maps workspace path to selected model */
  activeModels: Record<string, { provider: string; modelId: string }>;
  /** Maps workspace path to thinking level */
  thinkingLevels: Record<string, ThinkingLevel>;
}

export interface WsUIStateEvent {
  type: 'uiState';
  state: UIState;
}

// ============================================================================
// Internal Session Events (emitted by PiSession, no workspaceId yet)
// ============================================================================

export interface SessionAgentStartEvent {
  type: 'agentStart';
}

export interface SessionAgentEndEvent {
  type: 'agentEnd';
}

export interface SessionMessageStartEvent {
  type: 'messageStart';
  message: ChatMessage;
}

export interface SessionMessageUpdateEvent {
  type: 'messageUpdate';
  messageId: string;
  update: MessageUpdate;
}

export interface SessionMessageEndEvent {
  type: 'messageEnd';
  message: ChatMessage;
}

export interface SessionToolStartEvent {
  type: 'toolStart';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface SessionToolUpdateEvent {
  type: 'toolUpdate';
  toolCallId: string;
  partialResult: string;
}

export interface SessionToolEndEvent {
  type: 'toolEnd';
  toolCallId: string;
  result: string;
  isError: boolean;
}

export interface SessionCompactionStartEvent {
  type: 'compactionStart';
}

export interface SessionCompactionEndEvent {
  type: 'compactionEnd';
  summary: string;
}

export type SessionEvent =
  | SessionAgentStartEvent
  | SessionAgentEndEvent
  | SessionMessageStartEvent
  | SessionMessageUpdateEvent
  | SessionMessageEndEvent
  | SessionToolStartEvent
  | SessionToolUpdateEvent
  | SessionToolEndEvent
  | SessionCompactionStartEvent
  | SessionCompactionEndEvent;

// ============================================================================
// Workspace-Scoped Server Events (sent over WebSocket with workspaceId)
// These events may include sessionSlotId when operating on a specific slot
// ============================================================================

export interface WsStateEvent {
  type: 'state';
  workspaceId: string;
  sessionSlotId?: string;
  state: SessionState;
}

export interface WsMessagesEvent {
  type: 'messages';
  workspaceId: string;
  sessionSlotId?: string;
  messages: ChatMessage[];
}

export interface WsSessionsEvent {
  type: 'sessions';
  workspaceId: string;
  sessions: SessionInfo[];
}

export interface WsModelsEvent {
  type: 'models';
  workspaceId: string;
  models: ModelInfo[];
}

export interface WsCommandsEvent {
  type: 'commands';
  workspaceId: string;
  sessionSlotId?: string;
  commands: SlashCommand[];
}

export interface WsAgentStartEvent {
  type: 'agentStart';
  workspaceId: string;
  sessionSlotId?: string;
}

export interface WsAgentEndEvent {
  type: 'agentEnd';
  workspaceId: string;
  sessionSlotId?: string;
}

export interface WsMessageStartEvent {
  type: 'messageStart';
  workspaceId: string;
  sessionSlotId?: string;
  message: ChatMessage;
}

export interface WsMessageUpdateEvent {
  type: 'messageUpdate';
  workspaceId: string;
  sessionSlotId?: string;
  messageId: string;
  update: MessageUpdate;
}

export interface WsMessageEndEvent {
  type: 'messageEnd';
  workspaceId: string;
  sessionSlotId?: string;
  message: ChatMessage;
}

export interface WsToolStartEvent {
  type: 'toolStart';
  workspaceId: string;
  sessionSlotId?: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface WsToolUpdateEvent {
  type: 'toolUpdate';
  workspaceId: string;
  sessionSlotId?: string;
  toolCallId: string;
  partialResult: string;
}

export interface WsToolEndEvent {
  type: 'toolEnd';
  workspaceId: string;
  sessionSlotId?: string;
  toolCallId: string;
  result: string;
  isError: boolean;
}

export interface WsCompactionStartEvent {
  type: 'compactionStart';
  workspaceId: string;
  sessionSlotId?: string;
}

export interface WsCompactionEndEvent {
  type: 'compactionEnd';
  workspaceId: string;
  sessionSlotId?: string;
  summary: string;
}

export interface WsErrorEvent {
  type: 'error';
  message: string;
  code?: string;
  workspaceId?: string; // Optional - errors can be global or workspace-scoped
}

export interface WsDeployStatusEvent {
  type: 'deployStatus';
  status: 'building' | 'restarting' | 'error';
  message?: string;
}

// Fork response
export interface WsForkResultEvent {
  type: 'forkResult';
  workspaceId: string;
  sessionSlotId?: string;
  success: boolean;
  text?: string;
  error?: string;
}

// Fork messages response
export interface WsForkMessagesEvent {
  type: 'forkMessages';
  workspaceId: string;
  sessionSlotId?: string;
  messages: Array<{ entryId: string; text: string }>;
}

// Export HTML response
export interface WsExportHtmlResultEvent {
  type: 'exportHtmlResult';
  workspaceId: string;
  sessionSlotId?: string;
  success: boolean;
  path?: string;
  error?: string;
}

// Session stats response
export interface WsSessionStatsEvent {
  type: 'sessionStats';
  workspaceId: string;
  sessionSlotId?: string;
  stats: SessionStats;
}

// Last assistant text response
export interface WsLastAssistantTextEvent {
  type: 'lastAssistantText';
  workspaceId: string;
  sessionSlotId?: string;
  text: string | null;
}

// Bash execution events
export interface WsBashStartEvent {
  type: 'bashStart';
  workspaceId: string;
  sessionSlotId?: string;
  command: string;
  /** If true, output won't be sent to LLM (!! prefix) */
  excludeFromContext?: boolean;
}

export interface WsBashOutputEvent {
  type: 'bashOutput';
  workspaceId: string;
  sessionSlotId?: string;
  chunk: string;
}

export interface WsBashEndEvent {
  type: 'bashEnd';
  workspaceId: string;
  sessionSlotId?: string;
  result: BashResult;
}

// Questionnaire request (tool needs user input)
export interface WsQuestionnaireRequestEvent {
  type: 'questionnaireRequest';
  workspaceId: string;
  sessionSlotId?: string;
  toolCallId: string;
  questions: QuestionnaireQuestion[];
}

// Config update confirmation
export interface WsAllowedRootsUpdatedEvent {
  type: 'allowedRootsUpdated';
  roots: string[];
}

// ============================================================================
// New Feature Server Events
// ============================================================================

// Session tree response
export interface WsSessionTreeEvent {
  type: 'sessionTree';
  workspaceId: string;
  sessionSlotId?: string;
  tree: SessionTreeNode[];
  currentLeafId: string | null;
}

// Navigate tree result
export interface WsNavigateTreeResultEvent {
  type: 'navigateTreeResult';
  workspaceId: string;
  sessionSlotId?: string;
  success: boolean;
  editorText?: string;
  error?: string;
}

// Copy result
export interface WsCopyResultEvent {
  type: 'copyResult';
  workspaceId: string;
  sessionSlotId?: string;
  success: boolean;
  text?: string;
  error?: string;
}

// Share result
export interface WsShareResultEvent {
  type: 'shareResult';
  workspaceId: string;
  sessionSlotId?: string;
  success: boolean;
  url?: string;
  error?: string;
}

// Auth providers list
export interface WsAuthProvidersEvent {
  type: 'authProviders';
  providers: OAuthProviderInfo[];
  authenticated: string[]; // List of providers with valid auth
}

// Login status
export interface WsLoginStatusEvent {
  type: 'loginStatus';
  provider: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  authUrl?: string; // URL to open for OAuth
}

// Scoped models response
export interface WsScopedModelsEvent {
  type: 'scopedModels';
  workspaceId: string;
  sessionSlotId?: string;
  models: ScopedModelInfo[];
}

// Queued messages response
export interface WsQueuedMessagesEvent {
  type: 'queuedMessages';
  workspaceId: string;
  sessionSlotId?: string;
  steering: string[];
  followUp: string[];
}

// File list response
export interface WsFileListEvent {
  type: 'fileList';
  workspaceId: string;
  files: FileInfo[];
}

export type WsServerEvent =
  // Connection & workspace management
  | WsConnectedEvent
  | WsWorkspaceOpenedEvent
  | WsWorkspaceClosedEvent
  | WsWorkspacesListEvent
  | WsDirectoryListEvent
  // Session slot events
  | WsSessionSlotCreatedEvent
  | WsSessionSlotClosedEvent
  | WsSessionSlotsListEvent
  // UI State
  | WsUIStateEvent
  // Workspace-scoped events (may include sessionSlotId)
  | WsStateEvent
  | WsMessagesEvent
  | WsSessionsEvent
  | WsModelsEvent
  | WsCommandsEvent
  | WsAgentStartEvent
  | WsAgentEndEvent
  | WsMessageStartEvent
  | WsMessageUpdateEvent
  | WsMessageEndEvent
  | WsToolStartEvent
  | WsToolUpdateEvent
  | WsToolEndEvent
  | WsCompactionStartEvent
  | WsCompactionEndEvent
  | WsErrorEvent
  | WsDeployStatusEvent
  // Slot-scoped responses
  | WsForkResultEvent
  | WsForkMessagesEvent
  | WsExportHtmlResultEvent
  | WsSessionStatsEvent
  | WsLastAssistantTextEvent
  | WsBashStartEvent
  | WsBashOutputEvent
  | WsBashEndEvent
  | WsAllowedRootsUpdatedEvent
  // Questionnaire
  | WsQuestionnaireRequestEvent
  // Config
  | WsAllowedRootsUpdatedEvent
  // New features
  | WsSessionTreeEvent
  | WsNavigateTreeResultEvent
  | WsCopyResultEvent
  | WsShareResultEvent
  | WsAuthProvidersEvent
  | WsLoginStatusEvent
  | WsScopedModelsEvent
  | WsQueuedMessagesEvent
  | WsFileListEvent
  // Extension UI
  | WsExtensionUIRequestEvent;

// ============================================================================
// Data Types
// ============================================================================

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface GitInfo {
  branch: string | null;
  changedFiles: number;
}

export interface SessionState {
  sessionId: string;
  sessionName?: string;
  sessionFile?: string;
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled: boolean;
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  messageCount: number;
  tokens: TokenUsage;
  contextWindowPercent: number; // 0-100
  git: GitInfo;
  /** Active questionnaire request, if any */
  questionnaireRequest?: QuestionnaireRequest;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
}

export interface SessionInfo {
  id: string;
  path: string;
  name?: string;
  firstMessage?: string;
  messageCount: number;
  updatedAt: number;
  cwd: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'toolResult';
  timestamp: number;
  content: MessageContent[];
  // For assistant messages
  model?: string;
  provider?: string;
  usage?: TokenUsage;
  // For tool results
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export type MessageContent =
  | TextContent
  | ThinkingContent
  | ToolCallContent
  | ImageContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface ToolCallContent {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'complete' | 'error';
  result?: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    mediaType: string;
    data: string;
  };
}

export interface ImageAttachment {
  type: 'image';
  source: {
    type: 'base64';
    mediaType: string;
    data: string;
  };
}

export interface MessageUpdate {
  type: 'textDelta' | 'thinkingDelta' | 'toolCallUpdate';
  // For text/thinking deltas
  delta?: string;
  contentIndex?: number;
  // For tool call updates
  toolCallId?: string;
  status?: 'pending' | 'running' | 'complete' | 'error';
  result?: string;
}

// ============================================================================
// Session Stats
// ============================================================================

export interface SessionStats {
  sessionFile: string | undefined;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

// ============================================================================
// Bash Execution
// ============================================================================

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  truncated: boolean;
}

// ============================================================================
// Slash Commands
// ============================================================================

export interface SlashCommand {
  /** Command name (without leading slash) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** What kind of command this is */
  source: 'extension' | 'template' | 'skill';
  /** File path to the command source (if available) */
  path?: string;
}

// ============================================================================
// Questionnaire Types
// ============================================================================

export interface QuestionnaireOption {
  /** The value returned when selected */
  value: string;
  /** Display label for the option */
  label: string;
  /** Optional description shown below label */
  description?: string;
}

export interface QuestionnaireQuestion {
  /** Unique identifier for this question */
  id: string;
  /** Short contextual label for tab bar (defaults to Q1, Q2) */
  label?: string;
  /** The full question text to display */
  prompt: string;
  /** Available options to choose from */
  options: QuestionnaireOption[];
  /** Allow 'Type something' option (default: true) */
  allowOther?: boolean;
}

export interface QuestionnaireAnswer {
  /** Question ID */
  id: string;
  /** Selected or typed value */
  value: string;
  /** Display label for the answer */
  label: string;
  /** Whether the answer was a custom text input */
  wasCustom: boolean;
  /** 1-based index of selected option (if not custom) */
  index?: number;
}

export interface QuestionnaireRequest {
  /** Tool call ID that requested the questionnaire */
  toolCallId: string;
  /** Questions to present to the user */
  questions: QuestionnaireQuestion[];
}

export interface QuestionnaireResponse {
  /** Tool call ID this response is for */
  toolCallId: string;
  /** User's answers */
  answers: QuestionnaireAnswer[];
  /** Whether the user cancelled */
  cancelled: boolean;
}

// ============================================================================
// Startup Info Types (displayed on workspace load)
// ============================================================================

export interface StartupResourceInfo {
  /** Resource name (e.g., skill name, extension name) */
  name: string;
  /** File path to the resource */
  path: string;
  /** Optional description */
  description?: string;
  /** Source scope (user or project) */
  scope: 'user' | 'project';
}

export interface StartupInfo {
  /** Pi version */
  version: string;
  /** Context files loaded (AGENTS.md, etc.) */
  contextFiles: string[];
  /** Available skills grouped by scope */
  skills: StartupResourceInfo[];
  /** Loaded extensions grouped by scope */
  extensions: StartupResourceInfo[];
  /** Available themes grouped by scope */
  themes: StartupResourceInfo[];
  /** Keyboard shortcuts hint */
  shortcuts: Array<{ key: string; description: string }>;
}

// ============================================================================
// New Feature Data Types
// ============================================================================

/** Session tree node for /tree navigation */
export interface SessionTreeNode {
  id: string;
  parentId: string | null;
  type: 'message' | 'compaction' | 'branch_summary' | 'model_change' | 'thinking_level_change' | 'other';
  /** For message nodes: role */
  role?: 'user' | 'assistant' | 'toolResult';
  /** Preview text for display */
  text: string;
  /** User-defined label/bookmark */
  label?: string;
  /** Timestamp */
  timestamp: number;
  /** Child nodes */
  children: SessionTreeNode[];
}

/** OAuth provider info */
export interface OAuthProviderInfo {
  id: string;
  name: string;
  /** Whether this provider supports OAuth login */
  supportsOAuth: boolean;
}

/** Scoped model info (for Ctrl+P cycling) */
export interface ScopedModelInfo {
  provider: string;
  modelId: string;
  modelName: string;
  thinkingLevel: ThinkingLevel;
  /** Whether this model is currently enabled for cycling */
  enabled: boolean;
}

/** File info for @ reference */
export interface FileInfo {
  /** Relative path from workspace root */
  path: string;
  /** File name only */
  name: string;
  /** Whether it's a directory */
  isDirectory: boolean;
}

// ============================================================================
// Extension UI Types (for interactive extension commands like /review)
// ============================================================================

/** Extension UI request types */
export type ExtensionUIRequestType = 'select' | 'confirm' | 'input' | 'editor' | 'notify';

/** Option for select request */
export interface ExtensionUISelectOption {
  value: string;
  label: string;
  description?: string;
}

/** Base interface for extension UI requests */
interface ExtensionUIRequestBase {
  /** Unique request ID for matching responses */
  requestId: string;
  /** Timeout in milliseconds (optional) */
  timeout?: number;
}

/** Select from a list of options */
export interface ExtensionUISelectRequest extends ExtensionUIRequestBase {
  method: 'select';
  title: string;
  options: string[] | ExtensionUISelectOption[];
}

/** Confirm a yes/no question */
export interface ExtensionUIConfirmRequest extends ExtensionUIRequestBase {
  method: 'confirm';
  title: string;
  message: string;
}

/** Input a single line of text */
export interface ExtensionUIInputRequest extends ExtensionUIRequestBase {
  method: 'input';
  title: string;
  placeholder?: string;
}

/** Multi-line text editor */
export interface ExtensionUIEditorRequest extends ExtensionUIRequestBase {
  method: 'editor';
  title: string;
  prefill?: string;
}

/** Notification (no response needed) */
export interface ExtensionUINotifyRequest {
  method: 'notify';
  message: string;
  notifyType?: 'info' | 'warning' | 'error';
}

/** Union of all extension UI request types */
export type ExtensionUIRequest =
  | ExtensionUISelectRequest
  | ExtensionUIConfirmRequest
  | ExtensionUIInputRequest
  | ExtensionUIEditorRequest
  | ExtensionUINotifyRequest;

/** Extension UI response */
export interface ExtensionUIResponse {
  /** The request ID this response is for */
  requestId: string;
  /** Whether the user cancelled */
  cancelled: boolean;
  /** The result value (type depends on request type) */
  value?: string | boolean;
}

// ============================================================================
// Extension UI WebSocket Messages
// ============================================================================

/** Server -> Client: Extension needs UI interaction */
export interface WsExtensionUIRequestEvent {
  type: 'extensionUIRequest';
  workspaceId: string;
  sessionSlotId?: string;
  request: ExtensionUIRequest;
}

/** Client -> Server: User responded to extension UI */
export interface WsExtensionUIResponseMessage {
  type: 'extensionUIResponse';
  workspaceId: string;
  sessionSlotId?: string;
  response: ExtensionUIResponse;
}
