import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { loadConfig } from './config.js';
import { DirectoryBrowser } from './directory-browser.js';
import { getWorkspaceManager } from './workspace-manager.js';
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

/**
 * Broadcast an event to all clients attached to a specific workspace
 */
function broadcastToWorkspace(workspaceId: string, event: WsServerEvent): void {
  for (const [ws, workspaceIds] of clientWorkspaces.entries()) {
    if (workspaceIds.has(workspaceId) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}

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
app.get('/health', (_req: express.Request, res: express.Response) => {
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
    homeDirectory: homedir(),
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

/**
 * Helper to get the session slot ID from a message, defaulting to 'default'
 */
function getSlotId(message: { sessionSlotId?: string }): string {
  return message.sessionSlotId || 'default';
}

async function handleMessage(
  ws: WebSocket,
  message: WsClientMessage
) {
  switch (message.type) {
    // ========================================================================
    // Workspace management
    // ========================================================================
    case 'openWorkspace': {
      const result = await workspaceManager.openWorkspace(message.path);
      
      // Track that this client is attached to this workspace
      clientWorkspaces.get(ws)?.add(result.workspace.id);
      
      // Get startup info from the orchestrator
      const orchestrator = workspaceManager.getOrchestrator(result.workspace.id);
      const startupInfo = await orchestrator.getStartupInfo();
      
      send(ws, {
        type: 'workspaceOpened',
        workspace: result.workspace,
        state: result.state,
        messages: result.messages,
        startupInfo,
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
      // Broadcast close event to ALL clients attached to this workspace BEFORE closing
      // This ensures all clients (including other browser tabs) are notified
      const closeEvent: WsServerEvent = {
        type: 'workspaceClosed',
        workspaceId: message.workspaceId,
      };
      broadcastToWorkspace(message.workspaceId, closeEvent);
      
      // Detach ALL clients from this workspace (not just the requesting one)
      for (const [client, workspaceIds] of clientWorkspaces.entries()) {
        workspaceIds.delete(message.workspaceId);
      }
      
      // Actually close and dispose the workspace
      workspaceManager.closeWorkspace(message.workspaceId);
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

    // ========================================================================
    // Session slot management
    // ========================================================================
    case 'createSessionSlot': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const result = await orchestrator.createSlot(message.slotId);
      send(ws, {
        type: 'sessionSlotCreated',
        workspaceId: message.workspaceId,
        sessionSlotId: result.slotId,
        state: result.state,
        messages: result.messages,
      });
      break;
    }

    case 'closeSessionSlot': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      orchestrator.closeSlot(message.sessionSlotId);
      send(ws, {
        type: 'sessionSlotClosed',
        workspaceId: message.workspaceId,
        sessionSlotId: message.sessionSlotId,
      });
      break;
    }

    case 'listSessionSlots': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      send(ws, {
        type: 'sessionSlotsList',
        workspaceId: message.workspaceId,
        slots: orchestrator.listSlots(),
      });
      break;
    }

    // ========================================================================
    // UI State persistence
    // ========================================================================
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

    // ========================================================================
    // Session-slot-scoped operations (via orchestrator)
    // ========================================================================
    case 'prompt': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.prompt(slotId, message.message, message.images);
      break;
    }

    case 'steer': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.steer(slotId, message.message);
      break;
    }

    case 'followUp': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.followUp(slotId, message.message);
      break;
    }

    case 'abort': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.abort(slotId);
      break;
    }

    case 'setModel': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.setModel(slotId, message.provider, message.modelId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'setThinkingLevel': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setThinkingLevel(slotId, message.level);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'newSession': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.newSession(slotId);
      // Send updated state
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      // Send empty messages for new session
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        messages: orchestrator.getMessages(slotId),
      });
      // Refresh sessions list to include the new session
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await orchestrator.listSessions(),
      });
      break;
    }

    case 'switchSession': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.switchSession(slotId, message.sessionId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        messages: orchestrator.getMessages(slotId),
      });
      break;
    }

    case 'compact': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.compact(slotId, message.customInstructions);
      break;
    }

    case 'getState': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'getMessages': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'messages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        messages: orchestrator.getMessages(slotId),
      });
      break;
    }

    case 'getSessions': {
      // Sessions list is workspace-wide
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await orchestrator.listSessions(),
      });
      break;
    }

    case 'getModels': {
      // Models list is workspace-wide
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      send(ws, {
        type: 'models',
        workspaceId: message.workspaceId,
        models: await orchestrator.getAvailableModels(),
      });
      break;
    }

    case 'getCommands': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'commands',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        commands: orchestrator.getCommands(slotId),
      });
      break;
    }

    // ========================================================================
    // Session operations
    // ========================================================================
    case 'fork': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      try {
        const result = await orchestrator.fork(slotId, message.entryId);
        send(ws, {
          type: 'forkResult',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          success: true,
          text: result.text,
        });
        // Refresh state and messages after fork
        send(ws, {
          type: 'state',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          state: await orchestrator.getState(slotId),
        });
        send(ws, {
          type: 'messages',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          messages: orchestrator.getMessages(slotId),
        });
      } catch (error) {
        send(ws, {
          type: 'forkResult',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          success: false,
          error: error instanceof Error ? error.message : 'Fork failed',
        });
      }
      break;
    }

    case 'getForkMessages': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'forkMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        messages: orchestrator.getForkMessages(slotId),
      });
      break;
    }

    case 'setSessionName': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setSessionName(slotId, message.name);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      // Also refresh sessions list to show new name
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions: await orchestrator.listSessions(),
      });
      break;
    }

    case 'exportHtml': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      try {
        const path = await orchestrator.exportHtml(slotId, message.outputPath);
        send(ws, {
          type: 'exportHtmlResult',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          success: true,
          path,
        });
      } catch (error) {
        send(ws, {
          type: 'exportHtmlResult',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          success: false,
          error: error instanceof Error ? error.message : 'Export failed',
        });
      }
      break;
    }

    // ========================================================================
    // Model/Thinking cycling
    // ========================================================================
    case 'cycleModel': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.cycleModel(slotId, message.direction);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'cycleThinkingLevel': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.cycleThinkingLevel(slotId);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    // ========================================================================
    // Mode settings
    // ========================================================================
    case 'setSteeringMode': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setSteeringMode(slotId, message.mode);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'setFollowUpMode': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setFollowUpMode(slotId, message.mode);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'setAutoCompaction': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setAutoCompaction(slotId, message.enabled);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'setAutoRetry': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.setAutoRetry(slotId, message.enabled);
      send(ws, {
        type: 'state',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        state: await orchestrator.getState(slotId),
      });
      break;
    }

    case 'abortRetry': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.abortRetry(slotId);
      break;
    }

    // ========================================================================
    // Bash execution
    // ========================================================================
    case 'bash': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'bashStart',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        command: message.command,
      });
      try {
        const result = await orchestrator.executeBash(slotId, message.command, (chunk) => {
          send(ws, {
            type: 'bashOutput',
            workspaceId: message.workspaceId,
            sessionSlotId: slotId,
            chunk,
          });
        });
        send(ws, {
          type: 'bashEnd',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          result,
        });
      } catch (error) {
        send(ws, {
          type: 'bashEnd',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
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
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      orchestrator.abortBash(slotId);
      break;
    }

    // ========================================================================
    // Stats
    // ========================================================================
    case 'getSessionStats': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'sessionStats',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        stats: orchestrator.getSessionStats(slotId),
      });
      break;
    }

    case 'getLastAssistantText': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      send(ws, {
        type: 'lastAssistantText',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        text: orchestrator.getLastAssistantText(slotId),
      });
      break;
    }

    // ========================================================================
    // Server management
    // ========================================================================
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

    case 'updateAllowedRoots': {
      const { roots } = message;
      console.log('[Config] Updating allowed roots:', roots);
      
      // Update config file
      const configPath = join(homedir(), '.pi-web-ui.json');
      let fileConfig: Record<string, unknown> = {};
      try {
        if (existsSync(configPath)) {
          fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        }
      } catch {
        // Ignore parse errors
      }
      
      fileConfig.allowedDirectories = roots;
      writeFileSync(configPath, JSON.stringify(fileConfig, null, 2));
      console.log('[Config] Saved config to', configPath);
      
      // Note: Requires server restart to take effect
      send(ws, {
        type: 'allowedRootsUpdated',
        roots,
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
  app.get('*', (_req: express.Request, res: express.Response) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
}

server.listen(PORT, config.host, () => {
  console.log(`[Server] Pi Web UI server running on http://${config.host}:${PORT}`);
  console.log(`[Server] Allowed directories: ${config.allowedDirectories.join(', ')}`);
  console.log(`[Server] WebSocket endpoint: ws://${config.host}:${PORT}/ws`);
});
