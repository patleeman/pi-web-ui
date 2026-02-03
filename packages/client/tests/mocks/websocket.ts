import { vi } from 'vitest';
import type { WsClientMessage, WsServerEvent } from '@pi-web-ui/shared';

/**
 * Mock WebSocket for testing
 */
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private sentMessages: WsClientMessage[] = [];
  private messageHandlers: Array<(msg: WsClientMessage) => WsServerEvent | WsServerEvent[] | null> = [];

  constructor(url: string) {
    this.url = url;
    // Auto-connect after a tick
    setTimeout(() => this.simulateOpen(), 0);
  }

  send(data: string): void {
    const message = JSON.parse(data) as WsClientMessage;
    this.sentMessages.push(message);

    // Process through handlers
    for (const handler of this.messageHandlers) {
      const response = handler(message);
      if (response) {
        const responses = Array.isArray(response) ? response : [response];
        for (const r of responses) {
          setTimeout(() => this.simulateMessage(r), 0);
        }
      }
    }
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: WsServerEvent): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  getSentMessages(): WsClientMessage[] {
    return this.sentMessages;
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Add a handler that receives messages and optionally returns responses
   */
  onReceive(handler: (msg: WsClientMessage) => WsServerEvent | WsServerEvent[] | null): void {
    this.messageHandlers.push(handler);
  }
}

/**
 * Create a mock WebSocket class that can be injected
 */
export function createMockWebSocketClass() {
  let instance: MockWebSocket | null = null;

  const MockWS = vi.fn().mockImplementation((url: string) => {
    instance = new MockWebSocket(url);
    return instance;
  }) as unknown as typeof WebSocket & { getInstance: () => MockWebSocket | null };

  MockWS.getInstance = () => instance;
  MockWS.CONNECTING = MockWebSocket.CONNECTING;
  MockWS.OPEN = MockWebSocket.OPEN;
  MockWS.CLOSING = MockWebSocket.CLOSING;
  MockWS.CLOSED = MockWebSocket.CLOSED;

  return MockWS;
}

/**
 * Install mock WebSocket globally
 */
export function installMockWebSocket(): ReturnType<typeof createMockWebSocketClass> {
  const MockWS = createMockWebSocketClass();
  vi.stubGlobal('WebSocket', MockWS);
  return MockWS;
}
