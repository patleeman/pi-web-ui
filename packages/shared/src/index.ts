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

// Base interface for workspace-scoped messages
interface WorkspaceScopedMessage {
  workspaceId: string;
}

export interface WsPromptMessage extends WorkspaceScopedMessage {
  type: 'prompt';
  message: string;
  images?: ImageAttachment[];
}

export interface WsSteerMessage extends WorkspaceScopedMessage {
  type: 'steer';
  message: string;
}

export interface WsFollowUpMessage extends WorkspaceScopedMessage {
  type: 'followUp';
  message: string;
}

export interface WsAbortMessage extends WorkspaceScopedMessage {
  type: 'abort';
}

export interface WsSetModelMessage extends WorkspaceScopedMessage {
  type: 'setModel';
  provider: string;
  modelId: string;
}

export interface WsSetThinkingLevelMessage extends WorkspaceScopedMessage {
  type: 'setThinkingLevel';
  level: ThinkingLevel;
}

export interface WsNewSessionMessage extends WorkspaceScopedMessage {
  type: 'newSession';
}

export interface WsSwitchSessionMessage extends WorkspaceScopedMessage {
  type: 'switchSession';
  sessionId: string;
}

export interface WsCompactMessage extends WorkspaceScopedMessage {
  type: 'compact';
  customInstructions?: string;
}

export interface WsGetStateMessage extends WorkspaceScopedMessage {
  type: 'getState';
}

export interface WsGetMessagesMessage extends WorkspaceScopedMessage {
  type: 'getMessages';
}

export interface WsGetSessionsMessage extends WorkspaceScopedMessage {
  type: 'getSessions';
}

export interface WsGetModelsMessage extends WorkspaceScopedMessage {
  type: 'getModels';
}

export type WsClientMessage =
  // Workspace management (not scoped to a workspace)
  | WsOpenWorkspaceMessage
  | WsCloseWorkspaceMessage
  | WsListWorkspacesMessage
  | WsBrowseDirectoryMessage
  // Workspace-scoped operations
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
  | WsGetModelsMessage;

// ============================================================================
// WebSocket Messages (Server -> Client)
// ============================================================================

// Workspace management events
export interface WsWorkspaceOpenedEvent {
  type: 'workspaceOpened';
  workspace: WorkspaceInfo;
  state: SessionState;
  messages: ChatMessage[];
}

export interface WsWorkspaceClosedEvent {
  type: 'workspaceClosed';
  workspaceId: string;
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
// ============================================================================

export interface WsStateEvent {
  type: 'state';
  workspaceId: string;
  state: SessionState;
}

export interface WsMessagesEvent {
  type: 'messages';
  workspaceId: string;
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

export interface WsAgentStartEvent {
  type: 'agentStart';
  workspaceId: string;
}

export interface WsAgentEndEvent {
  type: 'agentEnd';
  workspaceId: string;
}

export interface WsMessageStartEvent {
  type: 'messageStart';
  workspaceId: string;
  message: ChatMessage;
}

export interface WsMessageUpdateEvent {
  type: 'messageUpdate';
  workspaceId: string;
  messageId: string;
  update: MessageUpdate;
}

export interface WsMessageEndEvent {
  type: 'messageEnd';
  workspaceId: string;
  message: ChatMessage;
}

export interface WsToolStartEvent {
  type: 'toolStart';
  workspaceId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface WsToolUpdateEvent {
  type: 'toolUpdate';
  workspaceId: string;
  toolCallId: string;
  partialResult: string;
}

export interface WsToolEndEvent {
  type: 'toolEnd';
  workspaceId: string;
  toolCallId: string;
  result: string;
  isError: boolean;
}

export interface WsCompactionStartEvent {
  type: 'compactionStart';
  workspaceId: string;
}

export interface WsCompactionEndEvent {
  type: 'compactionEnd';
  workspaceId: string;
  summary: string;
}

export interface WsErrorEvent {
  type: 'error';
  message: string;
  code?: string;
  workspaceId?: string; // Optional - errors can be global or workspace-scoped
}

export type WsServerEvent =
  // Connection & workspace management
  | WsConnectedEvent
  | WsWorkspaceOpenedEvent
  | WsWorkspaceClosedEvent
  | WsWorkspacesListEvent
  | WsDirectoryListEvent
  // Workspace-scoped events
  | WsStateEvent
  | WsMessagesEvent
  | WsSessionsEvent
  | WsModelsEvent
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
  | WsErrorEvent;

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
  messageCount: number;
  tokens: TokenUsage;
  contextWindowPercent: number; // 0-100
  git: GitInfo;
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
