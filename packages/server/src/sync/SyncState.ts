/**
 * Core sync state engine.
 * 
 * This is the single source of truth for all workspace state.
 * All mutations go through here, are persisted, and broadcast to clients.
 */

import { EventEmitter } from 'events';
import type { ActiveJobState, ActivePlanState, DirectoryEntry, JobInfo, PaneTabPageState, PlanInfo } from '@pi-deck/shared';
import { SQLiteStore } from './SQLiteStore.js';

// State types (will expand as we implement)
export interface GlobalState {
  version: number;
  lastModified: number;
  workspaces: Map<string, WorkspaceState>;
}

export interface SessionInfo {
  id: string;
  path: string;
  name?: string;
  firstMessage?: string;
  messageCount: number;
  updatedAt: number;
  cwd?: string;
}

export interface WorkspaceState {
  id: string;
  path: string;
  active: boolean;
  slots: Map<string, SlotState>;
  panes: PaneState;
  sessions: SessionInfo[];
  plans: PlanInfo[];
  jobs: JobInfo[];
  activePlan: ActivePlanState | null;
  activeJobs: ActiveJobState[];
  rightPaneOpen: boolean;
  paneTabs: PaneTabPageState[];
  activePaneTab: string | null;
  /** Directory entries for watched paths (file tree) */
  directoryEntries: Map<string, DirectoryEntry[]>;
  /** Paths currently being watched */
  watchedDirectories: Set<string>;
  /** File watcher statistics */
  fileWatcherStats: { watchedCount: number; maxWatched: number; isAtLimit: boolean } | null;
  createdAt: number;
  lastModified: number;
}

export interface SlotState {
  id: string;
  sessionId: string | null;
  sessionFile: string | null;
  messages: unknown[]; // Will be ChatMessage[]
  isStreaming: boolean;
  isCompacting: boolean;
  pendingUI: PendingUI | null;
  activeTools: ToolExecution[];
  queuedMessages: { steering: string[]; followUp: string[] };
  lastModified: number;
}

export interface PaneState {
  tabs: string[]; // slotIds
  activeTab: string | null;
  splitView: boolean;
}

export interface PendingUI {
  type: 'questionnaire' | 'extensionDialog' | 'customUI';
  id: string;
  data: unknown;
  createdAt: number;
}

export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  args: Record<string, unknown>;
  result?: unknown;
  startedAt: number;
  endedAt?: number;
}

// Mutation types
export type StateMutation =
  | { type: 'workspaceCreate'; workspaceId: string; path: string }
  | { type: 'workspaceClose'; workspaceId: string }
  | { type: 'slotCreate'; workspaceId: string; slotId: string }
  | { type: 'slotUpdate'; workspaceId: string; slotId: string; updates: Partial<SlotState> }
  | { type: 'slotDelete'; workspaceId: string; slotId: string }
  | { type: 'messagesAppend'; workspaceId: string; slotId: string; messages: unknown[] }
  | { type: 'pendingUISet'; workspaceId: string; slotId: string; pendingUI: PendingUI | null }
  | { type: 'toolExecutionStart'; workspaceId: string; slotId: string; execution: ToolExecution }
  | { type: 'toolExecutionEnd'; workspaceId: string; slotId: string; toolCallId: string; result: unknown; error?: boolean }
  | { type: 'paneUpdate'; workspaceId: string; updates: Partial<PaneState> }
  | { type: 'sessionsUpdate'; workspaceId: string; sessions: SessionInfo[] }
  | { type: 'plansUpdate'; workspaceId: string; plans: PlanInfo[] }
  | { type: 'jobsUpdate'; workspaceId: string; jobs: JobInfo[] }
  | { type: 'activePlanUpdate'; workspaceId: string; activePlan: ActivePlanState | null }
  | { type: 'activeJobsUpdate'; workspaceId: string; activeJobs: ActiveJobState[] }
  | {
      type: 'workspaceUIUpdate';
      workspaceId: string;
      workspacePath: string;
      rightPaneOpen: boolean;
      paneTabs: PaneTabPageState[];
      activePaneTab: string | null;
    }
  | {
      type: 'queuedMessagesUpdate';
      workspaceId: string;
      slotId: string;
      queuedMessages: { steering: string[]; followUp: string[] };
    }
  | {
      type: 'directoryEntriesUpdate';
      workspaceId: string;
      directoryPath: string;
      entries: DirectoryEntry[];
    }
  | {
      type: 'directoryWatchError';
      workspaceId: string;
      directoryPath: string;
      error: string;
    }
  | {
      type: 'watchedDirectoryAdd';
      workspaceId: string;
      directoryPath: string;
    }
  | {
      type: 'watchedDirectoryRemove';
      workspaceId: string;
      directoryPath: string;
    }
  | {
      type: 'fileWatcherStatsUpdate';
      workspaceId: string;
      stats: { watchedCount: number; maxWatched: number; isAtLimit: boolean };
    };

// Events emitted by SyncState
export interface SyncStateEvents {
  'stateChanged': { workspaceId: string; version: number; mutation: StateMutation };
  'workspaceCreated': { workspaceId: string; state: WorkspaceState };
  'workspaceClosed': { workspaceId: string };
  'clientStale': { clientId: string; currentVersion: number; clientVersion: number };
}

export class SyncState extends EventEmitter {
  private store: SQLiteStore;
  private inMemoryState: GlobalState;
  private vacuumInterval: NodeJS.Timeout | null = null;

  constructor(dbPath: string) {
    super();
    this.store = new SQLiteStore(dbPath);
    this.inMemoryState = {
      version: 0,
      lastModified: Date.now(),
      workspaces: new Map(),
    };
    
    // Periodically vacuum old deltas and snapshots
    this.vacuumInterval = setInterval(() => {
      this.store.vacuum(100, 10);
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Apply a mutation to state, persist it, and return the new version
   */
  mutate(mutation: StateMutation): number {
    const newVersion = this.inMemoryState.version + 1;
    
    // Apply to in-memory state
    this.applyMutation(mutation, newVersion);
    
    // Persist delta
    const delta = Buffer.from(JSON.stringify(mutation));
    this.store.storeDelta(
      this.getWorkspaceIdFromMutation(mutation),
      newVersion,
      this.inMemoryState.version,
      delta
    );
    
    // Update global version
    this.inMemoryState.version = newVersion;
    this.inMemoryState.lastModified = Date.now();
    
    // Emit event for broadcasting
    const workspaceId = this.getWorkspaceIdFromMutation(mutation);
    this.emit('stateChanged', { 
      workspaceId, 
      version: newVersion, 
      mutation 
    });
    
    // Occasionally create snapshot (every 100 versions)
    if (newVersion % 100 === 0) {
      this.createSnapshot(workspaceId);
    }
    
    return newVersion;
  }

  /**
   * Get current state for a workspace
   */
  getWorkspaceState(workspaceId: string): WorkspaceState | undefined {
    return this.inMemoryState.workspaces.get(workspaceId);
  }

  /**
   * Get full global state (for debugging/admin)
   */
  getGlobalState(): GlobalState {
    return {
      version: this.inMemoryState.version,
      lastModified: this.inMemoryState.lastModified,
      workspaces: new Map(this.inMemoryState.workspaces),
    };
  }

  /**
   * Get state delta since a specific version
   */
  getDeltaSince(workspaceId: string, sinceVersion: number): StateMutation[] {
    const deltas = this.store.getDeltasSince(workspaceId, sinceVersion);
    return deltas.map(d => JSON.parse(d.changes.toString()) as StateMutation);
  }

  /**
   * Get snapshot at or before a version
   */
  async getSnapshotAtVersion(workspaceId: string, version?: number): Promise<WorkspaceState | null> {
    // If version not specified, get latest
    if (version === undefined) {
      const state = this.getWorkspaceState(workspaceId);
      return state ? this.cloneWorkspaceState(state) : null;
    }
    
    // Try to find snapshot
    const snapshot = this.store.getSnapshotAtVersion(workspaceId, version);
    if (snapshot) {
      return JSON.parse(snapshot.state.toString()) as WorkspaceState;
    }
    
    // Reconstruct from earlier snapshot + deltas
    const latestSnapshot = this.store.getLatestSnapshot(workspaceId);
    if (!latestSnapshot) {
      return null;
    }
    
    let state = JSON.parse(latestSnapshot.state.toString()) as WorkspaceState;
    const deltas = this.store.getDeltasSince(workspaceId, latestSnapshot.version);
    
    for (const delta of deltas) {
      if (delta.version <= version) {
        const mutation = JSON.parse(delta.changes.toString()) as StateMutation;
        state = this.applyMutationToWorkspace(state, mutation);
      }
    }
    
    return state;
  }

  /**
   * Register a client connection
   */
  registerClient(clientId: string, workspaceId: string): void {
    this.store.registerClient(clientId, workspaceId);
  }

  /**
   * Update client's acknowledged version
   */
  clientAck(clientId: string, version: number): void {
    this.store.updateClientAck(clientId, version);
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    this.store.removeClient(clientId);
  }

  /**
   * Get clients that need updates
   */
  getStaleClients(workspaceId: string, currentVersion: number): Array<{ clientId: string; lastAckVersion: number }> {
    const clients = this.store.getWorkspaceClients(workspaceId);
    return clients
      .filter(c => c.last_ack_version < currentVersion)
      .map(c => ({ clientId: c.client_id, lastAckVersion: c.last_ack_version }));
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.vacuumInterval) {
      clearInterval(this.vacuumInterval);
    }
    this.store.close();
    this.removeAllListeners();
  }

  // ============ Private methods ============

  private applyMutation(mutation: StateMutation, version: number): void {
    switch (mutation.type) {
      case 'workspaceCreate': {
        const existing = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (existing) {
          existing.active = true;
          existing.path = mutation.path;
          existing.lastModified = Date.now();
          this.emit('workspaceCreated', { workspaceId: mutation.workspaceId, state: existing });
          break;
        }

        const workspace: WorkspaceState = {
          id: mutation.workspaceId,
          path: mutation.path,
          active: true,
          slots: new Map(),
          panes: { tabs: [], activeTab: null, splitView: false },
          sessions: [],
          plans: [],
          jobs: [],
          activePlan: null,
          activeJobs: [],
          rightPaneOpen: false,
          paneTabs: [],
          activePaneTab: null,
          directoryEntries: new Map(),
          watchedDirectories: new Set(),
          fileWatcherStats: null,
          createdAt: Date.now(),
          lastModified: Date.now(),
        };
        this.inMemoryState.workspaces.set(mutation.workspaceId, workspace);
        this.emit('workspaceCreated', { workspaceId: mutation.workspaceId, state: workspace });
        break;
      }
      
      case 'workspaceClose': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.active = false;
          workspace.lastModified = Date.now();
        }
        this.emit('workspaceClosed', { workspaceId: mutation.workspaceId });
        break;
      }
      
      case 'slotCreate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          if (!workspace.slots.has(mutation.slotId)) {
            const slot: SlotState = {
              id: mutation.slotId,
              sessionId: null,
              sessionFile: null,
              messages: [],
              isStreaming: false,
              isCompacting: false,
              pendingUI: null,
              activeTools: [],
              queuedMessages: { steering: [], followUp: [] },
              lastModified: Date.now(),
            };
            workspace.slots.set(mutation.slotId, slot);
          }
          workspace.lastModified = Date.now();
        }
        break;
      }
      
      case 'slotUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          Object.assign(slot, mutation.updates, { lastModified: Date.now() });
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }
      
      case 'slotDelete': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.slots.delete(mutation.slotId);
          workspace.lastModified = Date.now();
        }
        break;
      }
      
      case 'messagesAppend': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          slot.messages.push(...mutation.messages);
          slot.lastModified = Date.now();
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }
      
      case 'pendingUISet': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          slot.pendingUI = mutation.pendingUI;
          slot.lastModified = Date.now();
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }
      
      case 'toolExecutionStart': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          slot.activeTools.push(mutation.execution);
          slot.lastModified = Date.now();
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }
      
      case 'toolExecutionEnd': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          const tool = slot.activeTools.find(t => t.toolCallId === mutation.toolCallId);
          if (tool) {
            tool.status = mutation.error ? 'error' : 'completed';
            tool.result = mutation.result;
            tool.endedAt = Date.now();
          }
          slot.lastModified = Date.now();
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }
      
      case 'paneUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          Object.assign(workspace.panes, mutation.updates);
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'sessionsUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.sessions = mutation.sessions;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'plansUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.plans = mutation.plans;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'jobsUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.jobs = mutation.jobs;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'activePlanUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.activePlan = mutation.activePlan;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'activeJobsUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.activeJobs = mutation.activeJobs;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'workspaceUIUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.rightPaneOpen = mutation.rightPaneOpen;
          workspace.paneTabs = mutation.paneTabs;
          workspace.activePaneTab = mutation.activePaneTab;
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'queuedMessagesUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        const slot = workspace?.slots.get(mutation.slotId);
        if (slot) {
          slot.queuedMessages = mutation.queuedMessages;
          slot.lastModified = Date.now();
          if (workspace) {
            workspace.lastModified = Date.now();
          }
        }
        break;
      }

      case 'directoryEntriesUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.directoryEntries.set(mutation.directoryPath, mutation.entries);
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'directoryWatchError': {
        // Error is logged and emitted, but state doesn't change
        break;
      }

      case 'watchedDirectoryAdd': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.watchedDirectories.add(mutation.directoryPath);
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'watchedDirectoryRemove': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.watchedDirectories.delete(mutation.directoryPath);
          workspace.directoryEntries.delete(mutation.directoryPath);
          workspace.lastModified = Date.now();
        }
        break;
      }

      case 'fileWatcherStatsUpdate': {
        const workspace = this.inMemoryState.workspaces.get(mutation.workspaceId);
        if (workspace) {
          workspace.fileWatcherStats = mutation.stats;
          workspace.lastModified = Date.now();
        }
        break;
      }
    }
  }

  private getWorkspaceIdFromMutation(mutation: StateMutation): string {
    return mutation.workspaceId;
  }

  private createSnapshot(workspaceId: string): void {
    const state = this.getWorkspaceState(workspaceId);
    if (state) {
      const serialized = Buffer.from(JSON.stringify(state));
      this.store.storeSnapshot(workspaceId, this.inMemoryState.version, serialized);
    }
  }

  private cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
    return {
      ...state,
      slots: new Map(state.slots),
      sessions: [...state.sessions],
      plans: [...state.plans],
      jobs: [...state.jobs],
      activeJobs: [...state.activeJobs],
      paneTabs: [...state.paneTabs],
      directoryEntries: new Map(state.directoryEntries),
      watchedDirectories: new Set(state.watchedDirectories),
      fileWatcherStats: state.fileWatcherStats,
    };
  }

  private applyMutationToWorkspace(state: WorkspaceState, mutation: StateMutation): WorkspaceState {
    // Simplified - in reality would need to properly reconstruct
    // For now, just return the mutation-applied state
    this.applyMutation(mutation, 0);
    return this.getWorkspaceState(state.id) || state;
  }
}
