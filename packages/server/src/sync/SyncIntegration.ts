/**
 * Sync Integration Layer
 *
 * Bridges the existing event-based architecture with the new sync-based state.
 * This allows gradual migration without rewriting everything at once.
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import { SyncManager, type SyncMessage } from './SyncManager.js';
import type { SessionInfo as SyncSessionInfo } from './SyncState.js';
import type { ActiveJobState, ActivePlanState, JobInfo, PaneTabPageState, PlanInfo, SessionEvent } from '@pi-deck/shared';
import { ScopedFileWatcher } from './FileWatcher.js';
import { PlanJobWatcher } from './PlanJobWatcher.js';

export class SyncIntegration extends EventEmitter {
  private syncManager: SyncManager;
  private clientWsMap = new Map<string, WebSocket>();
  private fileWatchers = new Map<string, ScopedFileWatcher>(); // workspaceId -> watcher
  private planJobWatcher: PlanJobWatcher;

  constructor(dbPath: string) {
    super();
    this.syncManager = new SyncManager(dbPath);
    this.planJobWatcher = new PlanJobWatcher({ debounceMs: 500 });

    // Forward sync events to WebSocket clients
    this.syncManager.on('stateChanged', ({ workspaceId, version, mutation }) => {
      this.emit('syncStateChanged', { workspaceId, version, mutation });
    });

    // Listen for plan/job changes from watcher
    this.planJobWatcher.on('plansChanged', ({ workspaceId, plans }) => {
      this.syncManager.mutate({
        type: 'plansUpdate',
        workspaceId,
        plans,
      });
    });

    this.planJobWatcher.on('jobsChanged', ({ workspaceId, jobs }) => {
      this.syncManager.mutate({
        type: 'jobsUpdate',
        workspaceId,
        jobs,
      });
    });
  }

  /**
   * Register a WebSocket client for sync
   */
  registerClient(ws: WebSocket, workspaceId: string, clientId?: string): string {
    const id = clientId || this.syncManager.registerClient(ws, workspaceId);
    this.clientWsMap.set(id, ws);
    
    // Handle sync messages from client
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as SyncMessage & { type: string };
        if (msg.type === 'sync' || msg.type === 'mutate' || msg.type === 'ack') {
          // Forward to sync manager
          this.handleClientSyncMessage(id, msg);
        }
      } catch {
        // Not a sync message, ignore
      }
    });

    // Send initial sync
    this.syncManager.sendInitialSync(id);
    
    return id;
  }

  /**
   * Convert a session event to a state mutation
   */
  handleSessionEvent(workspaceId: string, slotId: string, event: SessionEvent): void {
    switch (event.type) {
      case 'messageStart': {
        this.syncManager.mutate({
          type: 'messagesAppend',
          workspaceId,
          slotId,
          messages: [event.message],
        });
        break;
      }
      
      case 'messageUpdate': {
        // Update streaming text - could be optimized
        break;
      }
      
      case 'messageEnd': {
        // Message complete - update with final content
        break;
      }
      
      case 'toolStart': {
        this.syncManager.mutate({
          type: 'toolExecutionStart',
          workspaceId,
          slotId,
          execution: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: 'running',
            args: event.args,
            startedAt: Date.now(),
          },
        });
        break;
      }
      
      case 'toolEnd': {
        this.syncManager.mutate({
          type: 'toolExecutionEnd',
          workspaceId,
          slotId,
          toolCallId: event.toolCallId,
          result: event.result,
          error: event.isError,
        });
        break;
      }
      
      case 'agentStart': {
        this.syncManager.mutate({
          type: 'slotUpdate',
          workspaceId,
          slotId,
          updates: { isStreaming: true },
        });
        break;
      }
      
      case 'agentEnd': {
        this.syncManager.mutate({
          type: 'slotUpdate',
          workspaceId,
          slotId,
          updates: { isStreaming: false },
        });
        break;
      }
      
      case 'compactionStart': {
        this.syncManager.mutate({
          type: 'slotUpdate',
          workspaceId,
          slotId,
          updates: { isCompacting: true },
        });
        break;
      }
      
      case 'compactionEnd': {
        this.syncManager.mutate({
          type: 'slotUpdate',
          workspaceId,
          slotId,
          updates: { isCompacting: false },
        });
        break;
      }
    }
  }

  /**
   * Set pending questionnaire UI
   */
  setPendingQuestionnaire(workspaceId: string, slotId: string, toolCallId: string, questions: unknown[]): void {
    this.syncManager.mutate({
      type: 'pendingUISet',
      workspaceId,
      slotId,
      pendingUI: {
        type: 'questionnaire',
        id: toolCallId,
        data: { toolCallId, questions },
        createdAt: Date.now(),
      },
    });
  }

  /**
   * Clear pending UI (questionnaire answered)
   */
  clearPendingUI(workspaceId: string, slotId: string): void {
    this.syncManager.mutate({
      type: 'pendingUISet',
      workspaceId,
      slotId,
      pendingUI: null,
    });
  }

  /**
   * Sync sessions list for a workspace.
   */
  setSessions(workspaceId: string, sessions: SyncSessionInfo[]): void {
    this.syncManager.mutate({
      type: 'sessionsUpdate',
      workspaceId,
      sessions,
    });
  }

  /**
   * Sync plans list for a workspace.
   */
  setPlans(workspaceId: string, plans: PlanInfo[]): void {
    this.syncManager.mutate({
      type: 'plansUpdate',
      workspaceId,
      plans,
    });
  }

  /**
   * Sync jobs list for a workspace.
   */
  setJobs(workspaceId: string, jobs: JobInfo[]): void {
    this.syncManager.mutate({
      type: 'jobsUpdate',
      workspaceId,
      jobs,
    });
  }

  /**
   * Sync active plan state for a workspace.
   */
  setActivePlan(workspaceId: string, activePlan: ActivePlanState | null): void {
    this.syncManager.mutate({
      type: 'activePlanUpdate',
      workspaceId,
      activePlan,
    });
  }

  /**
   * Sync active job states for a workspace.
   */
  setActiveJobs(workspaceId: string, activeJobs: ActiveJobState[]): void {
    this.syncManager.mutate({
      type: 'activeJobsUpdate',
      workspaceId,
      activeJobs,
    });
  }

  /**
   * Get workspace state from sync
   */
  getWorkspaceState(workspaceId: string) {
    return this.syncManager.getWorkspaceState(workspaceId);
  }

  /**
   * Create workspace in sync state and start watching plans/jobs.
   */
  createWorkspace(workspaceId: string, path: string): void {
    this.syncManager.mutate({
      type: 'workspaceCreate',
      workspaceId,
      path,
    });

    // Start watching plan/job directories for this workspace
    this.planJobWatcher.watchWorkspace(workspaceId, path);
  }

  /**
   * Create slot in sync state
   */
  createSlot(workspaceId: string, slotId: string): void {
    this.syncManager.mutate({
      type: 'slotCreate',
      workspaceId,
      slotId,
    });
  }

  /**
   * Delete slot in sync state.
   */
  deleteSlot(workspaceId: string, slotId: string): void {
    this.syncManager.mutate({
      type: 'slotDelete',
      workspaceId,
      slotId,
    });
  }

  /**
   * Sync workspace UI state used by multi-tab web UI.
   */
  setWorkspaceUI(
    workspaceId: string,
    workspacePath: string,
    rightPaneOpen: boolean,
    paneTabs: PaneTabPageState[],
    activePaneTab: string | null,
  ): void {
    this.syncManager.mutate({
      type: 'workspaceUIUpdate',
      workspaceId,
      workspacePath,
      rightPaneOpen,
      paneTabs,
      activePaneTab,
    });
  }

  /**
   * Sync queued steering/follow-up messages for a slot.
   */
  setQueuedMessages(
    workspaceId: string,
    slotId: string,
    queuedMessages: { steering: string[]; followUp: string[] },
  ): void {
    this.syncManager.mutate({
      type: 'queuedMessagesUpdate',
      workspaceId,
      slotId,
      queuedMessages,
    });
  }

  /**
   * Mark workspace closed in sync state and stop watching plans/jobs.
   */
  closeWorkspace(workspaceId: string): void {
    this.syncManager.mutate({
      type: 'workspaceClose',
      workspaceId,
    });

    // Stop watching plan/job directories
    this.planJobWatcher.unwatchWorkspace(workspaceId);
  }

  private handleClientSyncMessage(clientId: string, message: SyncMessage): void {
    // Handle sync-related messages
    if (message.type === 'sync') {
      this.syncManager.sendInitialSync(clientId, message.sinceVersion);
    }
  }

  /**
   * Start watching a directory for file changes.
   * Called when client expands a folder in the file tree.
   */
  watchDirectory(workspaceId: string, dirPath: string): void {
    let watcher = this.fileWatchers.get(workspaceId);
    if (!watcher) {
      watcher = new ScopedFileWatcher({ debounceMs: 100, maxWatchedDirs: 50 });
      this.setupFileWatcherListeners(workspaceId, watcher);
      this.fileWatchers.set(workspaceId, watcher);
    }

    // Watch the directory and emit initial state
    const entries = watcher.watchDirectory(dirPath);
    if (entries !== null) {
      // Emit mutation to add to watched directories
      this.syncManager.mutate({
        type: 'watchedDirectoryAdd',
        workspaceId,
        directoryPath: dirPath,
      });

      // Emit mutation with current entries
      this.syncManager.mutate({
        type: 'directoryEntriesUpdate',
        workspaceId,
        directoryPath: dirPath,
        entries,
      });

      // Update stats
      this.syncManager.mutate({
        type: 'fileWatcherStatsUpdate',
        workspaceId,
        stats: watcher.getStats(),
      });
    } else {
      // Directory doesn't exist or can't be watched
      this.syncManager.mutate({
        type: 'directoryWatchError',
        workspaceId,
        directoryPath: dirPath,
        error: 'Failed to watch directory - may not exist or insufficient permissions',
      });
    }
  }

  /**
   * Stop watching a directory.
   * Called when client collapses a folder in the file tree.
   */
  unwatchDirectory(workspaceId: string, dirPath: string): void {
    const watcher = this.fileWatchers.get(workspaceId);
    if (watcher) {
      watcher.unwatchDirectory(dirPath);

      // Emit mutation to remove from watched directories
      this.syncManager.mutate({
        type: 'watchedDirectoryRemove',
        workspaceId,
        directoryPath: dirPath,
      });

      // Update stats
      const stats = watcher.getStats();
      this.syncManager.mutate({
        type: 'fileWatcherStatsUpdate',
        workspaceId,
        stats,
      });

      // Clean up if no more watched directories
      if (watcher.getWatchedPaths().length === 0) {
        watcher.unwatchAll();
        this.fileWatchers.delete(workspaceId);
        // Clear stats when no longer watching
        this.syncManager.mutate({
          type: 'fileWatcherStatsUpdate',
          workspaceId,
          stats: { watchedCount: 0, maxWatched: 50, isAtLimit: false },
        });
      }
    }
  }

  /**
   * Get entries for a directory (without starting a watch).
   * Used for initial load before client requests watching.
   */
  getDirectoryEntries(workspaceId: string, dirPath: string): import('@pi-deck/shared').DirectoryEntry[] | null {
    const watcher = this.fileWatchers.get(workspaceId);
    if (watcher) {
      return watcher.getEntries(dirPath);
    }
    return null;
  }

  /**
   * Get file watcher stats for a workspace.
   */
  getFileWatcherStats(workspaceId: string): { watchedCount: number; maxWatched: number; isAtLimit: boolean } | null {
    const watcher = this.fileWatchers.get(workspaceId);
    if (watcher) {
      return watcher.getStats();
    }
    return null;
  }

  /**
   * Stop all file watching for a workspace.
   * Called when workspace is closed.
   */
  stopFileWatching(workspaceId: string): void {
    const watcher = this.fileWatchers.get(workspaceId);
    if (watcher) {
      watcher.unwatchAll();
      this.fileWatchers.delete(workspaceId);
    }
  }

  private setupFileWatcherListeners(workspaceId: string, watcher: ScopedFileWatcher): void {
    watcher.on('change', (event) => {
      // Find which watched directory this change belongs to
      const watchedPaths = watcher.getWatchedPaths();
      for (const dirPath of watchedPaths) {
        if (event.path.startsWith(dirPath + '/') || event.path === dirPath) {
          // Get updated entries for this directory
          const entries = watcher.getEntries(dirPath);
          if (entries !== null) {
            this.syncManager.mutate({
              type: 'directoryEntriesUpdate',
              workspaceId,
              directoryPath: dirPath,
              entries,
            });
          }
          break;
        }
      }
    });

    watcher.on('error', ({ path, error }) => {
      console.error(`[SyncIntegration] File watcher error for ${path}:`, error);
      this.syncManager.mutate({
        type: 'directoryWatchError',
        workspaceId,
        directoryPath: path,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    watcher.on('evicted', ({ path }) => {
      // Directory was evicted due to LRU limit
      this.syncManager.mutate({
        type: 'watchedDirectoryRemove',
        workspaceId,
        directoryPath: path,
      });
      // Update stats
      const stats = watcher.getStats();
      this.syncManager.mutate({
        type: 'fileWatcherStatsUpdate',
        workspaceId,
        stats,
      });
    });

    watcher.on('deleted', ({ path }) => {
      // Directory was deleted - remove from sync state
      console.log(`[SyncIntegration] Directory deleted: ${path}`);
      this.syncManager.mutate({
        type: 'watchedDirectoryRemove',
        workspaceId,
        directoryPath: path,
      });
      // Clear the entries since directory no longer exists
      this.syncManager.mutate({
        type: 'directoryEntriesUpdate',
        workspaceId,
        directoryPath: path,
        entries: [],
      });
    });
  }

  dispose(): void {
    // Clean up all file watchers
    for (const [workspaceId, watcher] of this.fileWatchers) {
      watcher.unwatchAll();
    }
    this.fileWatchers.clear();

    // Clean up plan/job watcher
    this.planJobWatcher.unwatchAll();

    this.syncManager.dispose();
    this.clientWsMap.clear();
    this.removeAllListeners();
  }
}
