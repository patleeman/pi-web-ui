import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, sep } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import { loadConfig } from './config.js';
import { DirectoryBrowser } from './directory-browser.js';
import { getWorkspaceManager } from './workspace-manager.js';
import { getUIStateStore } from './ui-state.js';
import { getGitChangedFiles, getGitChangedDirectories, getFileDiff } from './git-info.js';
import { discoverPlans, readPlan, writePlan, parsePlan, updateTaskInContent, getActivePlanState, buildActivePlanPrompt, updateFrontmatterStatus } from './plan-service.js';
import {
  discoverJobs, readJob, writeJob, createJob, promoteJob, demoteJob,
  updateTaskInContent as updateJobTaskInContent, setJobSessionId,
  buildPlanningPrompt, buildExecutionPrompt, getActiveJobStates, parseJob,
} from './job-service.js';
import type { SessionOrchestrator } from './session-orchestrator.js';
import type { WsClientMessage, WsServerEvent, ActivePlanState, ActiveJobState } from '@pi-web-ui/shared';

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

// Track active plan file content hashes for change detection
const activePlanHashes = new Map<string, string>();
const ACTIVE_PLAN_POLL_INTERVAL_MS = 3000;

// Poll active plan files for changes (agent modifying checkboxes)
setInterval(() => {
  for (const [ws, workspaceIds] of clientWorkspaces.entries()) {
    for (const workspaceId of workspaceIds) {
      const workspace = workspaceManager.getWorkspace(workspaceId);
      if (!workspace) continue;
      const planPath = uiStateStore.getActivePlan(workspace.path);
      if (!planPath) continue;
      
      try {
        if (!existsSync(planPath)) {
          // Plan file was deleted while active — auto-deactivate
          uiStateStore.clearActivePlan(workspace.path);
          activePlanHashes.delete(`${workspaceId}:${planPath}`);
          broadcastToWorkspace(workspaceId, {
            type: 'activePlan',
            workspaceId,
            activePlan: null,
          });
          continue;
        }
        
        const content = readFileSync(planPath, 'utf-8');
        const hash = `${content.length}:${content.slice(0, 100)}:${content.slice(-100)}`;
        const prevHash = activePlanHashes.get(`${workspaceId}:${planPath}`);
        
        if (prevHash && prevHash !== hash) {
          // File changed — broadcast updated state
          const plan = parsePlan(planPath, content);
          const activePlanState: ActivePlanState = {
            planPath: plan.path,
            title: plan.title,
            tasks: plan.tasks,
            taskCount: plan.taskCount,
            doneCount: plan.doneCount,
          };
          broadcastToWorkspace(workspaceId, {
            type: 'activePlan',
            workspaceId,
            activePlan: activePlanState,
          });
          
          // Also broadcast plan content so sidebar task list stays in sync
          broadcastToWorkspace(workspaceId, {
            type: 'planContent',
            workspaceId,
            planPath,
            content,
            plan,
          });
          
          // Refresh the plans list (progress bars on list view)
          const updatedPlans = discoverPlans(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'plansList', workspaceId, plans: updatedPlans });
          
          // Auto-complete: if all tasks are done, mark plan as complete
          if (activePlanState && activePlanState.taskCount > 0 && activePlanState.doneCount === activePlanState.taskCount) {
            try {
              const completedContent = updateFrontmatterStatus(content, 'complete', {
                completed: new Date().toISOString(),
              });
              writePlan(planPath, completedContent);
              uiStateStore.clearActivePlan(workspace.path);
              activePlanHashes.delete(`${workspaceId}:${planPath}`);
              broadcastToWorkspace(workspaceId, {
                type: 'activePlan',
                workspaceId,
                activePlan: null,
              });
              const plans = discoverPlans(workspace.path);
              broadcastToWorkspace(workspaceId, { type: 'plansList', workspaceId, plans });
            } catch {
              // Continue — plan file may be locked
            }
          }
        }
        activePlanHashes.set(`${workspaceId}:${planPath}`, hash);
      } catch (err) {
        // File read error — deactivate plan gracefully
        console.warn(`[Plans] Error reading active plan ${planPath}:`, err);
        uiStateStore.clearActivePlan(workspace.path);
        activePlanHashes.delete(`${workspaceId}:${planPath}`);
        broadcastToWorkspace(workspaceId, {
          type: 'activePlan',
          workspaceId,
          activePlan: null,
        });
      }
    }
  }
}, ACTIVE_PLAN_POLL_INTERVAL_MS); // Poll every 3 seconds

// Track active job file content hashes for change detection
const activeJobHashes = new Map<string, string>();
const ACTIVE_JOB_POLL_INTERVAL_MS = 3000;

// Poll active job files for changes (agent modifying checkboxes/content)
setInterval(() => {
  for (const [, workspaceIds] of clientWorkspaces.entries()) {
    for (const workspaceId of workspaceIds) {
      const workspace = workspaceManager.getWorkspace(workspaceId);
      if (!workspace) continue;

      let activeJobs: ActiveJobState[];
      try {
        activeJobs = getActiveJobStates(workspace.path);
      } catch {
        continue;
      }

      if (activeJobs.length === 0) continue;

      let anyChanged = false;
      for (const aj of activeJobs) {
        try {
          if (!existsSync(aj.jobPath)) continue;

          const content = readFileSync(aj.jobPath, 'utf-8');
          const hash = `${content.length}:${content.slice(0, 100)}:${content.slice(-100)}`;
          const key = `${workspaceId}:${aj.jobPath}`;
          const prevHash = activeJobHashes.get(key);

          if (prevHash && prevHash !== hash) {
            anyChanged = true;
            // Broadcast updated job content
            const job = parseJob(aj.jobPath, content);
            broadcastToWorkspace(workspaceId, {
              type: 'jobContent',
              workspaceId,
              jobPath: aj.jobPath,
              content,
              job,
            });
          }
          activeJobHashes.set(key, hash);
        } catch {
          // File read error — skip
        }
      }

      if (anyChanged) {
        // Refresh full list and active states
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(workspaceId, { type: 'jobsList', workspaceId, jobs });
        broadcastToWorkspace(workspaceId, {
          type: 'activeJob',
          workspaceId,
          activeJobs: getActiveJobStates(workspace.path),
        });
      }
    }
  }
}, ACTIVE_JOB_POLL_INTERVAL_MS);

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
      
      // Send active plan state if one exists for this workspace
      const activePlanPath = uiStateStore.getActivePlan(message.path);
      if (activePlanPath) {
        const activePlanState = getActivePlanState(activePlanPath);
        send(ws, {
          type: 'activePlan',
          workspaceId: result.workspace.id,
          activePlan: activePlanState,
        });
      }

      // Send active job states (jobs in planning/executing phase)
      try {
        const activeJobs = getActiveJobStates(message.path);
        if (activeJobs.length > 0) {
          send(ws, {
            type: 'activeJob',
            workspaceId: result.workspace.id,
            activeJobs,
          });
        }
      } catch {
        // Ignore — jobs directory may not exist yet
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
      // Refresh sessions list to include the new session (async to avoid blocking)
      scheduleSessionsRefresh(ws, message.workspaceId, orchestrator);
      break;
    }

    case 'switchSession': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      let sessionPath = message.sessionId;
      const looksLikePath = sessionPath.includes('/') || sessionPath.includes('\\') || sessionPath.endsWith('.jsonl');
      if (!looksLikePath) {
        const sessions = await orchestrator.listSessions();
        const match = sessions.find((session) => session.id === sessionPath);
        if (match?.path) {
          sessionPath = match.path;
        } else {
          console.warn(`[WS] switchSession: session path not found for id ${sessionPath}`);
          break;
        }
      }
      await orchestrator.switchSession(slotId, sessionPath);
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
      // If there's an active plan, include it in compaction instructions
      // so the plan reference survives compaction
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      let compactInstructions = message.customInstructions;
      if (workspace) {
        const planPath = uiStateStore.getActivePlan(workspace.path);
        if (planPath) {
          const planNote = `IMPORTANT: There is an active plan at ${planPath}. Preserve this plan reference in the summary so the agent continues working on it after compaction.`;
          compactInstructions = compactInstructions
            ? `${compactInstructions}\n\n${planNote}`
            : planNote;
        }
      }
      await orchestrator.compact(slotId, compactInstructions);
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
      // Also refresh sessions list to show new name (async to avoid blocking)
      scheduleSessionsRefresh(ws, message.workspaceId, orchestrator);
      break;
    }

    case 'renameSession': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const sessionInfo = await resolveSessionInfo(orchestrator, message.sessionId, message.sessionPath);
      if (!sessionInfo) {
        send(ws, {
          type: 'error',
          workspaceId: message.workspaceId,
          message: 'Session not found for rename.',
        });
        break;
      }
      const trimmedName = message.name.trim();
      if (!trimmedName) {
        send(ws, {
          type: 'error',
          workspaceId: message.workspaceId,
          message: 'Session name cannot be empty.',
        });
        break;
      }
      const slotStates = await getSlotStates(orchestrator);
      const matchingSlots = slotStates.filter(({ state }) => (
        state.sessionId === sessionInfo.id || state.sessionFile === sessionInfo.path
      ));
      if (matchingSlots.length > 0) {
        for (const { slotId } of matchingSlots) {
          orchestrator.setSessionName(slotId, trimmedName);
          send(ws, {
            type: 'state',
            workspaceId: message.workspaceId,
            sessionSlotId: slotId,
            state: await orchestrator.getState(slotId),
          });
        }
      } else {
        const sessionManager = SessionManager.open(sessionInfo.path);
        sessionManager.appendSessionInfo(trimmedName);
      }
      scheduleSessionsRefresh(ws, message.workspaceId, orchestrator);
      break;
    }

    case 'deleteSession': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const sessionInfo = await resolveSessionInfo(orchestrator, message.sessionId, message.sessionPath);
      if (!sessionInfo) {
        send(ws, {
          type: 'error',
          workspaceId: message.workspaceId,
          message: 'Session not found for deletion.',
        });
        break;
      }
      const slotStates = await getSlotStates(orchestrator);
      const matchingSlots = slotStates.filter(({ state }) => (
        state.sessionId === sessionInfo.id || state.sessionFile === sessionInfo.path
      ));
      if (matchingSlots.length > 0) {
        for (const { slotId, state } of matchingSlots) {
          if (state.isStreaming) {
            await orchestrator.abort(slotId);
          }
          await orchestrator.newSession(slotId);
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
      }
      try {
        if (existsSync(sessionInfo.path)) {
          await unlink(sessionInfo.path);
        }
      } catch (error) {
        send(ws, {
          type: 'error',
          workspaceId: message.workspaceId,
          message: error instanceof Error ? error.message : 'Failed to delete session file.',
        });
      } finally {
        scheduleSessionsRefresh(ws, message.workspaceId, orchestrator);
      }
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
    // Workspace directory listing (for file tree)
    // ========================================================================
    case 'listWorkspaceEntries': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, {
          type: 'workspaceEntries',
          workspaceId: message.workspaceId,
          path: message.path || '',
          entries: [],
          requestId: message.requestId,
        });
        break;
      }

      const rootPath = resolve(workspace.path);
      const relativePath = (message.path || '').replace(/^\/+/, '');
      const targetPath = resolve(rootPath, relativePath);

      if (targetPath !== rootPath && !targetPath.startsWith(rootPath + sep)) {
        send(ws, {
          type: 'workspaceEntries',
          workspaceId: message.workspaceId,
          path: relativePath,
          entries: [],
          requestId: message.requestId,
        });
        break;
      }

      const skipEntries = new Set(['.git', '.pi', 'node_modules', 'dist', 'build', 'coverage']);

      // Get git status for the workspace
      const gitChangedFiles = getGitChangedFiles(rootPath);
      const gitChangedDirs = getGitChangedDirectories(rootPath);

      try {
        const entries = readdirSync(targetPath, { withFileTypes: true })
          .filter((entry) => !skipEntries.has(entry.name))
          .map((entry) => {
            const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const isDir = entry.isDirectory();
            return {
              name: entry.name,
              path: entryPath,
              isDirectory: isDir,
              gitStatus: isDir ? undefined : gitChangedFiles.get(entryPath),
              hasChanges: isDir ? gitChangedDirs.has(entryPath) : undefined,
            };
          })
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
              return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

        send(ws, {
          type: 'workspaceEntries',
          workspaceId: message.workspaceId,
          path: relativePath,
          entries,
          requestId: message.requestId,
        });
      } catch {
        send(ws, {
          type: 'workspaceEntries',
          workspaceId: message.workspaceId,
          path: relativePath,
          entries: [],
          requestId: message.requestId,
        });
      }
      break;
    }

    // ========================================================================
    // Workspace file read (for file preview)
    // ========================================================================
    case 'readWorkspaceFile': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, {
          type: 'workspaceFile',
          workspaceId: message.workspaceId,
          path: message.path,
          content: '',
          truncated: false,
          requestId: message.requestId,
        });
        break;
      }

      const rootPath = resolve(workspace.path);
      const rawPath = message.path || '';
      // Expand ~/  to the user's home directory
      const expandedPath = rawPath.startsWith('~/') ? join(homedir(), rawPath.slice(2)) : rawPath;
      const isAbsolute = expandedPath.startsWith('/');
      let targetPath: string;
      let displayPath: string;

      if (isAbsolute) {
        // Absolute path — allow if within workspace or allowed directories
        targetPath = resolve(expandedPath);
        displayPath = rawPath;
        const inWorkspace = targetPath.startsWith(rootPath + sep) || targetPath === rootPath;
        const inAllowed = config.allowedDirectories.some(
          (dir: string) => targetPath.startsWith(resolve(dir) + sep) || targetPath === resolve(dir)
        );
        if (!inWorkspace && !inAllowed) {
          send(ws, {
            type: 'workspaceFile',
            workspaceId: message.workspaceId,
            path: displayPath,
            content: '',
            truncated: false,
            requestId: message.requestId,
          });
          break;
        }
      } else {
        // Relative path — resolve within workspace
        const relativePath = rawPath.replace(/^\/+/, '');
        targetPath = resolve(rootPath, relativePath);
        displayPath = relativePath;
        if (!relativePath || (targetPath !== rootPath && !targetPath.startsWith(rootPath + sep))) {
          send(ws, {
            type: 'workspaceFile',
            workspaceId: message.workspaceId,
            path: displayPath,
            content: '',
            truncated: false,
            requestId: message.requestId,
          });
          break;
        }
      }

      try {
        if (!existsSync(targetPath)) {
          throw new Error('File not found');
        }
        const stat = statSync(targetPath);
        if (stat.isDirectory()) {
          throw new Error('Path is a directory');
        }

        const maxBytes = 200 * 1024;
        const raw = readFileSync(targetPath, 'utf-8');
        const truncated = raw.length > maxBytes;
        const content = truncated ? raw.slice(0, maxBytes) : raw;

        send(ws, {
          type: 'workspaceFile',
          workspaceId: message.workspaceId,
          path: displayPath,
          content,
          truncated,
          requestId: message.requestId,
        });
      } catch {
        send(ws, {
          type: 'workspaceFile',
          workspaceId: message.workspaceId,
          path: displayPath,
          content: '',
          truncated: false,
          requestId: message.requestId,
        });
      }
      break;
    }

    // ========================================================================
    // Git Status (for Git tab in file pane)
    // ========================================================================
    case 'getGitStatus': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, {
          type: 'gitStatus',
          workspaceId: message.workspaceId,
          files: [],
          requestId: message.requestId,
        });
        break;
      }

      const gitChanges = getGitChangedFiles(workspace.path);
      const files = Array.from(gitChanges.entries()).map(([path, status]) => ({
        path,
        status,
      }));

      send(ws, {
        type: 'gitStatus',
        workspaceId: message.workspaceId,
        files,
        requestId: message.requestId,
      });
      break;
    }

    case 'getFileDiff': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, {
          type: 'fileDiff',
          workspaceId: message.workspaceId,
          path: message.path,
          diff: '',
          requestId: message.requestId,
        });
        break;
      }

      const diff = getFileDiff(workspace.path, message.path);

      send(ws, {
        type: 'fileDiff',
        workspaceId: message.workspaceId,
        path: message.path,
        diff,
        requestId: message.requestId,
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
          requestId: message.requestId,
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
          requestId: message.requestId,
        });
      } catch {
        send(ws, {
          type: 'fileList',
          workspaceId: message.workspaceId,
          files: [],
          requestId: message.requestId,
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

    case 'customUIInput': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        console.warn(`[WS] Workspace not found for customUIInput: ${message.workspaceId}`);
        break;
      }
      const slotId = message.sessionSlotId || 'default';
      workspace.orchestrator.handleCustomUIInput(slotId, message.input);
      break;
    }

    case 'questionnaireResponse': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        console.warn(`[WS] Workspace not found for questionnaireResponse: ${message.workspaceId}`);
        break;
      }
      const slotId = message.sessionSlotId || 'default';
      workspace.orchestrator.handleQuestionnaireResponse(slotId, {
        toolCallId: message.toolCallId,
        answers: message.answers,
        cancelled: message.cancelled,
      });
      break;
    }

    // ========================================================================
    // Plans
    // ========================================================================
    case 'getPlans': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans: [] });
        break;
      }
      const plans = discoverPlans(workspace.path);
      send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans });
      break;
    }

    case 'getPlanContent': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content, plan } = readPlan(message.planPath);
        send(ws, {
          type: 'planContent',
          workspaceId: message.workspaceId,
          planPath: message.planPath,
          content,
          plan,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to read plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'savePlan': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const plan = writePlan(message.planPath, message.content);
        send(ws, {
          type: 'planSaved',
          workspaceId: message.workspaceId,
          planPath: message.planPath,
          plan,
        });
        // If this is the active plan, also send updated active plan state
        const activePlanPath = uiStateStore.getActivePlan(workspace.path);
        if (activePlanPath === message.planPath) {
          const activePlanState = getActivePlanState(message.planPath);
          send(ws, {
            type: 'activePlan',
            workspaceId: message.workspaceId,
            activePlan: activePlanState,
          });
        }
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to save plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'activatePlan': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        // Persist active plan
        uiStateStore.setActivePlan(workspace.path, message.planPath);
        
        // Update frontmatter to active
        const { content } = readPlan(message.planPath);
        const updatedContent = updateFrontmatterStatus(content, 'active');
        const plan = writePlan(message.planPath, updatedContent);
        
        // Send active plan state
        const activePlanState = getActivePlanState(message.planPath);
        send(ws, {
          type: 'activePlan',
          workspaceId: message.workspaceId,
          activePlan: activePlanState,
        });
        
        // Create a new session slot for the plan execution
        const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
        const planSlotId = `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const slotResult = await orchestrator.createSlot(planSlotId);
        
        // Apply stored thinking level preference
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
        if (storedThinkingLevel) {
          orchestrator.setThinkingLevel(planSlotId, storedThinkingLevel);
          slotResult.state = await orchestrator.getState(planSlotId);
        }
        
        // Send slot created event so client can wire up a new tab
        send(ws, {
          type: 'sessionSlotCreated',
          workspaceId: message.workspaceId,
          sessionSlotId: planSlotId,
          state: slotResult.state,
          messages: slotResult.messages,
        });
        
        // Send the initial prompt with the plan context
        const planPrompt = buildActivePlanPrompt(message.planPath);
        const initialMessage = `${planPrompt}\n\nPlease read the plan file and begin working through the tasks.`;
        await orchestrator.prompt(planSlotId, initialMessage);
        
        // Send updated plans list
        const plans = discoverPlans(workspace.path);
        send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to activate plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'deactivatePlan': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      
      const activePlanPath = uiStateStore.getActivePlan(workspace.path);
      if (activePlanPath) {
        try {
          // Update frontmatter to complete
          const { content } = readPlan(activePlanPath);
          const updatedContent = updateFrontmatterStatus(content, 'complete', {
            completed: new Date().toISOString(),
          });
          writePlan(activePlanPath, updatedContent);
        } catch (err) {
          console.warn(`[Plans] Failed to update plan frontmatter: ${err}`);
        }
      }
      
      // Clear active plan
      uiStateStore.setActivePlan(workspace.path, null);
      
      send(ws, {
        type: 'activePlan',
        workspaceId: message.workspaceId,
        activePlan: null,
      });
      
      // Refresh plans list
      const plans = discoverPlans(workspace.path);
      send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans });
      break;
    }

    case 'updatePlanTask': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content } = readPlan(message.planPath);
        const updatedContent = updateTaskInContent(content, message.line, message.done);
        const plan = writePlan(message.planPath, updatedContent);
        
        send(ws, {
          type: 'planTaskUpdated',
          workspaceId: message.workspaceId,
          planPath: message.planPath,
          plan,
        });
        
        // If this is the active plan, also update active plan state
        const activePlanPath = uiStateStore.getActivePlan(workspace.path);
        if (activePlanPath === message.planPath) {
          const activePlanState = getActivePlanState(message.planPath);
          send(ws, {
            type: 'activePlan',
            workspaceId: message.workspaceId,
            activePlan: activePlanState,
          });
          
          // Auto-complete: if all tasks are done, mark plan as complete
          if (activePlanState && activePlanState.taskCount > 0 && activePlanState.doneCount === activePlanState.taskCount) {
            try {
              const { content: currentContent } = readPlan(message.planPath);
              const completedContent = updateFrontmatterStatus(currentContent, 'complete', {
                completed: new Date().toISOString(),
              });
              writePlan(message.planPath, completedContent);
              
              // Deactivate the plan
              uiStateStore.clearActivePlan(workspace.path);
              send(ws, {
                type: 'activePlan',
                workspaceId: message.workspaceId,
                activePlan: null,
              });
              
              // Refresh plans list to show completed status
              const plansAfterComplete = discoverPlans(workspace.path);
              send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans: plansAfterComplete });
            } catch (completeErr) {
              console.warn(`[Plans] Failed to auto-complete plan: ${completeErr}`);
            }
          }
        }
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to update task: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    // ========================================================================
    // Jobs
    // ========================================================================
    case 'getJobs': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs: [] });
        break;
      }
      const jobs = discoverJobs(workspace.path);
      send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
      break;
    }

    case 'getJobContent': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content, job } = readJob(message.jobPath);
        send(ws, {
          type: 'jobContent',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          content,
          job,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to read job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'createJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { path: jobPath, job } = createJob(workspace.path, message.title, message.description);
        send(ws, {
          type: 'jobSaved',
          workspaceId: message.workspaceId,
          jobPath,
          job,
        });
        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to create job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'saveJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const job = writeJob(message.jobPath, message.content);
        send(ws, {
          type: 'jobSaved',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to save job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'promoteJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { job } = promoteJob(message.jobPath, message.toPhase);
        let sessionSlotId: string | undefined;

        // If promoted to planning or executing, spin up a conversation
        if (job.phase === 'planning' || job.phase === 'executing') {
          const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);

          if (job.phase === 'executing' && job.frontmatter.executionSessionId) {
            // Reuse existing execution session (e.g., demoted from review, now re-promoted)
            sessionSlotId = job.frontmatter.executionSessionId;
          } else {
            // Create a new session slot
            const slotId = `job-${job.phase}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            const slotResult = await orchestrator.createSlot(slotId);
            sessionSlotId = slotId;

            // Apply stored thinking level preference
            const uiState = uiStateStore.loadState();
            const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
            if (storedThinkingLevel) {
              orchestrator.setThinkingLevel(slotId, storedThinkingLevel);
              slotResult.state = await orchestrator.getState(slotId);
            }

            // Send slot created event so client can wire up a new tab
            send(ws, {
              type: 'sessionSlotCreated',
              workspaceId: message.workspaceId,
              sessionSlotId: slotId,
              state: slotResult.state,
              messages: slotResult.messages,
            });

            // Store the session ID in frontmatter
            const sessionField = job.phase === 'planning' ? 'planningSessionId' : 'executionSessionId';
            setJobSessionId(message.jobPath, sessionField, slotId);

            // Send the initial prompt
            const prompt = job.phase === 'planning'
              ? buildPlanningPrompt(message.jobPath)
              : buildExecutionPrompt(message.jobPath);
            const initialMessage = job.phase === 'planning'
              ? `${prompt}\n\nPlease read the job file and help me create a plan.`
              : `${prompt}\n\nPlease read the job file and begin working through the tasks.`;
            await orchestrator.prompt(slotId, initialMessage);
          }
        }

        send(ws, {
          type: 'jobPromoted',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
          sessionSlotId,
        });

        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs });

        // Send active job states
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to promote job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'demoteJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { job } = demoteJob(message.jobPath, message.toPhase);

        send(ws, {
          type: 'jobPromoted', // reuse same event — it's a phase change
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
          // If demoting to executing, provide the existing session slot
          sessionSlotId: job.phase === 'executing' ? job.frontmatter.executionSessionId : undefined,
        });

        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs });

        // Send active job states
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to demote job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'updateJobTask': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content } = readJob(message.jobPath);
        const updatedContent = updateJobTaskInContent(content, message.line, message.done);
        const job = writeJob(message.jobPath, updatedContent);

        send(ws, {
          type: 'jobTaskUpdated',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });

        // Send updated active job states (progress may have changed)
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to update job task: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    default:
      console.warn('[WS] Unknown message type:', (message as { type: string }).type);
  }
}

function scheduleSessionsRefresh(
  ws: WebSocket,
  workspaceId: string,
  orchestrator: SessionOrchestrator
): void {
  setImmediate(async () => {
    try {
      const sessions = await orchestrator.listSessions();
      send(ws, { type: 'sessions', workspaceId, sessions });
    } catch (error) {
      console.error(`[WS] Failed to refresh sessions for ${workspaceId}:`, error);
    }
  });
}

async function resolveSessionInfo(
  orchestrator: SessionOrchestrator,
  sessionId?: string,
  sessionPath?: string
): Promise<{ id: string; path: string } | null> {
  const sessions = await orchestrator.listSessions();
  if (sessionPath) {
    const match = sessions.find((session) => session.path === sessionPath);
    if (match) return { id: match.id, path: match.path };
  }
  if (sessionId) {
    const matchById = sessions.find((session) => session.id === sessionId);
    if (matchById) return { id: matchById.id, path: matchById.path };
  }
  const slotStates = await getSlotStates(orchestrator);
  const slotMatch = slotStates.find(({ state }) => (
    (sessionPath && state.sessionFile === sessionPath) || (sessionId && state.sessionId === sessionId)
  ));
  if (slotMatch?.state.sessionFile) {
    return { id: slotMatch.state.sessionId, path: slotMatch.state.sessionFile };
  }
  return null;
}

async function getSlotStates(orchestrator: SessionOrchestrator) {
  const slots = orchestrator.listSlots();
  return Promise.all(slots.map(async (slot) => ({
    slotId: slot.slotId,
    state: await orchestrator.getState(slot.slotId),
  })));
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
