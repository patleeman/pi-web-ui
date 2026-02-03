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
      
      // Apply stored thinking level preference if one exists for this workspace
      // Only apply if this is a newly created workspace (not existing)
      if (!result.isExisting) {
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[message.path];
        if (storedThinkingLevel) {
          orchestrator.setThinkingLevel('default', storedThinkingLevel);
          // Update the state to reflect the applied thinking level
          result.state = await orchestrator.getState('default');
        }
      }
      
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
      
      // Apply stored thinking level preference for the workspace to the new slot
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (workspace) {
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
        if (storedThinkingLevel) {
          orchestrator.setThinkingLevel(result.slotId, storedThinkingLevel);
          // Update the state to reflect the applied thinking level
          result.state = await orchestrator.getState(result.slotId);
        }
      }
      
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
      console.log(`[Steer] Received steer request - workspace: ${message.workspaceId}, slot: ${message.sessionSlotId}, message: "${message.message?.substring(0, 50)}..."`);
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      console.log(`[Steer] Calling orchestrator.steer for slot: ${slotId}`);
      await orchestrator.steer(slotId, message.message, message.images);
      console.log(`[Steer] orchestrator.steer completed`);
      // Send updated queue state so UI can show the queued message
      const steerQueue = orchestrator.getQueuedMessages(slotId);
      console.log(`[Steer] Queue state - steering: ${steerQueue.steering.length}, followUp: ${steerQueue.followUp.length}`);
      console.log(`[Steer] Steering messages: ${JSON.stringify(steerQueue.steering)}`);
      send(ws, {
        type: 'queuedMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        steering: steerQueue.steering,
        followUp: steerQueue.followUp,
      });
      console.log(`[Steer] Sent queuedMessages event to client`);
      break;
    }

    case 'followUp': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      console.log(`[followUp] Received followUp message: "${message.message?.substring(0, 50)}"`);
      console.log(`[followUp] Before followUp - queue state:`, orchestrator.getQueuedMessages(slotId));
      await orchestrator.followUp(slotId, message.message);
      console.log(`[followUp] After followUp - queue state:`, orchestrator.getQueuedMessages(slotId));
      // Send updated queue state so UI can show the queued message
      const followQueue = orchestrator.getQueuedMessages(slotId);
      console.log(`[followUp] Sending queuedMessages event:`, followQueue);
      send(ws, {
        type: 'queuedMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        steering: followQueue.steering,
        followUp: followQueue.followUp,
      });
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
      const excludeFromContext = message.excludeFromContext ?? false;
      send(ws, {
        type: 'bashStart',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        command: message.command,
        excludeFromContext,
      });
      try {
        const result = await orchestrator.executeBash(slotId, message.command, (chunk) => {
          send(ws, {
            type: 'bashOutput',
            workspaceId: message.workspaceId,
            sessionSlotId: slotId,
            chunk,
          });
        }, excludeFromContext);
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

    // ========================================================================
    // Session Tree Navigation
    // ========================================================================
    case 'getSessionTree': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const { tree, currentLeafId } = orchestrator.getSessionTree(slotId);
      send(ws, {
        type: 'sessionTree',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        tree,
        currentLeafId,
      });
      break;
    }

    case 'navigateTree': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const result = await orchestrator.navigateTree(slotId, message.targetId, message.summarize);
      send(ws, {
        type: 'navigateTreeResult',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        success: result.success,
        editorText: result.editorText,
        error: result.error,
      });
      // Refresh state and messages after navigation
      if (result.success) {
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
      }
      break;
    }

    // ========================================================================
    // Copy Last Assistant Text
    // ========================================================================
    case 'copyLastAssistant': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const text = orchestrator.getLastAssistantText(slotId);
      send(ws, {
        type: 'copyResult',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        success: text !== null,
        text: text ?? undefined,
        error: text === null ? 'No assistant message to copy' : undefined,
      });
      break;
    }

    // ========================================================================
    // Queued Messages
    // ========================================================================
    case 'getQueuedMessages': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const { steering, followUp } = orchestrator.getQueuedMessages(slotId);
      send(ws, {
        type: 'queuedMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        steering,
        followUp,
      });
      break;
    }

    case 'clearQueue': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const { steering, followUp } = orchestrator.clearQueue(slotId);
      send(ws, {
        type: 'queuedMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        steering,
        followUp,
      });
      break;
    }

    // ========================================================================
    // Scoped Models
    // ========================================================================
    case 'getScopedModels': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const models = await orchestrator.getScopedModels(slotId);
      send(ws, {
        type: 'scopedModels',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        models,
      });
      break;
    }

    case 'setScopedModels': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.setScopedModels(slotId, message.models);
      // Return updated scoped models
      const models = await orchestrator.getScopedModels(slotId);
      send(ws, {
        type: 'scopedModels',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        models,
      });
      break;
    }

    // ========================================================================
    // File Listing (for @ reference)
    // ========================================================================
    case 'listFiles': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, {
          type: 'fileList',
          workspaceId: message.workspaceId,
          files: [],
        });
        break;
      }
      
      // Use find to list files in the workspace
      const { execSync } = await import('child_process');
      const limit = message.limit || 100;
      const query = message.query || '';
      
      try {
        // Find files, excluding common directories
        let cmd = `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.md" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.c" -o -name "*.cpp" -o -name "*.h" -o -name "*.css" -o -name "*.html" -o -name "*.yml" -o -name "*.yaml" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" | head -${limit * 2}`;
        
        const output = execSync(cmd, {
          cwd: workspace.path,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 5000,
        });
        
        let files = output.split('\\n')
          .filter(Boolean)
          .map(f => f.replace(/^\\.\//, ''))
          .map(path => ({
            path,
            name: path.split('/').pop() || path,
            isDirectory: false,
          }));
        
        // Filter by query if provided
        if (query) {
          const lowerQuery = query.toLowerCase();
          files = files.filter(f => 
            f.path.toLowerCase().includes(lowerQuery) ||
            f.name.toLowerCase().includes(lowerQuery)
          );
        }
        
        // Sort: exact name matches first, then path matches
        files.sort((a, b) => {
          if (query) {
            const lowerQuery = query.toLowerCase();
            const aNameMatch = a.name.toLowerCase().startsWith(lowerQuery);
            const bNameMatch = b.name.toLowerCase().startsWith(lowerQuery);
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
          }
          return a.path.localeCompare(b.path);
        });
        
        send(ws, {
          type: 'fileList',
          workspaceId: message.workspaceId,
          files: files.slice(0, limit),
        });
      } catch {
        send(ws, {
          type: 'fileList',
          workspaceId: message.workspaceId,
          files: [],
        });
      }
      break;
    }

    // ========================================================================
    // Share Session (GitHub Gist) - Not yet implemented
    // ========================================================================
    case 'shareSession': {
      // Share to gist requires GitHub auth - not implementing in this PR
      send(ws, {
        type: 'shareResult',
        workspaceId: message.workspaceId,
        sessionSlotId: getSlotId(message),
        success: false,
        error: 'Share to GitHub Gist is not yet implemented in the web UI',
      });
      break;
    }

    // ========================================================================
    // Auth (Login/Logout) - Basic support
    // ========================================================================
    case 'login': {
      // OAuth login requires opening browser - basic implementation
      send(ws, {
        type: 'loginStatus',
        provider: message.provider,
        status: 'error',
        message: 'OAuth login requires browser interaction. Please use the Pi CLI for OAuth login, or set API keys via environment variables.',
      });
      break;
    }

    case 'logout': {
      // Logout would clear stored OAuth tokens
      send(ws, {
        type: 'loginStatus',
        provider: message.provider,
        status: 'error',
        message: 'Logout is not yet implemented in the web UI. Please use the Pi CLI.',
      });
      break;
    }

    case 'getAuthProviders': {
      // Return list of providers - basic for now
      send(ws, {
        type: 'authProviders',
        providers: [
          { id: 'anthropic', name: 'Anthropic', supportsOAuth: true },
          { id: 'openai', name: 'OpenAI', supportsOAuth: true },
          { id: 'google', name: 'Google', supportsOAuth: true },
          { id: 'github-copilot', name: 'GitHub Copilot', supportsOAuth: true },
        ],
        authenticated: [], // Would need to check AuthStorage
      });
      break;
    }

    case 'extensionUIResponse': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        console.warn(`[WS] Workspace not found for extensionUIResponse: ${message.workspaceId}`);
        break;
      }
      const slotId = message.sessionSlotId || 'default';
      workspace.orchestrator.handleExtensionUIResponse(slotId, message.response);
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
