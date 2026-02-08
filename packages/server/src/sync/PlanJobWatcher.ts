/**
 * PlanJobWatcher - Watches .pi/plans/ and .pi/jobs/ directories for changes.
 *
 * Uses fs.watch() recursively on these bounded directories.
 * Debounces changes and emits plansUpdate/jobsUpdate mutations.
 */

import { FSWatcher, watch } from 'fs';
import { existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { EventEmitter } from 'events';
import { discoverPlans, parsePlan } from '../plan-service.js';
import { discoverJobs, parseJob } from '../job-service.js';
import type { PlanInfo, JobInfo } from '@pi-deck/shared';

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
  lastPlanUpdate: number;
  lastJobUpdate: number;
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
      lastPlanUpdate: 0,
      lastJobUpdate: 0,
    };

    this.watchedWorkspaces.set(workspaceId, watched);

    // Watch plan directories
    this.watchPlanDirectories(watched);

    // Watch job directories
    this.watchJobDirectories(watched);

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

    const plans = discoverPlans(watched.workspacePath);
    const jobs = discoverJobs(watched.workspacePath);

    this.emit('plansChanged', { workspaceId, plans });
    this.emit('jobsChanged', { workspaceId, jobs });

    return { plans, jobs };
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
