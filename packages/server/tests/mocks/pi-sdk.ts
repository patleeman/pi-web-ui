import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Mock AgentSession for testing
 */
export class MockAgentSession extends EventEmitter {
  isStreaming = false;
  isCompacting = false;
  autoCompactionEnabled = true;
  autoRetryEnabled = true;
  steeringMode: 'interrupt' | 'queue' = 'interrupt';
  followUpMode: 'instant' | 'queue' = 'instant';
  thinkingLevel: 'off' | 'low' | 'medium' | 'high' = 'off';
  
  private _currentModel = { provider: 'anthropic', id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' };
  private _messages: any[] = [];
  private _sessionManager = {
    getTree: () => [],
    getLeafId: () => 'leaf-1',
  };
  
  get currentModel() {
    return this._currentModel;
  }
  
  get sessionManager() {
    return this._sessionManager;
  }

  // Mock methods
  prompt = vi.fn().mockImplementation(async (message: string) => {
    this.isStreaming = true;
    this.emit('agent_start');
    
    // Simulate streaming
    setTimeout(() => {
      this.emit('text', { text: 'Mock response to: ' + message });
      this.isStreaming = false;
      this.emit('agent_end', { cancelled: false, aborted: false });
    }, 10);
  });

  steer = vi.fn().mockResolvedValue(undefined);
  followUp = vi.fn().mockResolvedValue(undefined);
  abort = vi.fn().mockResolvedValue(undefined);
  
  setModel = vi.fn().mockImplementation((provider: string, modelId: string) => {
    this._currentModel = { provider, id: modelId, name: modelId };
  });
  
  setThinkingLevel = vi.fn().mockImplementation((level: string) => {
    this.thinkingLevel = level as any;
  });
  
  setSteeringMode = vi.fn().mockImplementation((mode: string) => {
    this.steeringMode = mode as any;
  });
  
  setFollowUpMode = vi.fn().mockImplementation((mode: string) => {
    this.followUpMode = mode as any;
  });
  
  setAutoCompaction = vi.fn().mockImplementation((enabled: boolean) => {
    this.autoCompactionEnabled = enabled;
  });
  
  setAutoRetry = vi.fn().mockImplementation((enabled: boolean) => {
    this.autoRetryEnabled = enabled;
  });
  
  newSession = vi.fn().mockResolvedValue(undefined);
  switchSession = vi.fn().mockResolvedValue(undefined);
  compact = vi.fn().mockResolvedValue(undefined);
  
  getMessages = vi.fn().mockReturnValue(this._messages);
  getSessions = vi.fn().mockReturnValue([
    { id: 'session-1', name: 'Session 1', isActive: true, messageCount: 0 },
  ]);
  
  getContextUsage = vi.fn().mockReturnValue({
    used: 10000,
    total: 200000,
  });
  
  getSteeringMessages = vi.fn().mockReturnValue([]);
  getFollowUpMessages = vi.fn().mockReturnValue([]);
  clearQueue = vi.fn().mockReturnValue({ steering: [], followUp: [] });
  
  executeBash = vi.fn().mockImplementation(async (command: string, onChunk?: (chunk: string) => void) => {
    if (onChunk) {
      onChunk('mock output\n');
    }
    return { output: 'mock output\n', exitCode: 0 };
  });
  
  abortBash = vi.fn();
  
  fork = vi.fn().mockResolvedValue(undefined);
  setSessionName = vi.fn().mockResolvedValue(undefined);
  exportHtml = vi.fn().mockResolvedValue('<html>mock</html>');
  
  cycleModel = vi.fn();
  cycleThinkingLevel = vi.fn();
  
  navigateTree = vi.fn().mockResolvedValue({ cancelled: false, aborted: false });
  
  dispose = vi.fn();
  
  subscribe = vi.fn().mockReturnValue(() => {});
  
  bindExtensions = vi.fn().mockResolvedValue(undefined);
  
  get scopedModels() {
    return [];
  }
  
  setScopedModels = vi.fn();
}

/**
 * Mock ModelRegistry for testing
 */
export class MockModelRegistry {
  private models = [
    { provider: 'anthropic', id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { provider: 'anthropic', id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
  ];
  
  getAvailable = vi.fn().mockResolvedValue(this.models);
  getDefault = vi.fn().mockReturnValue(this.models[0]);
  find = vi.fn().mockImplementation((provider: string, id: string) => {
    return this.models.find(m => m.provider === provider && m.id === id);
  });
}

/**
 * Mock createAgentSession factory
 */
export const createMockAgentSession = vi.fn().mockImplementation(() => {
  return new MockAgentSession();
});

/**
 * Mock the entire Pi SDK module
 */
export function getMockPiSdk() {
  return {
    AgentSession: MockAgentSession,
    ModelRegistry: MockModelRegistry,
    createAgentSession: createMockAgentSession,
  };
}
