/**
 * PlanJobWatcher - Watches .pi/plans/ and .pi/jobs/ directories for changes.
 *
 * Uses fs.watch() recursively on these bounded directories.
 * Debounces changes and emits plansUpdate/jobsUpdate mutations.
 */

import { FSWatcher, watch } from 'fs';
import { existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import { discoverPlans, parsePlan } from '../plan-service.js';
import { discoverJobs, parseJob } from '../job-service.js';
import type { PlanInfo, JobInfo, SessionInfo } from '@pi-deck/shared';
import { SessionManager } from '@mariozechner/pi-coding-agent';

export interface PlanJobWatcherEvent {
  type: 'plansChanged' | 'jobsChanged';
  workspaceId: string;
  plans?: PlanInfo[];
  jobs?: JobInfo[];
}

interface WatchedWorkspace {
  workspaceId: string;
  workspacePath: string;
  planWatchers: Map<string, FSWatcher>; // dirPath -> watcher
  jobWatchers: Map<string, FSWatcher>; // dirPath -> watcher
  sessionWatcher: FSWatcher | null; // Single watcher for sessions dir
  jobConfigWatcher: FSWatcher | null; // Watcher for .pi/jobs.json
  lastPlanUpdate: number;
  lastJobUpdate: number;
  lastSessionUpdate: number;
  // Track paths we're not yet watching so we can retry
  pendingSessionsDir: string | null;
  pendingJobConfigPath: string | null;
}

export interface PlanJobWatcherOptions {
  debounceMs?: number;
}

const DEFAULT_OPTIONS: Required<PlanJobWatcherOptions> = {
  debounceMs: 500, // Longer debounce for agent writes
};

export class PlanJobWatcher extends EventEmitter {
  private watchedWorkspaces = new Map<string, WatchedWorkspace>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private options: Required<PlanJobWatcherOptions>;

  constructor(options: PlanJobWatcherOptions = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start watching plan/job directories for a workspace.
   */
  watchWorkspace(workspaceId: string, workspacePath: string): void {
    if (this.watchedWorkspaces.has(workspaceId)) {
      return; // Already watching
    }

    const watched: WatchedWorkspace = {
      workspaceId,
      workspacePath,
      planWatchers: new Map(),
      jobWatchers: new Map(),
      sessionWatcher: null,
      jobConfigWatcher: null,
      lastPlanUpdate: 0,
      lastJobUpdate: 0,
      lastSessionUpdate: 0,
      pendingSessionsDir: null,
      pendingJobConfigPath: null,
    };

    this.watchedWorkspaces.set(workspaceId, watched);

    // Watch plan directories
    this.watchPlanDirectories(watched);

    // Watch job directories
    this.watchJobDirectories(watched);

    // Watch sessions directory
    this.watchSessionsDirectory(watched);

    // Watch job config file
    this.watchJobConfig(watched);

    console.log(`[PlanJobWatcher] Started watching workspace ${workspaceId}`);
  }

  /**
   * Stop watching plan/job directories for a workspace.
   */
  unwatchWorkspace(workspaceId: string): void {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return;

    // Close all plan watchers
    for (const [path, watcher] of watched.planWatchers) {
      watcher.close();
      console.log(`[PlanJobWatcher] Stopped watching plans: ${path}`);
    }

    // Close all job watchers
    for (const [path, watcher] of watched.jobWatchers) {
      watcher.close();
      console.log(`[PlanJobWatcher] Stopped watching jobs: ${path}`);
    }

    // Close session watcher
    if (watched.sessionWatcher) {
      watched.sessionWatcher.close();
      console.log(`[PlanJobWatcher] Stopped watching sessions for ${workspaceId}`);
    }

    // Close job config watcher
    if (watched.jobConfigWatcher) {
      watched.jobConfigWatcher.close();
      console.log(`[PlanJobWatcher] Stopped watching job config for ${workspaceId}`);
    }

    // Clear debounce timers
    for (const key of this.debounceTimers.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        const timer = this.debounceTimers.get(key);
        if (timer) clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    this.watchedWorkspaces.delete(workspaceId);
    console.log(`[PlanJobWatcher] Stopped watching workspace ${workspaceId}`);
  }

  /**
   * Force a rescan and emit updates for a workspace.
   */
  rescan(workspaceId: string): { plans: PlanInfo[]; jobs: JobInfo[] } | null {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return null;

    // Retry any pending watches first
    this.retryPendingWatches(watched);

    const plans = discoverPlans(watched.workspacePath);
    const jobs = discoverJobs(watched.workspacePath);

    this.emit('plansChanged', { workspaceId, plans });
    this.emit('jobsChanged', { workspaceId, jobs });

    return { plans, jobs };
  }

  /**
   * Retry watching paths that didn't exist when we first tried.
   * Called periodically or when we know something might have been created.
   */
  retryPendingWatches(watched: WatchedWorkspace): void {
    // Retry sessions directory
    if (watched.pendingSessionsDir && !watched.sessionWatcher) {
      if (existsSync(watched.pendingSessionsDir)) {
        console.log(`[PlanJobWatcher] Retrying sessions watch for created directory: ${watched.pendingSessionsDir}`);
        this.watchSessionsDirectory(watched);
      }
    }

    // Retry job config file
    if (watched.pendingJobConfigPath && !watched.jobConfigWatcher) {
      if (existsSync(watched.pendingJobConfigPath)) {
        console.log(`[PlanJobWatcher] Retrying job config watch for created file: ${watched.pendingJobConfigPath}`);
        this.watchJobConfig(watched);
      }
    }
  }

  /**
   * Stop all watchers.
   */
  unwatchAll(): void {
    for (const workspaceId of this.watchedWorkspaces.keys()) {
      this.unwatchWorkspace(workspaceId);
    }
  }

  private watchPlanDirectories(watched: WatchedWorkspace): void {
    // Import plan-service functions dynamically
    import('../plan-service.js').then(({ getPlanDirectories }) => {
      const dirs = getPlanDirectories(watched.workspacePath);

      for (const dir of dirs) {
        if (!existsSync(dir)) {
          // Directory doesn't exist yet - we'll watch it when it's created
          continue;
        }

        try {
          const watcher = this.createPlanWatcher(watched.workspaceId, dir);
          watched.planWatchers.set(dir, watcher);
          console.log(`[PlanJobWatcher] Watching plans: ${dir}`);
        } catch (error) {
          console.error(`[PlanJobWatcher] Failed to watch plans dir ${dir}:`, error);
        }
      }
    });
  }

  private watchJobDirectories(watched: WatchedWorkspace): void {
    // Import job-service functions dynamically
    import('../job-service.js').then(({ getJobDirectories }) => {
      const dirs = getJobDirectories(watched.workspacePath);

      for (const dir of dirs) {
        if (!existsSync(dir)) {
          continue;
        }

        try {
          const watcher = this.createJobWatcher(watched.workspaceId, dir);
          watched.jobWatchers.set(dir, watcher);
          console.log(`[PlanJobWatcher] Watching jobs: ${dir}`);
        } catch (error) {
          console.error(`[PlanJobWatcher] Failed to watch jobs dir ${dir}:`, error);
        }
      }
    });
  }

  private watchSessionsDirectory(watched: WatchedWorkspace): void {
    const sessionsDir = this.getSessionsDir(watched.workspacePath);
    
    if (!existsSync(sessionsDir)) {
      // Sessions directory doesn't exist yet - track it for retry
      watched.pendingSessionsDir = sessionsDir;
      console.log(`[PlanJobWatcher] Sessions directory doesn't exist yet, will retry: ${sessionsDir}`);
      return;
    }

    watched.pendingSessionsDir = null;

    try {
      const watcher = this.createSessionWatcher(watched.workspaceId, sessionsDir);
      watched.sessionWatcher = watcher;
      console.log(`[PlanJobWatcher] Watching sessions: ${sessionsDir}`);
    } catch (error) {
      console.error(`[PlanJobWatcher] Failed to watch sessions dir ${sessionsDir}:`, error);
    }
  }

  private watchJobConfig(watched: WatchedWorkspace): void {
    const configPath = join(watched.workspacePath, '.pi', 'jobs.json');

    if (!existsSync(configPath)) {
      // Config file doesn't exist yet - track it for retry
      watched.pendingJobConfigPath = configPath;
      console.log(`[PlanJobWatcher] Job config doesn't exist yet, will retry: ${configPath}`);
      return;
    }

    watched.pendingJobConfigPath = null;

    try {
      const watcher = this.createJobConfigWatcher(watched.workspaceId, configPath);
      watched.jobConfigWatcher = watcher;
      console.log(`[PlanJobWatcher] Watching job config: ${configPath}`);
    } catch (error) {
      console.error(`[PlanJobWatcher] Failed to watch job config ${configPath}:`, error);
    }
  }

  private getSessionsDir(workspacePath: string): string {
    // Sessions are stored in ~/.pi/agent/sessions/--<workspace-path>--/
    const safePath = `--${workspacePath.replace(/^[\\/]/, '').replace(/[\\/:]/g, '-')}--`;
    return join(homedir(), '.pi', 'agent', 'sessions', safePath);
  }

  private createSessionWatcher(workspaceId: string, dirPath: string): FSWatcher {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Sessions are stored as .jsonl files
      if (!filename.endsWith('.jsonl')) return;

      this.handleSessionChange(workspaceId, dirPath, filename);
    });

    watcher.on('error', (error) => {
      console.error(`[PlanJobWatcher] Session watcher error for ${dirPath}:`, error);
    });

    return watcher;
  }

  private handleSessionChange(workspaceId: string, _dirPath: string, _filename: string): void {
    const key = `${workspaceId}:sessions`;

    // Debounce session updates
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(key, setTimeout(async () => {
      this.debounceTimers.delete(key);
      await this.emitSessionUpdate(workspaceId);
    }, this.options.debounceMs));
  }

  private async emitSessionUpdate(workspaceId: string): Promise<void> {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return;

    try {
      // Use SessionManager to list sessions for this workspace
      const sessions = await SessionManager.list(watched.workspacePath);
      watched.lastSessionUpdate = Date.now();
      
      // Map to SessionInfo format
      const sessionInfos: SessionInfo[] = sessions.map((s) => ({
        id: s.id,
        path: s.path,
        name: s.name,
        firstMessage: s.firstMessage,
        messageCount: s.messageCount,
        updatedAt: s.modified.getTime(),
        cwd: s.cwd,
      }));
      
      this.emit('sessionsChanged', { workspaceId, sessions: sessionInfos });
      console.log(`[PlanJobWatcher] Sessions updated for ${workspaceId}: ${sessionInfos.length} sessions`);
    } catch (error) {
      console.error(`[PlanJobWatcher] Failed to discover sessions for ${workspaceId}:`, error);
    }
  }

  private createJobConfigWatcher(workspaceId: string, configPath: string): FSWatcher {
    const watcher = watch(configPath, (eventType, filename) => {
      if (!filename) return;
      if (filename !== 'jobs.json') return;

      this.handleJobConfigChange(workspaceId);
    });

    watcher.on('error', (error) => {
      console.error(`[PlanJobWatcher] Job config watcher error for ${configPath}:`, error);
    });

    return watcher;
  }

  private handleJobConfigChange(workspaceId: string): void {
    const key = `${workspaceId}:jobConfig`;

    // Debounce config updates
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.refreshJobWatchers(workspaceId);
    }, this.options.debounceMs));
  }

  private refreshJobWatchers(workspaceId: string): void {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return;

    console.log(`[PlanJobWatcher] Refreshing job watchers for ${workspaceId} due to config change`);

    // Get new set of directories from config
    import('../job-service.js').then(({ getJobDirectories }) => {
      const newDirs = getJobDirectories(watched.workspacePath);
      const currentDirs = Array.from(watched.jobWatchers.keys());

      // Stop watching directories that are no longer in config
      for (const dir of currentDirs) {
        if (!newDirs.includes(dir)) {
          const watcher = watched.jobWatchers.get(dir);
          if (watcher) {
            watcher.close();
            watched.jobWatchers.delete(dir);
            console.log(`[PlanJobWatcher] Stopped watching jobs (removed from config): ${dir}`);
          }
        }
      }

      // Start watching new directories
      for (const dir of newDirs) {
        if (!watched.jobWatchers.has(dir) && existsSync(dir)) {
          try {
            const watcher = this.createJobWatcher(workspaceId, dir);
            watched.jobWatchers.set(dir, watcher);
            console.log(`[PlanJobWatcher] Started watching jobs (added to config): ${dir}`);
          } catch (error) {
            console.error(`[PlanJobWatcher] Failed to watch jobs dir ${dir}:`, error);
          }
        }
      }

      // Re-emit jobs list to reflect any changes
      this.emitJobUpdate(workspaceId);
    });
  }

  private createPlanWatcher(workspaceId: string, dirPath: string): FSWatcher {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.md')) return; // Only care about markdown files

      this.handlePlanChange(workspaceId, dirPath, filename);
    });

    watcher.on('error', (error) => {
      console.error(`[PlanJobWatcher] Plan watcher error for ${dirPath}:`, error);
    });

    return watcher;
  }

  private createJobWatcher(workspaceId: string, dirPath: string): FSWatcher {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.md')) return;

      this.handleJobChange(workspaceId, dirPath, filename);
    });

    watcher.on('error', (error) => {
      console.error(`[PlanJobWatcher] Job watcher error for ${dirPath}:`, error);
    });

    return watcher;
  }

  private handlePlanChange(workspaceId: string, _dirPath: string, filename: string): void {
    const key = `${workspaceId}:plans`;

    // Debounce plan updates
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.emitPlanUpdate(workspaceId);
    }, this.options.debounceMs));
  }

  private handleJobChange(workspaceId: string, _dirPath: string, filename: string): void {
    const key = `${workspaceId}:jobs`;

    // Debounce job updates
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.emitJobUpdate(workspaceId);
    }, this.options.debounceMs));
  }

  private emitPlanUpdate(workspaceId: string): void {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return;

    try {
      const plans = discoverPlans(watched.workspacePath);
      watched.lastPlanUpdate = Date.now();
      this.emit('plansChanged', { workspaceId, plans });
      console.log(`[PlanJobWatcher] Plans updated for ${workspaceId}: ${plans.length} plans`);
    } catch (error) {
      console.error(`[PlanJobWatcher] Failed to discover plans for ${workspaceId}:`, error);
    }
  }

  private emitJobUpdate(workspaceId: string): void {
    const watched = this.watchedWorkspaces.get(workspaceId);
    if (!watched) return;

    try {
      const jobs = discoverJobs(watched.workspacePath);
      watched.lastJobUpdate = Date.now();
      this.emit('jobsChanged', { workspaceId, jobs });
      console.log(`[PlanJobWatcher] Jobs updated for ${workspaceId}: ${jobs.length} jobs`);
    } catch (error) {
      console.error(`[PlanJobWatcher] Failed to discover jobs for ${workspaceId}:`, error);
    }
  }
}
