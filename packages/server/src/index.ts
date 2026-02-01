import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { loadConfig } from './config.js';
import { DirectoryBrowser } from './directory-browser.js';
import { SessionOrchestrator } from './session-orchestrator.js';
import type { WsClientMessage, WsServerEvent } from '@pi-web-ui/shared';

// Load configuration
const config = loadConfig();
const PORT = config.port;

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDistPath = join(__dirname, '../../client/dist');

if (existsSync(clientDistPath)) {
  console.log(`[Server] Serving static files from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Create shared services
const directoryBrowser = new DirectoryBrowser(config.allowedDirectories);

// Track orchestrator per WebSocket connection
const orchestrators = new Map<WebSocket, SessionOrchestrator>();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    allowedDirectories: config.allowedDirectories,
  });
});

// WebSocket connection handler
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');

  // Create an orchestrator for this connection
  const orchestrator = new SessionOrchestrator(config.allowedDirectories);
  orchestrators.set(ws, orchestrator);

  // Forward orchestrator events to WebSocket
  orchestrator.on('event', (event: WsServerEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  // Send initial connected event
  send(ws, {
    type: 'connected',
    workspaces: [],
    allowedRoots: config.allowedDirectories,
  });

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message: WsClientMessage = JSON.parse(data.toString());
      await handleMessage(ws, orchestrator, message);
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
    orchestrator.dispose();
    orchestrators.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

async function handleMessage(
  ws: WebSocket,
  orchestrator: SessionOrchestrator,
  message: WsClientMessage
) {
  switch (message.type) {
    // Workspace management
    case 'openWorkspace': {
      const result = await orchestrator.openWorkspace(message.path);
      send(ws, {
        type: 'workspaceOpened',
        workspace: result.workspace,
        state: result.state,
        messages: result.messages,
      });
      break;
    }

    case 'closeWorkspace': {
      orchestrator.closeWorkspace(message.workspaceId);
      send(ws, {
        type: 'workspaceClosed',
        workspaceId: message.workspaceId,
      });
      break;
    }

    case 'listWorkspaces': {
      send(ws, {
        type: 'workspacesList',
        workspaces: orchestrator.listWorkspaces(),
      });
      break;
    }

    case 'browseDirectory': {
      if (message.path) {
        const entries = directoryBrowser.browse(message.path);
        send(ws, {
          type: 'directoryList',
          path: message.path,
          entries,
        });
      } else {
        // Return allowed roots
        send(ws, {
          type: 'directoryList',
          path: '/',
          entries: directoryBrowser.listRoots(),
          allowedRoots: directoryBrowser.getAllowedDirectories(),
        });
      }
      break;
    }

    // Workspace-scoped operations
    case 'prompt': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.prompt(message.message, message.images);
      break;
    }

    case 'steer': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.steer(message.message);
      break;
    }

    case 'followUp': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.followUp(message.message);
      break;
    }

    case 'abort': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.abort();
      break;
    }

    case 'setModel': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.setModel(message.provider, message.modelId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'setThinkingLevel': {
      const session = orchestrator.getSession(message.workspaceId);
      session.setThinkingLevel(message.level);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'newSession': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.newSession();
      // Send updated state
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      // Send empty messages for new session
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        messages: session.getMessages(),
      });
      // Refresh sessions list to include the new session
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await session.listSessions(),
      });
      break;
    }

    case 'switchSession': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.switchSession(message.sessionId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        messages: session.getMessages(),
      });
      break;
    }

    case 'compact': {
      const session = orchestrator.getSession(message.workspaceId);
      await session.compact(message.customInstructions);
      break;
    }

    case 'getState': {
      const session = orchestrator.getSession(message.workspaceId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'getMessages': {
      const session = orchestrator.getSession(message.workspaceId);
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        messages: session.getMessages(),
      });
      break;
    }

    case 'getSessions': {
      const session = orchestrator.getSession(message.workspaceId);
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await session.listSessions(),
      });
      break;
    }

    case 'getModels': {
      const session = orchestrator.getSession(message.workspaceId);
      send(ws, {
        type: 'models',
        workspaceId: message.workspaceId,
        models: await session.getAvailableModels(),
      });
      break;
    }

    case 'getCommands': {
      const session = orchestrator.getSession(message.workspaceId);
      send(ws, {
        type: 'commands',
        workspaceId: message.workspaceId,
        commands: session.getCommands(),
      });
      break;
    }

    default:
      console.warn('[WS] Unknown message type:', (message as { type: string }).type);
  }
}

function send(ws: WebSocket, event: WsServerEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

// SPA fallback - serve index.html for unmatched routes
if (existsSync(clientDistPath)) {
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
}

server.listen(PORT, config.host, () => {
  console.log(`[Server] Pi Web UI server running on http://${config.host}:${PORT}`);
  console.log(`[Server] Allowed directories: ${config.allowedDirectories.join(', ')}`);
  console.log(`[Server] WebSocket endpoint: ws://${config.host}:${PORT}/ws`);
});
