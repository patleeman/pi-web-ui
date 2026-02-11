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
import { getGitChangedFiles, getGitChangedDirectories, getFileDiff, getGitBranch, getGitWorktree } from './git-info.js';
import { discoverPlans, readPlan, writePlan, parsePlan, updateTaskInContent, getActivePlanState, buildActivePlanPrompt, updateFrontmatterStatus } from './plan-service.js';
import {
  discoverJobs, readJob, writeJob, createJob, promoteJob, demoteJob,
  updateTaskInContent as updateJobTaskInContent, setJobSessionId,
  updateJobFrontmatter,
  buildPlanningPrompt, buildExecutionPrompt, buildReviewPrompt, buildFinalizePrompt, buildConversationPrompt,
  getActiveJobStates, parseJob, extractReviewSection, addConversationToJob,
  archiveJob, unarchiveJob, discoverArchivedJobs,
  getJobLocations,
  addAttachmentToJob, removeAttachmentFromJob, readAttachmentFile,
  loadJobConfig, saveJobConfig, addJobLocation, removeJobLocation, setDefaultJobLocation,
  resolveLocationPath,
} from './job-service.js';
import type { SessionOrchestrator } from './session-orchestrator.js';
import type { WsClientMessage, WsServerEvent, ActivePlanState, ActiveJobState } from '@pi-deck/shared';
import { SyncIntegration } from './sync/index.js';

// Load configuration
const config = loadConfig();

// Initialize sync system
const syncDbPath = join(homedir(), '.pi', 'pi-deck-sync.db');
const syncIntegration = new SyncIntegration(syncDbPath);
console.log(`[Sync] Initialized sync database at ${syncDbPath}`);
const PORT = config.port;

// ============================================================================
// Version check — fetch latest from npm on startup
// ============================================================================
const CURRENT_VERSION = process.env.PI_DECK_VERSION || '0.0.0';

let updateAvailable: { current: string; latest: string } | null = null;

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch('https://registry.npmjs.org/pi-deck/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const data = await res.json() as { version?: string };
    const latest = data.version;
    if (!latest) return;

    // Simple semver comparison: split, compare each part
    const cur = CURRENT_VERSION.split('.').map(Number);
    const lat = latest.split('.').map(Number);
    const isNewer = lat[0] > cur[0]
      || (lat[0] === cur[0] && lat[1] > cur[1])
      || (lat[0] === cur[0] && lat[1] === cur[1] && lat[2] > cur[2]);

    if (isNewer) {
      updateAvailable = { current: CURRENT_VERSION, latest };
      console.log(`[Update] New version available: ${CURRENT_VERSION} → ${latest}`);
    }
  } catch {
    // Network error or timeout — silently ignore
  }
}

// Fire and forget — don't block startup
checkForUpdate();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// When run via the CLI bundle, PI_DECK_CLIENT_DIST is set; otherwise fall back to monorepo layout.
const clientDistPath = process.env.PI_DECK_CLIENT_DIST || join(__dirname, '../../client/dist');

if (existsSync(clientDistPath)) {
  console.log(`[Server] Serving static files from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Create shared services (singletons)
const directoryBrowser = new DirectoryBrowser();
const uiStateStore = getUIStateStore();
const workspaceManager = getWorkspaceManager();

// Wire up sync integration
workspaceManager.setSyncIntegration(syncIntegration);

// Track which workspaces each WebSocket is attached to
const clientWorkspaces = new Map<WebSocket, Set<string>>();

// Route questionnaire responses robustly by toolCallId (survives client/workspace races)
const pendingQuestionnaireRoutes = new Map<string, { workspaceId: string; slotId: string }>();

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
  // Track questionnaire routing by toolCallId
  if (event.type === 'questionnaireRequest') {
    pendingQuestionnaireRoutes.set(event.toolCallId, {
      workspaceId: event.workspaceId,
      slotId: event.sessionSlotId || 'default',
    });
  }

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

// ============================================================================
// Auto-promote jobs when agent sessions end
// ============================================================================

workspaceManager.on('event', (event: WsServerEvent) => {
  if (event.type !== 'agentEnd' || !('workspaceId' in event)) return;

  const { workspaceId, sessionSlotId } = event as { workspaceId: string; sessionSlotId?: string };
  if (!sessionSlotId) return;

  // Run async logic outside the synchronous handler
  setImmediate(async () => {
    try {
      const workspace = workspaceManager.getWorkspace(workspaceId);
      if (!workspace) return;

      // Find jobs whose session slot matches the one that just ended
      const jobs = discoverJobs(workspace.path);
      const matchingJob = jobs.find(j =>
        (j.phase === 'executing' && j.frontmatter.executionSessionId === sessionSlotId) ||
        (j.phase === 'review' && j.frontmatter.reviewSessionId === sessionSlotId)
      );
      if (!matchingJob) return;

      if (matchingJob.phase === 'executing') {
        // Check if the job has a ## Review section
        const { content } = readJob(matchingJob.path);
        const reviewSection = extractReviewSection(content);

        if (reviewSection) {
          console.log(`[Jobs] Auto-promoting job "${matchingJob.title}" from executing → review`);
          const { job } = promoteJob(matchingJob.path);

          // Spin up review agent session
          const orchestrator = workspaceManager.getOrchestrator(workspaceId);
          const reviewSlotId = `job-review-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
          const slotResult = await orchestrator.createSlot(reviewSlotId);

          // Apply stored thinking level preference
          const uiState = uiStateStore.loadState();
          const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
          if (storedThinkingLevel) {
            await orchestrator.setThinkingLevel(reviewSlotId, storedThinkingLevel);
            slotResult.state = await orchestrator.getState(reviewSlotId);
          }

          // Store review session ID in frontmatter
          setJobSessionId(matchingJob.path, 'reviewSessionId', reviewSlotId);

          // Broadcast slot created + job promoted
          broadcastToWorkspace(workspaceId, {
            type: 'sessionSlotCreated',
            workspaceId,
            sessionSlotId: reviewSlotId,
            state: slotResult.state,
            messages: slotResult.messages,
          });

          syncIntegration.createSlot(workspaceId, reviewSlotId);
          syncIntegration.setQueuedMessages(workspaceId, reviewSlotId, { steering: [], followUp: [] });

          broadcastToWorkspace(workspaceId, {
            type: 'jobPromoted',
            workspaceId,
            jobPath: matchingJob.path,
            job,
            sessionSlotId: reviewSlotId,
          });

          // Refresh jobs list + active jobs
          const updatedJobs = discoverJobs(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'jobsList', workspaceId, jobs: updatedJobs });
          syncIntegration.setJobs(workspaceId, updatedJobs);

          const activeJobs = getActiveJobStates(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'activeJob', workspaceId, activeJobs });
          syncIntegration.setActiveJobs(workspaceId, activeJobs);

          // Send the review prompt
          const reviewPrompt = buildReviewPrompt(matchingJob.path);
          const initialMessage = `${reviewPrompt}\n\nPlease read the job file and execute the review steps.`;
          await orchestrator.prompt(reviewSlotId, initialMessage);
        } else {
          // No review section — auto-promote executing → complete (skip review)
          console.log(`[Jobs] Auto-promoting job "${matchingJob.title}" from executing → complete (no review section)`);
          const { job } = promoteJob(matchingJob.path, 'complete');

          broadcastToWorkspace(workspaceId, {
            type: 'jobPromoted',
            workspaceId,
            jobPath: matchingJob.path,
            job,
          });

          const updatedJobs = discoverJobs(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'jobsList', workspaceId, jobs: updatedJobs });
          syncIntegration.setJobs(workspaceId, updatedJobs);

          const activeJobs = getActiveJobStates(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'activeJob', workspaceId, activeJobs });
          syncIntegration.setActiveJobs(workspaceId, activeJobs);
        }
      } else if (matchingJob.phase === 'review') {
        const reviewSlotId = matchingJob.frontmatter.reviewSessionId;

        if (!matchingJob.frontmatter.finalized && reviewSlotId) {
          // First agentEnd after review — send finalize nudge
          console.log(`[Jobs] Sending finalize nudge for job "${matchingJob.title}"`);
          updateJobFrontmatter(matchingJob.path, { finalized: true });

          const orchestrator = workspaceManager.getOrchestrator(workspaceId);
          const finalizePrompt = buildFinalizePrompt(matchingJob.path);
          await orchestrator.prompt(reviewSlotId, finalizePrompt);
        } else {
          // Second agentEnd (after finalize) — promote to complete
          console.log(`[Jobs] Auto-promoting job "${matchingJob.title}" from review → complete`);

          const { job } = promoteJob(matchingJob.path);

          broadcastToWorkspace(workspaceId, {
            type: 'jobPromoted',
            workspaceId,
            jobPath: matchingJob.path,
            job,
          });

          // Refresh jobs list + active jobs
          const updatedJobs = discoverJobs(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'jobsList', workspaceId, jobs: updatedJobs });
          syncIntegration.setJobs(workspaceId, updatedJobs);

          const activeJobs = getActiveJobStates(workspace.path);
          broadcastToWorkspace(workspaceId, { type: 'activeJob', workspaceId, activeJobs });
          syncIntegration.setActiveJobs(workspaceId, activeJobs);
        }
      }
    } catch (err) {
      console.error(`[Jobs] Auto-promote failed:`, err);
    }
  });
});

// Health check endpoint
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
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
    allowedRoots: [],
    homeDirectory: homedir(),
    uiState,
    ...(updateAvailable ? { updateAvailable } : {}),
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
  // Sync protocol messages are handled by SyncIntegration's WebSocket listener.
  // Ignore them here to avoid noisy "Unknown message type" logs.
  const rawType = (message as { type?: string }).type;
  if (rawType === 'ack' || rawType === 'sync' || rawType === 'mutate') {
    return;
  }

  switch (message.type) {
    // ========================================================================
    // Workspace management
    // ========================================================================
    case 'openWorkspace': {
      const result = await workspaceManager.openWorkspace(message.path);
      
      // Track that this client is attached to this workspace
      clientWorkspaces.get(ws)?.add(result.workspace.id);
      
      // Register with sync system
      const syncClientId = syncIntegration.registerClient(ws, result.workspace.id);
      console.log(`[Sync] Client ${syncClientId} registered for workspace ${result.workspace.id}`);
      
      // Get startup info from the orchestrator
      const orchestrator = workspaceManager.getOrchestrator(result.workspace.id);
      const startupInfo = await orchestrator.getStartupInfo();

      // Ensure workspace exists in sync state.
      syncIntegration.createWorkspace(result.workspace.id, message.path);

      // Seed sessions in sync state early so snapshot/delta can drive sidebar state.
      try {
        const sessions = await orchestrator.listSessions();
        syncIntegration.setSessions(result.workspace.id, sessions);
      } catch {
        // Ignore session list failures during attach/open; client can refresh later.
      }

      // Ensure all current slots exist in sync state and seed queued state.
      for (const slot of orchestrator.listSlots()) {
        syncIntegration.createSlot(result.workspace.id, slot.slotId);
        try {
          const queued = await orchestrator.getQueuedMessages(slot.slotId);
          syncIntegration.setQueuedMessages(result.workspace.id, slot.slotId, queued);
        } catch {
          // Slot may disappear during reconnect races; ignore.
        }
      }
      
      // Apply stored thinking level preference if one exists for this workspace
      // Only apply if this is a newly created workspace (not existing)
      if (!result.isExisting) {
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[message.path];
        if (storedThinkingLevel) {
          await orchestrator.setThinkingLevel('default', storedThinkingLevel);
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
        isExisting: result.isExisting,
        bufferedEventCount: result.bufferedEvents.length,
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
      
      // Seed sync workspace UI state (right pane + tab layouts) for this workspace
      const currentUiState = uiStateStore.loadState();
      syncIntegration.setWorkspaceUI(
        result.workspace.id,
        result.workspace.path,
        currentUiState.rightPaneByWorkspace[result.workspace.path] ?? false,
        currentUiState.paneTabsByWorkspace[result.workspace.path] ?? [],
        currentUiState.activePaneTabByWorkspace[result.workspace.path] ?? null,
      );

      // Seed sync state with current plans/jobs snapshot for this workspace
      const plans = discoverPlans(message.path);
      syncIntegration.setPlans(result.workspace.id, plans);
      const jobs = discoverJobs(message.path);
      syncIntegration.setJobs(result.workspace.id, jobs);

      // Send and sync active plan state
      const activePlanPath = uiStateStore.getActivePlan(message.path);
      const activePlanState = activePlanPath ? getActivePlanState(activePlanPath) : null;
      send(ws, {
        type: 'activePlan',
        workspaceId: result.workspace.id,
        activePlan: activePlanState,
      });
      syncIntegration.setActivePlan(result.workspace.id, activePlanState);

      // Send and sync active job states (jobs in planning/executing phase)
      try {
        const activeJobs = getActiveJobStates(message.path);
        send(ws, {
          type: 'activeJob',
          workspaceId: result.workspace.id,
          activeJobs,
        });
        syncIntegration.setActiveJobs(result.workspace.id, activeJobs);
      } catch {
        // Jobs directory may not exist yet; still clear active jobs in sync state
        syncIntegration.setActiveJobs(result.workspace.id, []);
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
      syncIntegration.closeWorkspace(message.workspaceId);
      syncIntegration.stopFileWatching(message.workspaceId);
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
        // Return roots
        send(ws, {
          type: 'directoryList',
          path: '/',
          entries: directoryBrowser.listRoots(),
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
          await orchestrator.setThinkingLevel(result.slotId, storedThinkingLevel);
          // Update the state to reflect the applied thinking level
          result.state = await orchestrator.getState(result.slotId);
        }
      }
      
      syncIntegration.createSlot(message.workspaceId, result.slotId);
      syncIntegration.setQueuedMessages(message.workspaceId, result.slotId, { steering: [], followUp: [] });

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
      syncIntegration.deleteSlot(message.workspaceId, message.sessionSlotId);
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

      // Keep sync state aligned with workspace-scoped UI layout state.
      for (const workspace of workspaceManager.listWorkspaces()) {
        syncIntegration.setWorkspaceUI(
          workspace.id,
          workspace.path,
          updated.rightPaneByWorkspace[workspace.path] ?? false,
          updated.paneTabsByWorkspace[workspace.path] ?? [],
          updated.activePaneTabByWorkspace[workspace.path] ?? null,
        );
      }
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
      await orchestrator.steer(slotId, message.message, message.images);

      // Broadcast updated queue state so all clients stay in sync.
      const steerQueue = await orchestrator.getQueuedMessages(slotId);
      syncIntegration.setQueuedMessages(message.workspaceId, slotId, steerQueue);
      broadcastToWorkspace(message.workspaceId, {
        type: 'queuedMessages',
        workspaceId: message.workspaceId,
        sessionSlotId: slotId,
        steering: steerQueue.steering,
        followUp: steerQueue.followUp,
      });
      break;
    }

    case 'followUp': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.followUp(slotId, message.message);

      // Broadcast updated queue state so all clients stay in sync.
      const followQueue = await orchestrator.getQueuedMessages(slotId);
      syncIntegration.setQueuedMessages(message.workspaceId, slotId, followQueue);
      broadcastToWorkspace(message.workspaceId, {
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
      await orchestrator.setThinkingLevel(slotId, message.level);
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
        messages: await orchestrator.getMessages(slotId),
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
        messages: await orchestrator.getMessages(slotId),
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
        messages: await orchestrator.getMessages(slotId),
      });
      break;
    }

    case 'getSessions': {
      // Sessions list is workspace-wide
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const sessions = await orchestrator.listSessions();
      send(ws, {
        type: 'sessions',
        workspaceId: message.workspaceId,
        sessions,
      });
      syncIntegration.setSessions(message.workspaceId, sessions);
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
        commands: await orchestrator.getCommands(slotId),
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
          messages: await orchestrator.getMessages(slotId),
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
        messages: await orchestrator.getForkMessages(slotId),
      });
      break;
    }

    case 'setSessionName': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      await orchestrator.setSessionName(slotId, message.name);
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
          await orchestrator.setSessionName(slotId, trimmedName);
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
            messages: await orchestrator.getMessages(slotId),
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
      await orchestrator.cycleThinkingLevel(slotId);
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
      await orchestrator.setSteeringMode(slotId, message.mode);
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
      await orchestrator.setFollowUpMode(slotId, message.mode);
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
      await orchestrator.setAutoCompaction(slotId, message.enabled);
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
      await orchestrator.setAutoRetry(slotId, message.enabled);
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
      await orchestrator.abortRetry(slotId);
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
      await orchestrator.abortBash(slotId);
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
        stats: await orchestrator.getSessionStats(slotId),
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
        text: await orchestrator.getLastAssistantText(slotId),
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



    // ========================================================================
    // Session Tree Navigation
    // ========================================================================
    case 'getSessionTree': {
      const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
      const slotId = getSlotId(message);
      const { tree, currentLeafId } = await orchestrator.getSessionTree(slotId);
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
          messages: await orchestrator.getMessages(slotId),
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
      const text = await orchestrator.getLastAssistantText(slotId);
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
      const { steering, followUp } = await orchestrator.getQueuedMessages(slotId);
      syncIntegration.setQueuedMessages(message.workspaceId, slotId, { steering, followUp });
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
      const { steering, followUp } = await orchestrator.clearQueue(slotId);
      syncIntegration.setQueuedMessages(message.workspaceId, slotId, { steering, followUp });
      broadcastToWorkspace(message.workspaceId, {
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

      // Get git status for the workspace
      const gitChangedFiles = getGitChangedFiles(rootPath);
      const gitChangedDirs = getGitChangedDirectories(rootPath);

      try {
        const entries = readdirSync(targetPath, { withFileTypes: true })
          .filter((entry) => !entry.name.startsWith('.'))  // Only skip hidden files
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
    // Directory watching for file tree (Phase 1 of file watcher)
    // ========================================================================
    case 'watchDirectory': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;

      const rootPath = resolve(workspace.path);
      const relativePath = message.path.replace(/^\/+/, '');
      const targetPath = resolve(rootPath, relativePath);

      // Security check
      if (!targetPath.startsWith(rootPath + sep) && targetPath !== rootPath) {
        break;
      }

      // Start watching via sync integration
      syncIntegration.watchDirectory(message.workspaceId, targetPath);
      break;
    }

    case 'unwatchDirectory': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;

      const rootPath = resolve(workspace.path);
      const relativePath = message.path.replace(/^\/+/, '');
      const targetPath = resolve(rootPath, relativePath);

      syncIntegration.unwatchDirectory(message.workspaceId, targetPath);
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
        // Absolute path — allow any path
        targetPath = resolve(expandedPath);
        displayPath = rawPath;
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
      const branch = getGitBranch(workspace.path);
      const worktree = getGitWorktree(workspace.path);

      send(ws, {
        type: 'gitStatus',
        workspaceId: message.workspaceId,
        files,
        branch,
        worktree,
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
      await workspace.orchestrator.handleExtensionUIResponse(slotId, message.response);
      break;
    }

    case 'customUIInput': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        console.warn(`[WS] Workspace not found for customUIInput: ${message.workspaceId}`);
        break;
      }
      const slotId = message.sessionSlotId || 'default';
      await workspace.orchestrator.handleCustomUIInput(slotId, message.input);
      break;
    }

    case 'questionnaireResponse': {
      // Route by toolCallId first (source of truth), fallback to message workspace/slot.
      const route = pendingQuestionnaireRoutes.get(message.toolCallId);
      const workspaceId = route?.workspaceId || message.workspaceId;
      const slotId = route?.slotId || message.sessionSlotId || 'default';

      const workspace = workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        console.warn(`[WS] Workspace not found for questionnaireResponse: ${workspaceId}`);
        break;
      }

      // Ignore stale/duplicate responses that no longer have a pending resolver.
      if (!(await workspace.orchestrator.hasPendingQuestionnaire(slotId, message.toolCallId))) {
        console.warn(`[WS] Ignoring stale questionnaireResponse for ${message.toolCallId}`);
        // Drop stale routing entry if present.
        pendingQuestionnaireRoutes.delete(message.toolCallId);
        break;
      }

      await workspace.orchestrator.handleQuestionnaireResponse(slotId, {
        toolCallId: message.toolCallId,
        answers: message.answers,
        cancelled: message.cancelled,
      });
      pendingQuestionnaireRoutes.delete(message.toolCallId);

      // Clear pending UI in sync state only when response was valid.
      syncIntegration.clearPendingUI(workspaceId, slotId);
      console.log(`[Sync] Cleared pending questionnaire for ${workspaceId}/${slotId}`);
      break;
    }

    // ========================================================================
    // Plans
    // ========================================================================
    case 'getPlans': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans: [] });
        syncIntegration.setPlans(message.workspaceId, []);
        break;
      }
      const plans = discoverPlans(workspace.path);
      send(ws, { type: 'plansList', workspaceId: message.workspaceId, plans });
      syncIntegration.setPlans(message.workspaceId, plans);
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
        broadcastToWorkspace(message.workspaceId, {
          type: 'planSaved',
          workspaceId: message.workspaceId,
          planPath: message.planPath,
          plan,
        });

        const plans = discoverPlans(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'plansList', workspaceId: message.workspaceId, plans });
        syncIntegration.setPlans(message.workspaceId, plans);

        // If this is the active plan, also send updated active plan state
        const activePlanPath = uiStateStore.getActivePlan(workspace.path);
        if (activePlanPath === message.planPath) {
          const activePlanState = getActivePlanState(message.planPath);
          broadcastToWorkspace(message.workspaceId, {
            type: 'activePlan',
            workspaceId: message.workspaceId,
            activePlan: activePlanState,
          });
          syncIntegration.setActivePlan(message.workspaceId, activePlanState);
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
        broadcastToWorkspace(message.workspaceId, {
          type: 'activePlan',
          workspaceId: message.workspaceId,
          activePlan: activePlanState,
        });
        syncIntegration.setActivePlan(message.workspaceId, activePlanState);
        
        // Create a new session slot for the plan execution
        const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);
        const planSlotId = `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const slotResult = await orchestrator.createSlot(planSlotId);
        syncIntegration.createSlot(message.workspaceId, planSlotId);
        syncIntegration.setQueuedMessages(message.workspaceId, planSlotId, { steering: [], followUp: [] });
        
        // Apply stored thinking level preference
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
        if (storedThinkingLevel) {
          await orchestrator.setThinkingLevel(planSlotId, storedThinkingLevel);
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
        broadcastToWorkspace(message.workspaceId, { type: 'plansList', workspaceId: message.workspaceId, plans });
        syncIntegration.setPlans(message.workspaceId, plans);
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
      
      broadcastToWorkspace(message.workspaceId, {
        type: 'activePlan',
        workspaceId: message.workspaceId,
        activePlan: null,
      });
      syncIntegration.setActivePlan(message.workspaceId, null);
      
      // Refresh plans list
      const plans = discoverPlans(workspace.path);
      broadcastToWorkspace(message.workspaceId, { type: 'plansList', workspaceId: message.workspaceId, plans });
      syncIntegration.setPlans(message.workspaceId, plans);
      break;
    }

    case 'updatePlanTask': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content } = readPlan(message.planPath);
        const updatedContent = updateTaskInContent(content, message.line, message.done);
        const plan = writePlan(message.planPath, updatedContent);
        
        broadcastToWorkspace(message.workspaceId, {
          type: 'planTaskUpdated',
          workspaceId: message.workspaceId,
          planPath: message.planPath,
          plan,
        });

        const plans = discoverPlans(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'plansList', workspaceId: message.workspaceId, plans });
        syncIntegration.setPlans(message.workspaceId, plans);
        
        // If this is the active plan, also update active plan state
        const activePlanPath = uiStateStore.getActivePlan(workspace.path);
        if (activePlanPath === message.planPath) {
          const activePlanState = getActivePlanState(message.planPath);
          broadcastToWorkspace(message.workspaceId, {
            type: 'activePlan',
            workspaceId: message.workspaceId,
            activePlan: activePlanState,
          });
          syncIntegration.setActivePlan(message.workspaceId, activePlanState);
          
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
              broadcastToWorkspace(message.workspaceId, {
                type: 'activePlan',
                workspaceId: message.workspaceId,
                activePlan: null,
              });
              syncIntegration.setActivePlan(message.workspaceId, null);
              
              // Refresh plans list to show completed status
              const plansAfterComplete = discoverPlans(workspace.path);
              broadcastToWorkspace(message.workspaceId, { type: 'plansList', workspaceId: message.workspaceId, plans: plansAfterComplete });
              syncIntegration.setPlans(message.workspaceId, plansAfterComplete);
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
        syncIntegration.setJobs(message.workspaceId, []);
        break;
      }
      const jobs = discoverJobs(workspace.path);
      send(ws, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
      syncIntegration.setJobs(message.workspaceId, jobs);
      break;
    }

    case 'getJobLocations': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const locations = getJobLocations(workspace.path);
        const defaultLocation = locations.find(l => l.isDefault)?.path || locations[0]?.path;
        send(ws, {
          type: 'jobLocations',
          workspaceId: message.workspaceId,
          locations,
          defaultLocation,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to get job locations: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
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
        const { path: jobPath, job } = createJob(
          workspace.path,
          message.title,
          message.description,
          message.tags,
          message.location,
        );
        broadcastToWorkspace(message.workspaceId, {
          type: 'jobSaved',
          workspaceId: message.workspaceId,
          jobPath,
          job,
        });
        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
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
        broadcastToWorkspace(message.workspaceId, {
          type: 'jobSaved',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });

        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
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
        const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);

        // If promoted to planning, executing, or review, spin up a conversation
        if (job.phase === 'planning' || job.phase === 'executing' || job.phase === 'review') {

          if (job.phase === 'executing' && job.frontmatter.executionSessionId) {
            // Reuse existing execution session (e.g., demoted from review, now re-promoted)
            sessionSlotId = job.frontmatter.executionSessionId;
          } else if (job.phase === 'review' && job.frontmatter.reviewSessionId) {
            // Reuse existing review session
            sessionSlotId = job.frontmatter.reviewSessionId;
          } else {
            // Create a new session slot
            const slotId = `job-${job.phase}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            const slotResult = await orchestrator.createSlot(slotId);
            sessionSlotId = slotId;

            // Apply stored thinking level preference
            const uiState = uiStateStore.loadState();
            const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
            if (storedThinkingLevel) {
              await orchestrator.setThinkingLevel(slotId, storedThinkingLevel);
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
            const sessionField = job.phase === 'planning'
              ? 'planningSessionId'
              : job.phase === 'review'
              ? 'reviewSessionId'
              : 'executionSessionId';
            setJobSessionId(message.jobPath, sessionField, slotId);

            // Send the initial prompt
            const prompt = job.phase === 'planning'
              ? buildPlanningPrompt(message.jobPath)
              : job.phase === 'review'
              ? buildReviewPrompt(message.jobPath)
              : buildExecutionPrompt(message.jobPath);
            const initialMessage = job.phase === 'planning'
              ? `${prompt}\n\nPlease read the job file and help me create a plan.`
              : job.phase === 'review'
              ? `${prompt}\n\nPlease read the job file and execute the review steps.`
              : `${prompt}\n\nPlease read the job file and begin working through the tasks.`;
            await orchestrator.prompt(slotId, initialMessage);
          }
        }

        if (sessionSlotId) {
          syncIntegration.createSlot(message.workspaceId, sessionSlotId);
          try {
            const queued = await orchestrator.getQueuedMessages(sessionSlotId);
            syncIntegration.setQueuedMessages(message.workspaceId, sessionSlotId, queued);
          } catch {
            syncIntegration.setQueuedMessages(message.workspaceId, sessionSlotId, { steering: [], followUp: [] });
          }
        }

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobPromoted',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
          sessionSlotId,
        });

        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        // Send active job states
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
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

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobPromoted', // reuse same event — it's a phase change
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
          // If demoting to executing, provide the existing session slot
          sessionSlotId: job.phase === 'executing' ? job.frontmatter.executionSessionId : undefined,
        });

        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        // Send active job states
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
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
        // Update the 'updated' timestamp in frontmatter so clients can detect changes
        const contentWithTimestamp = updateJobFrontmatter(updatedContent, { updated: new Date().toISOString() });
        const job = writeJob(message.jobPath, contentWithTimestamp);

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobTaskUpdated',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });

        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        // Send updated active job states (progress may have changed)
        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, {
          type: 'activeJob',
          workspaceId: message.workspaceId,
          activeJobs,
        });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to update job task: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'deleteJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        await unlink(message.jobPath);

        // Refresh jobs list + active jobs
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'activeJob', workspaceId: message.workspaceId, activeJobs });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to delete job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'renameJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { content } = readJob(message.jobPath);
        const updatedContent = updateJobFrontmatter(content, {
          title: message.newTitle,
          updated: new Date().toISOString(),
        });
        const job = writeJob(message.jobPath, updatedContent);

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobSaved',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });

        // Refresh jobs list + active jobs
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'activeJob', workspaceId: message.workspaceId, activeJobs });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to rename job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'archiveJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        archiveJob(message.jobPath);

        // Refresh jobs list + active jobs
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'activeJob', workspaceId: message.workspaceId, activeJobs });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to archive job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'unarchiveJob': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        unarchiveJob(message.jobPath);

        // Refresh jobs list + active jobs
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);

        const activeJobs = getActiveJobStates(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'activeJob', workspaceId: message.workspaceId, activeJobs });
        syncIntegration.setActiveJobs(message.workspaceId, activeJobs);

        // Also refresh archived list
        const archivedJobs = discoverArchivedJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'archivedJobsList', workspaceId: message.workspaceId, jobs: archivedJobs });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to unarchive job: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'getArchivedJobs': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) {
        send(ws, { type: 'archivedJobsList', workspaceId: message.workspaceId, jobs: [] });
        break;
      }
      const archivedJobs = discoverArchivedJobs(workspace.path);
      send(ws, { type: 'archivedJobsList', workspaceId: message.workspaceId, jobs: archivedJobs });
      break;
    }

    case 'startJobConversation': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { job } = readJob(message.jobPath);
        const orchestrator = workspaceManager.getOrchestrator(message.workspaceId);

        // Create a new session slot for this conversation
        const slotId = `job-convo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const slotResult = await orchestrator.createSlot(slotId);

        // Apply stored thinking level preference
        const uiState = uiStateStore.loadState();
        const storedThinkingLevel = uiState.thinkingLevels[workspace.path];
        if (storedThinkingLevel) {
          await orchestrator.setThinkingLevel(slotId, storedThinkingLevel);
          slotResult.state = await orchestrator.getState(slotId);
        }

        // Send slot created event
        send(ws, {
          type: 'sessionSlotCreated',
          workspaceId: message.workspaceId,
          sessionSlotId: slotId,
          state: slotResult.state,
          messages: slotResult.messages,
        });

        // Track conversation in job frontmatter
        const updatedJob = addConversationToJob(message.jobPath, slotId);

        syncIntegration.createSlot(message.workspaceId, slotId);

        // Send the initial prompt with job context
        const prompt = buildConversationPrompt(message.jobPath);
        const userMessage = message.message
          ? `${prompt}\n\n${message.message}`
          : `${prompt}\n\nPlease read the job file and let me know what you think. I'd like to discuss this.`;
        await orchestrator.prompt(slotId, userMessage);

        // Notify client
        broadcastToWorkspace(message.workspaceId, {
          type: 'jobConversationStarted',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job: updatedJob,
          sessionSlotId: slotId,
        });

        // Refresh jobs list
        const jobs = discoverJobs(workspace.path);
        broadcastToWorkspace(message.workspaceId, { type: 'jobsList', workspaceId: message.workspaceId, jobs });
        syncIntegration.setJobs(message.workspaceId, jobs);
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to start conversation: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    // Job Attachments
    // ========================================================================
    case 'addJobAttachment': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        // Validate file size (10MB limit)
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        const base64Size = message.base64Data.length;
        const estimatedSize = Math.floor(base64Size * 0.75); // Approximate decoded size

        if (estimatedSize > MAX_FILE_SIZE) {
          send(ws, {
            type: 'error',
            message: `File too large. Maximum size is 10MB.`,
            workspaceId: message.workspaceId,
          });
          break;
        }

        // Validate file type (images, PDFs, text files)
        const allowedTypes = ['image/', 'application/pdf', 'text/'];
        const isAllowedType = allowedTypes.some(allowed => message.mediaType.startsWith(allowed));
        if (!isAllowedType) {
          send(ws, {
            type: 'error',
            message: `File type ${message.mediaType} is not supported. Supported types: images, PDFs, text files.`,
            workspaceId: message.workspaceId,
          });
          break;
        }

        // Decode base64 to buffer
        const buffer = Buffer.from(message.base64Data, 'base64');

        // Add attachment
        const { job, attachment } = addAttachmentToJob(
          message.jobPath,
          message.fileName,
          message.mediaType,
          buffer,
        );

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobAttachmentAdded',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
          attachment,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to add attachment: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'removeJobAttachment': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const { job, attachment } = removeAttachmentFromJob(message.jobPath, message.attachmentId);

        if (!attachment) {
          send(ws, {
            type: 'error',
            message: `Attachment not found: ${message.attachmentId}`,
            workspaceId: message.workspaceId,
          });
          break;
        }

        broadcastToWorkspace(message.workspaceId, {
          type: 'jobAttachmentRemoved',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          job,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to remove attachment: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'readJobAttachment': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const result = readAttachmentFile(message.jobPath, message.attachmentId);

        if (!result) {
          send(ws, {
            type: 'error',
            message: `Attachment not found: ${message.attachmentId}`,
            workspaceId: message.workspaceId,
          });
          break;
        }

        send(ws, {
          type: 'jobAttachmentRead',
          workspaceId: message.workspaceId,
          jobPath: message.jobPath,
          attachmentId: message.attachmentId,
          base64Data: result.base64Data,
          mediaType: result.mediaType,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to read attachment: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    // Job Configuration
    // ========================================================================
    case 'updateJobConfig': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        let config = loadJobConfig(workspace.path);

        if (message.addLocation) {
          config = addJobLocation(workspace.path, message.addLocation);
        } else if (message.removeLocation) {
          config = removeJobLocation(workspace.path, message.removeLocation);
        } else if (message.locations) {
          // Full locations update (reorder or replace)
          if (config) {
            config.locations = message.locations.map(loc => resolveLocationPath(loc, workspace.path));
            if (message.defaultLocation) {
              config.defaultLocation = resolveLocationPath(message.defaultLocation, workspace.path);
            }
            saveJobConfig(workspace.path, config);
          }
        } else if (message.defaultLocation && config) {
          config = setDefaultJobLocation(workspace.path, message.defaultLocation);
        }

        // Send updated locations
        const locations = getJobLocations(workspace.path);
        const defaultLocation = locations.find(l => l.isDefault)?.path || locations[0]?.path;
        broadcastToWorkspace(message.workspaceId, {
          type: 'jobConfigUpdated',
          workspaceId: message.workspaceId,
          locations,
          defaultLocation,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to update job config: ${err instanceof Error ? err.message : 'Unknown error'}`,
          workspaceId: message.workspaceId,
        });
      }
      break;
    }

    case 'browseJobDirectory': {
      const workspace = workspaceManager.getWorkspace(message.workspaceId);
      if (!workspace) break;
      try {
        const browsePath = message.path || workspace.path;
        const entries = readdirSync(browsePath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => ({
            name: dirent.name,
            path: join(browsePath, dirent.name),
            isDirectory: true,
            hasPiSessions: false,
          }));

        send(ws, {
          type: 'jobDirectoryList',
          workspaceId: message.workspaceId,
          path: browsePath,
          entries,
        });
      } catch (err) {
        send(ws, {
          type: 'error',
          message: `Failed to browse directory: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
  _ws: WebSocket,
  workspaceId: string,
  orchestrator: SessionOrchestrator
): void {
  setImmediate(async () => {
    try {
      const sessions = await orchestrator.listSessions();
      // Broadcast to all clients in this workspace so sidebars stay in sync
      broadcastToWorkspace(workspaceId, { type: 'sessions', workspaceId, sessions });
      syncIntegration.setSessions(workspaceId, sessions);
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

// ---------------------------------------------------------------------------
// Global error handlers – prevent the server from hard-crashing on transient
// errors (e.g. ENOENT from the Pi SDK when a session directory is missing).
// ---------------------------------------------------------------------------
function broadcastError(errorMessage: string): void {
  const event: WsServerEvent = {
    type: 'error',
    message: errorMessage,
  };
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  }
}

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception (kept alive):', error);
  broadcastError(`Internal error: ${error instanceof Error ? error.message : String(error)}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (kept alive):', reason);
  broadcastError(`Internal error: ${reason instanceof Error ? reason.message : String(reason)}`);
});

server.listen(PORT, config.host, () => {
  console.log(`[Server] Pi-Deck server running on http://${config.host}:${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://${config.host}:${PORT}/ws`);

  // Notify parent process (bin/pi-deck.js) that the server is ready
  if (typeof process.send === 'function') {
    process.send({ type: 'ready', port: PORT });
  }
});
