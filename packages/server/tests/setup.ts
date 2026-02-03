import { vi } from 'vitest';

// Mock the Pi SDK
vi.mock('@mariozechner/pi-coding-agent', () => ({
  AgentSession: vi.fn(),
  ModelRegistry: vi.fn(),
  createAgentSession: vi.fn(),
}));
