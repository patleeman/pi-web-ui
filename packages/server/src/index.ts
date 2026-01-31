import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PiSession } from './pi-session.js';
import type { WsClientMessage, WsServerEvent } from '@pi-web-ui/shared';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const CWD = process.env.PI_CWD || process.cwd();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track active sessions per WebSocket connection
const sessions = new Map<WebSocket, PiSession>();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', cwd: CWD });
});

// WebSocket connection handler
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');

  // Create a new Pi session for this connection
  const session = new PiSession(CWD);
  sessions.set(ws, session);

  // Forward Pi events to WebSocket
  session.on('event', (event: WsServerEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  // Initialize session and send connected event
  try {
    await session.initialize();
    const state = await session.getState();
    send(ws, { type: 'connected', state });
  } catch (error) {
    console.error('[WS] Failed to initialize session:', error);
    send(ws, {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to initialize session',
    });
  }

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message: WsClientMessage = JSON.parse(data.toString());
      await handleMessage(ws, session, message);
    } catch (error) {
      console.error('[WS] Error handling message:', error);
      send(ws, {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Clean up on disconnect
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    session.dispose();
    sessions.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

async function handleMessage(ws: WebSocket, session: PiSession, message: WsClientMessage) {
  switch (message.type) {
    case 'prompt':
      await session.prompt(message.message, message.images);
      break;

    case 'steer':
      await session.steer(message.message);
      break;

    case 'followUp':
      await session.followUp(message.message);
      break;

    case 'abort':
      await session.abort();
      break;

    case 'setModel':
      await session.setModel(message.provider, message.modelId);
      send(ws, { type: 'state', state: await session.getState() });
      break;

    case 'setThinkingLevel':
      session.setThinkingLevel(message.level);
      send(ws, { type: 'state', state: await session.getState() });
      break;

    case 'newSession':
      await session.newSession();
      send(ws, { type: 'state', state: await session.getState() });
      break;

    case 'switchSession':
      await session.switchSession(message.sessionId);
      send(ws, { type: 'state', state: await session.getState() });
      send(ws, { type: 'messages', messages: session.getMessages() });
      break;

    case 'compact':
      await session.compact(message.customInstructions);
      break;

    case 'getState':
      send(ws, { type: 'state', state: await session.getState() });
      break;

    case 'getMessages':
      send(ws, { type: 'messages', messages: session.getMessages() });
      break;

    case 'getSessions':
      send(ws, { type: 'sessions', sessions: await session.listSessions() });
      break;

    case 'getModels':
      send(ws, { type: 'models', models: await session.getAvailableModels() });
      break;

    default:
      console.warn('[WS] Unknown message type:', (message as { type: string }).type);
  }
}

function send(ws: WebSocket, event: WsServerEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

server.listen(PORT, () => {
  console.log(`[Server] Pi Web UI server running on http://localhost:${PORT}`);
  console.log(`[Server] Working directory: ${CWD}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
