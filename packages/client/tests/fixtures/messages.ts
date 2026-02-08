import type { ChatMessage, SessionState, SessionInfo, ModelInfo, SlashCommand, StartupInfo } from '@pi-deck/shared';

export const mockUserMessage: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: [{ type: 'text', text: 'Hello, how are you?' }],
  timestamp: Date.now(),
};

export const mockAssistantMessage: ChatMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: [{ type: 'text', text: 'I am doing well, thank you for asking!' }],
  timestamp: Date.now(),
};

export const mockToolCallMessage: ChatMessage = {
  id: 'msg-3',
  role: 'assistant',
  content: [
    { type: 'text', text: 'Let me read that file for you.' },
    {
      type: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { path: '/path/to/file.ts' },
    },
  ],
  timestamp: Date.now(),
};

export const mockToolResultMessage: ChatMessage = {
  id: 'msg-4',
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: 'export function hello() { return "world"; }',
    },
  ],
  timestamp: Date.now(),
};

export const mockMessages: ChatMessage[] = [
  mockUserMessage,
  mockAssistantMessage,
  mockToolCallMessage,
  mockToolResultMessage,
];

export const mockSessionState: SessionState = {
  currentModel: {
    provider: 'anthropic',
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
  },
  contextUsage: {
    used: 10000,
    total: 200000,
    percentage: 5,
  },
  thinkingLevel: 'off',
  isStreaming: false,
  isCompacting: false,
  autoCompactionEnabled: true,
  autoRetryEnabled: true,
  steeringMode: 'interrupt',
  followUpMode: 'instant',
};

export const mockStreamingState: SessionState = {
  ...mockSessionState,
  isStreaming: true,
};

export const mockModels: ModelInfo[] = [
  { provider: 'anthropic', id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { provider: 'anthropic', id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
];

export const mockSessions: SessionInfo[] = [
  { id: 'session-1', name: 'Session 1', isActive: true, messageCount: 10 },
  { id: 'session-2', name: 'Session 2', isActive: false, messageCount: 5 },
];

export const mockCommands: SlashCommand[] = [
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'compact', description: 'Compact the context' },
  { name: 'model', description: 'Change the model' },
];

export const mockStartupInfo: StartupInfo = {
  version: '1.0.0',
  contextFiles: ['AGENTS.md', '.pi/AGENTS.md'],
  skills: [
    { name: 'tdd', path: '/path/to/tdd', description: 'Test-driven development', scope: 'user' },
  ],
  extensions: [
    { name: 'git', path: '/path/to/git', description: 'Git integration', scope: 'project' },
  ],
  themes: [
    { name: 'cobalt2', path: '/path/to/cobalt2', description: 'Cobalt2 theme', scope: 'user' },
  ],
  shortcuts: [
    { key: '⌘Enter', description: 'Send message' },
    { key: '⌘K', description: 'Clear conversation' },
  ],
};
