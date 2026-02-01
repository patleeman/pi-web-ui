import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { loadConfig } from './config.js';
import { DirectoryBrowser } from './directory-browser.js';
import { getWorkspaceManager, WorkspaceManager } from './workspace-manager.js';
import { getUIStateStore } from './ui-state.js';
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

// Create shared services (singletons)
const directoryBrowser = new DirectoryBrowser(config.allowedDirectories);
const uiStateStore = getUIStateStore();
const workspaceManager = getWorkspaceManager(config.allowedDirectories);

// Track which workspaces each WebSocket is attached to
const clientWorkspaces = new Map<WebSocket, Set<string>>();

// Forward workspace manager events to connected clients
workspaceManager.on('event', (event: WsServerEvent) => {
  // Broadcast to all clients that are attached to this workspace
  if ('workspaceId' in event && event.workspaceId) {
    const workspaceId = event.workspaceId;
    for (const [ws, workspaceIds] of clientWorkspaces.entries()) {
      if (workspaceIds.has(workspaceId) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }
  }
});

// Log buffered events (optional - for debugging)
workspaceManager.on('bufferedEvent', (event: WsServerEvent) => {
  if ('workspaceId' in event) {
    console.log(`[WorkspaceManager] Buffering event for disconnected workspace: ${event.type}`);
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    allowedDirectories: config.allowedDirectories,
    activeWorkspaces: workspaceManager.listWorkspaces().length,
  });
});

// WebSocket connection handler
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');

  // Track workspaces this client is attached to
  clientWorkspaces.set(ws, new Set());

  // Send initial connected event with persisted UI state
  const uiState = uiStateStore.loadState();
  
  // Also send list of existing workspaces (sessions that are still running)
  const existingWorkspaces = workspaceManager.listWorkspaces();
  
  send(ws, {
    type: 'connected',
    workspaces: existingWorkspaces,
    allowedRoots: config.allowedDirectories,
    uiState,
  });

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message: WsClientMessage = JSON.parse(data.toString());
      await handleMessage(ws, message);
    } catch (error) {
      console.error('[WS] Error handling message:', error);
      send(ws, {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Clean up on disconnect - detach from all workspaces but don't close them
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    
    // Detach from all workspaces this client was attached to
    const workspaceIds = clientWorkspaces.get(ws);
    if (workspaceIds) {
      for (const workspaceId of workspaceIds) {
        workspaceManager.detachFromWorkspace(workspaceId);
      }
    }
    clientWorkspaces.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

async function handleMessage(
  ws: WebSocket,
  message: WsClientMessage
) {
  switch (message.type) {
    // Workspace management
    case 'openWorkspace': {
      const result = await workspaceManager.openWorkspace(message.path);
      
      // Track that this client is attached to this workspace
      clientWorkspaces.get(ws)?.add(result.workspace.id);
      
      send(ws, {
        type: 'workspaceOpened',
        workspace: result.workspace,
        state: result.state,
        messages: result.messages,
      });
      
      // If there are buffered events (from when no client was connected), replay them
      if (result.bufferedEvents.length > 0) {
        console.log(`[WS] Replaying ${result.bufferedEvents.length} buffered events`);
        for (const event of result.bufferedEvents) {
          send(ws, event);
        }
      }
      
      // If this was an existing workspace that was already running, log it
      if (result.isExisting) {
        console.log(`[WS] Client attached to existing workspace: ${result.workspace.path}`);
      }
      break;
    }

    case 'closeWorkspace': {
      // Detach this client from the workspace
      clientWorkspaces.get(ws)?.delete(message.workspaceId);
      
      // Actually close and dispose the workspace
      workspaceManager.closeWorkspace(message.workspaceId);
      
      send(ws, {
        type: 'workspaceClosed',
        workspaceId: message.workspaceId,
      });
      break;
    }

    case 'listWorkspaces': {
      send(ws, {
        type: 'workspacesList',
        workspaces: workspaceManager.listWorkspaces(),
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

    // UI State persistence
    case 'getUIState': {
      send(ws, {
        type: 'uiState',
        state: uiStateStore.loadState(),
      });
      break;
    }

    case 'saveUIState': {
      const updated = uiStateStore.updateState(message.state);
      send(ws, {
        type: 'uiState',
        state: updated,
      });
      break;
    }

    case 'setTheme': {
      uiStateStore.setThemeId(message.themeId);
      break;
    }

    case 'setSidebarWidth': {
      uiStateStore.setSidebarWidth(message.width);
      break;
    }

    case 'setDraftInput': {
      uiStateStore.setDraftInput(message.workspacePath, message.value);
      break;
    }

    case 'setActiveSession': {
      uiStateStore.setActiveSession(message.workspacePath, message.sessionId);
      break;
    }

    case 'setActiveModel': {
      uiStateStore.setActiveModel(message.workspacePath, message.provider, message.modelId);
      break;
    }

    case 'setThinkingLevelPref': {
      uiStateStore.setThinkingLevel(message.workspacePath, message.level);
      break;
    }

    // Workspace-scoped operations
    case 'prompt': {
      const session = workspaceManager.getSession(message.workspaceId);
      await session.prompt(message.message, message.images);
      break;
    }

    case 'steer': {
      const session = workspaceManager.getSession(message.workspaceId);
      await session.steer(message.message);
      break;
    }

    case 'followUp': {
      const session = workspaceManager.getSession(message.workspaceId);
      await session.followUp(message.message);
      break;
    }

    case 'abort': {
      const session = workspaceManager.getSession(message.workspaceId);
      await session.abort();
      break;
    }

    case 'setModel': {
      const session = workspaceManager.getSession(message.workspaceId);
      await session.setModel(message.provider, message.modelId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'setThinkingLevel': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setThinkingLevel(message.level);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'newSession': {
      const session = workspaceManager.getSession(message.workspaceId);
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
      const session = workspaceManager.getSession(message.workspaceId);
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
      const session = workspaceManager.getSession(message.workspaceId);
      await session.compact(message.customInstructions);
      break;
    }

    case 'getState': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'getMessages': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        messages: session.getMessages(),
      });
      break;
    }

    case 'getSessions': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await session.listSessions(),
      });
      break;
    }

    case 'getModels': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'models',
        workspaceId: message.workspaceId,
        models: await session.getAvailableModels(),
      });
      break;
    }

    case 'getCommands': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'commands',
        workspaceId: message.workspaceId,
        commands: session.getCommands(),
      });
      break;
    }

    // Session operations
    case 'fork': {
      const session = workspaceManager.getSession(message.workspaceId);
      try {
        const result = await session.fork(message.entryId);
        send(ws, {
          type: 'forkResult',
          workspaceId: message.workspaceId,
          success: true,
          text: result.text,
        });
        // Refresh state and messages after fork
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
      } catch (error) {
        send(ws, {
          type: 'forkResult',
          workspaceId: message.workspaceId,
          success: false,
          error: error instanceof Error ? error.message : 'Fork failed',
        });
      }
      break;
    }

    case 'getForkMessages': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'forkMessages',
        workspaceId: message.workspaceId,
        messages: session.getForkMessages(),
      });
      break;
    }

    case 'setSessionName': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setSessionName(message.name);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      // Also refresh sessions list to show new name
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await session.listSessions(),
      });
      break;
    }

    case 'exportHtml': {
      const session = workspaceManager.getSession(message.workspaceId);
      try {
        const path = await session.exportHtml(message.outputPath);
        send(ws, {
          type: 'exportHtmlResult',
          workspaceId: message.workspaceId,
          success: true,
          path,
        });
      } catch (error) {
        send(ws, {
          type: 'exportHtmlResult',
          workspaceId: message.workspaceId,
          success: false,
          error: error instanceof Error ? error.message : 'Export failed',
        });
      }
      break;
    }

    // Model/Thinking cycling
    case 'cycleModel': {
      const session = workspaceManager.getSession(message.workspaceId);
      const result = await session.cycleModel(message.direction);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'cycleThinkingLevel': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.cycleThinkingLevel();
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    // Mode settings
    case 'setSteeringMode': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setSteeringMode(message.mode);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'setFollowUpMode': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setFollowUpMode(message.mode);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'setAutoCompaction': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setAutoCompaction(message.enabled);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'setAutoRetry': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.setAutoRetry(message.enabled);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        state: await session.getState(),
      });
      break;
    }

    case 'abortRetry': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.abortRetry();
      break;
    }

    // Bash execution
    case 'bash': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'bashStart',
        workspaceId: message.workspaceId,
        command: message.command,
      });
      try {
        const result = await session.executeBash(message.command, (chunk) => {
          send(ws, {
            type: 'bashOutput',
            workspaceId: message.workspaceId,
            chunk,
          });
        });
        send(ws, {
          type: 'bashEnd',
          workspaceId: message.workspaceId,
          result,
        });
      } catch (error) {
        send(ws, {
          type: 'bashEnd',
          workspaceId: message.workspaceId,
          result: {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Bash execution failed',
            exitCode: 1,
            signal: null,
            timedOut: false,
            truncated: false,
          },
        });
      }
      break;
    }

    case 'abortBash': {
      const session = workspaceManager.getSession(message.workspaceId);
      session.abortBash();
      break;
    }

    // Stats
    case 'getSessionStats': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'sessionStats',
        workspaceId: message.workspaceId,
        stats: session.getSessionStats(),
      });
      break;
    }

    case 'getLastAssistantText': {
      const session = workspaceManager.getSession(message.workspaceId);
      send(ws, {
        type: 'lastAssistantText',
        workspaceId: message.workspaceId,
        text: session.getLastAssistantText(),
      });
      break;
    }

    case 'deploy': {
      // Get project root (2 levels up from dist/index.js)
      const projectRoot = join(__dirname, '../..');
      
      send(ws, {
        type: 'deployStatus',
        status: 'building',
        message: 'Building project...',
      });

      console.log('[Deploy] Starting build...');
      
      // Run npm build
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: projectRoot,
        shell: true,
      });

      let buildOutput = '';
      buildProcess.stdout?.on('data', (data) => {
        buildOutput += data.toString();
      });
      buildProcess.stderr?.on('data', (data) => {
        buildOutput += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('[Deploy] Build failed:', buildOutput);
          send(ws, {
            type: 'deployStatus',
            status: 'error',
            message: `Build failed with code ${code}`,
          });
          return;
        }

        console.log('[Deploy] Build complete, restarting...');
        send(ws, {
          type: 'deployStatus',
          status: 'restarting',
          message: 'Build complete. Restarting server...',
        });

        // Give the message time to send, then exit
        // launchctl will restart us due to KeepAlive
        setTimeout(() => {
          console.log('[Deploy] Exiting for restart...');
          process.exit(0);
        }, 500);
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
