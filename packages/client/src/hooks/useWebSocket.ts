import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  ModelInfo,
  SessionInfo,
  SessionState,
  ThinkingLevel,
  WsClientMessage,
  WsServerEvent,
  ImageAttachment,
} from '@pi-web-ui/shared';

interface ToolExecution {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
}

interface UseWebSocketReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Session state
  state: SessionState | null;
  messages: ChatMessage[];
  sessions: SessionInfo[];
  models: ModelInfo[];

  // Streaming state
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolExecutions: ToolExecution[];

  // Actions
  sendPrompt: (message: string, images?: ImageAttachment[]) => void;
  steer: (message: string) => void;
  followUp: (message: string) => void;
  abort: () => void;
  setModel: (provider: string, modelId: string) => void;
  setThinkingLevel: (level: ThinkingLevel) => void;
  newSession: () => void;
  switchSession: (sessionId: string) => void;
  compact: (customInstructions?: string) => void;
  refreshSessions: () => void;
  refreshModels: () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [activeToolExecutions, setActiveToolExecutions] = useState<ToolExecution[]>([]);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleEvent = useCallback((event: WsServerEvent) => {
    switch (event.type) {
      case 'connected':
        setState(event.state);
        send({ type: 'getMessages' });
        send({ type: 'getSessions' });
        send({ type: 'getModels' });
        break;

      case 'state':
        setState(event.state);
        break;

      case 'messages':
        setMessages(event.messages);
        break;

      case 'sessions':
        setSessions(event.sessions);
        break;

      case 'models':
        setModels(event.models);
        break;

      case 'agentStart':
        setIsStreaming(true);
        setStreamingText('');
        setStreamingThinking('');
        break;

      case 'agentEnd':
        setIsStreaming(false);
        setStreamingText('');
        setStreamingThinking('');
        setActiveToolExecutions([]);
        send({ type: 'getState' });
        break;

      case 'messageStart':
        // Add the message to the list
        setMessages((prev) => [...prev, event.message]);
        break;

      case 'messageUpdate':
        if (event.update.type === 'textDelta' && event.update.delta) {
          setStreamingText((prev) => prev + event.update.delta);
        } else if (event.update.type === 'thinkingDelta' && event.update.delta) {
          setStreamingThinking((prev) => prev + event.update.delta);
        }
        break;

      case 'messageEnd':
        // Update the message in the list with final content
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message.id ? event.message : m))
        );
        setStreamingText('');
        setStreamingThinking('');
        break;

      case 'toolStart':
        setActiveToolExecutions((prev) => [
          ...prev,
          {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            status: 'running',
          },
        ]);
        break;

      case 'toolUpdate':
        setActiveToolExecutions((prev) =>
          prev.map((t) =>
            t.toolCallId === event.toolCallId
              ? { ...t, result: event.partialResult }
              : t
          )
        );
        break;

      case 'toolEnd':
        setActiveToolExecutions((prev) =>
          prev.map((t) =>
            t.toolCallId === event.toolCallId
              ? { ...t, status: event.isError ? 'error' : 'complete', result: event.result, isError: event.isError }
              : t
          )
        );
        break;

      case 'compactionStart':
        // Could show a loading indicator
        break;

      case 'compactionEnd':
        send({ type: 'getMessages' });
        send({ type: 'getState' });
        break;

      case 'error':
        setError(event.message);
        break;
    }
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // Attempt to reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onmessage = (event) => {
      try {
        const data: WsServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }, [url, handleEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    isConnected,
    isConnecting,
    error,
    state,
    messages,
    sessions,
    models,
    isStreaming,
    streamingText,
    streamingThinking,
    activeToolExecutions,

    sendPrompt: (message: string, images?: ImageAttachment[]) => {
      send({ type: 'prompt', message, images });
    },
    steer: (message: string) => send({ type: 'steer', message }),
    followUp: (message: string) => send({ type: 'followUp', message }),
    abort: () => send({ type: 'abort' }),
    setModel: (provider: string, modelId: string) => {
      send({ type: 'setModel', provider, modelId });
    },
    setThinkingLevel: (level: ThinkingLevel) => {
      send({ type: 'setThinkingLevel', level });
    },
    newSession: () => send({ type: 'newSession' }),
    switchSession: (sessionId: string) => {
      send({ type: 'switchSession', sessionId });
    },
    compact: (customInstructions?: string) => {
      send({ type: 'compact', customInstructions });
    },
    refreshSessions: () => send({ type: 'getSessions' }),
    refreshModels: () => send({ type: 'getModels' }),
  };
}
