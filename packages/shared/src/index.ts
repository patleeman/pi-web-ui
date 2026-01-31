/**
 * Shared types for Pi Web UI
 * Used by both server and client
 */

// ============================================================================
// WebSocket Messages (Client -> Server)
// ============================================================================

export interface WsPromptMessage {
  type: 'prompt';
  message: string;
  images?: ImageAttachment[];
}

export interface WsSteerMessage {
  type: 'steer';
  message: string;
}

export interface WsFollowUpMessage {
  type: 'followUp';
  message: string;
}

export interface WsAbortMessage {
  type: 'abort';
}

export interface WsSetModelMessage {
  type: 'setModel';
  provider: string;
  modelId: string;
}

export interface WsSetThinkingLevelMessage {
  type: 'setThinkingLevel';
  level: ThinkingLevel;
}

export interface WsNewSessionMessage {
  type: 'newSession';
}

export interface WsSwitchSessionMessage {
  type: 'switchSession';
  sessionId: string;
}

export interface WsCompactMessage {
  type: 'compact';
  customInstructions?: string;
}

export interface WsGetStateMessage {
  type: 'getState';
}

export interface WsGetMessagesMessage {
  type: 'getMessages';
}

export interface WsGetSessionsMessage {
  type: 'getSessions';
}

export interface WsGetModelsMessage {
  type: 'getModels';
}

export type WsClientMessage =
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

export interface WsConnectedEvent {
  type: 'connected';
  state: SessionState;
}

export interface WsStateEvent {
  type: 'state';
  state: SessionState;
}

export interface WsMessagesEvent {
  type: 'messages';
  messages: ChatMessage[];
}

export interface WsSessionsEvent {
  type: 'sessions';
  sessions: SessionInfo[];
}

export interface WsModelsEvent {
  type: 'models';
  models: ModelInfo[];
}

export interface WsAgentStartEvent {
  type: 'agentStart';
}

export interface WsAgentEndEvent {
  type: 'agentEnd';
}

export interface WsMessageStartEvent {
  type: 'messageStart';
  message: ChatMessage;
}

export interface WsMessageUpdateEvent {
  type: 'messageUpdate';
  messageId: string;
  update: MessageUpdate;
}

export interface WsMessageEndEvent {
  type: 'messageEnd';
  message: ChatMessage;
}

export interface WsToolStartEvent {
  type: 'toolStart';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface WsToolUpdateEvent {
  type: 'toolUpdate';
  toolCallId: string;
  partialResult: string;
}

export interface WsToolEndEvent {
  type: 'toolEnd';
  toolCallId: string;
  result: string;
  isError: boolean;
}

export interface WsCompactionStartEvent {
  type: 'compactionStart';
}

export interface WsCompactionEndEvent {
  type: 'compactionEnd';
  summary: string;
}

export interface WsErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export type WsServerEvent =
  | WsConnectedEvent
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
  cost: number;
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
