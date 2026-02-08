/**
 * ScopedFileWatcher - Watches only user-expanded directories in the file tree.
 *
 * Uses non-recursive fs.watch() to monitor specific directories.
 * Emits CRDT mutations through SyncState when files change.
 */

import { FSWatcher, watch } from 'fs';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { EventEmitter } from 'events';
import type { DirectoryEntry } from '@pi-deck/shared';

export interface FileWatcherEvent {
  type: 'add' | 'remove' | 'change' | 'deleted';
  path: string;
  entry?: DirectoryEntry;
}

interface WatchedDirectory {
  path: string;
  watcher: FSWatcher;
  lastAccessed: number; // For LRU eviction
  entries: Map<string, DirectoryEntry>; // Current known entries
}

export interface FileWatcherOptions {
  debounceMs?: number;
  maxWatchedDirs?: number;
}

const DEFAULT_OPTIONS: Required<FileWatcherOptions> = {
  debounceMs: 100,
  maxWatchedDirs: 50,
};

export class ScopedFileWatcher extends EventEmitter {
  private watchedDirs = new Map<string, WatchedDirectory>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private options: Required<FileWatcherOptions>;

  constructor(options: FileWatcherOptions = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start watching a directory. Returns the current entries.
   * If already watching, updates lastAccessed time and returns current entries.
   */
  watchDirectory(dirPath: string): DirectoryEntry[] | null {
    // Normalize path
    const normalizedPath = dirPath.replace(/\\/g, '/');

    // Check if already watching
    const existing = this.watchedDirs.get(normalizedPath);
    if (existing) {
      existing.lastAccessed = Date.now();
      return Array.from(existing.entries.values());
    }

    // Check if directory exists
    if (!existsSync(normalizedPath)) {
      return null;
    }

    // Evict oldest if at limit
    if (this.watchedDirs.size >= this.options.maxWatchedDirs) {
      this.evictOldest();
    }

    try {
      // Get initial entries
      const entries = this.scanDirectory(normalizedPath);
      const entriesMap = new Map<string, DirectoryEntry>();
      for (const entry of entries) {
        entriesMap.set(entry.name, entry);
      }

      // Start watcher (non-recursive)
      const watcher = watch(normalizedPath, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        this.handleFsEvent(normalizedPath, filename, eventType);
      });

      // Handle watcher errors
      watcher.on('error', (error) => {
        console.error(`[FileWatcher] Error watching ${normalizedPath}:`, error);
        this.emit('error', { path: normalizedPath, error });
        this.unwatchDirectory(normalizedPath);
      });

      // Check if directory still exists after a short delay (catches rapid delete after creation)
      setTimeout(() => {
        if (!existsSync(normalizedPath)) {
          console.log(`[FileWatcher] Directory deleted shortly after watching: ${normalizedPath}`);
          this.emit('deleted', { path: normalizedPath });
          this.unwatchDirectory(normalizedPath);
        }
      }, 100);

      this.watchedDirs.set(normalizedPath, {
        path: normalizedPath,
        watcher,
        lastAccessed: Date.now(),
        entries: entriesMap,
      });

      console.log(`[FileWatcher] Started watching ${normalizedPath} (${entries.length} entries)`);
      this.emit('watchStarted', { path: normalizedPath, entries });

      return entries;
    } catch (error) {
      console.error(`[FileWatcher] Failed to watch ${normalizedPath}:`, error);
      this.emit('error', { path: normalizedPath, error });
      return null;
    }
  }

  /**
   * Stop watching a directory.
   */
  unwatchDirectory(dirPath: string): void {
    const normalizedPath = dirPath.replace(/\\/g, '/');
    const watched = this.watchedDirs.get(normalizedPath);
    if (!watched) return;

    watched.watcher.close();
    this.watchedDirs.delete(normalizedPath);
    console.log(`[FileWatcher] Stopped watching ${normalizedPath}`);
    this.emit('watchStopped', { path: normalizedPath });
  }

  /**
   * Stop all watchers.
   */
  unwatchAll(): void {
    for (const [path, watched] of this.watchedDirs) {
      watched.watcher.close();
      console.log(`[FileWatcher] Stopped watching ${path}`);
    }
    this.watchedDirs.clear();
    this.emit('watchStopped', { path: '*' });
  }

  /**
   * Get current entries for a watched directory.
   */
  getEntries(dirPath: string): DirectoryEntry[] | null {
    const normalizedPath = dirPath.replace(/\\/g, '/');
    const watched = this.watchedDirs.get(normalizedPath);
    if (!watched) return null;
    watched.lastAccessed = Date.now();
    return Array.from(watched.entries.values());
  }

  /**
   * Check if a directory is being watched.
   */
  isWatching(dirPath: string): boolean {
    return this.watchedDirs.has(dirPath.replace(/\\/g, '/'));
  }

  /**
   * Get list of all watched directories.
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchedDirs.keys());
  }

  /**
   * Get watcher statistics.
   */
  getStats(): { watchedCount: number; maxWatched: number; isAtLimit: boolean } {
    return {
      watchedCount: this.watchedDirs.size,
      maxWatched: this.options.maxWatchedDirs,
      isAtLimit: this.watchedDirs.size >= this.options.maxWatchedDirs,
    };
  }

  /**
   * Force a rescan of a watched directory and emit updates.
   */
  rescan(dirPath: string): DirectoryEntry[] | null {
    const normalizedPath = dirPath.replace(/\\/g, '/');
    const watched = this.watchedDirs.get(normalizedPath);
    if (!watched) return null;

    const newEntries = this.scanDirectory(normalizedPath);
    const newEntriesMap = new Map<string, DirectoryEntry>();
    for (const entry of newEntries) {
      newEntriesMap.set(entry.name, entry);
    }

    // Compare and emit changes
    this.detectChanges(watched, newEntriesMap);

    watched.entries = newEntriesMap;
    watched.lastAccessed = Date.now();
    return newEntries;
  }

  private scanDirectory(dirPath: string): DirectoryEntry[] {
    const entries: DirectoryEntry[] = [];

    try {
      const items = readdirSync(dirPath);

      for (const item of items) {
        // Skip hidden files/directories
        if (item.startsWith('.')) continue;

        const itemPath = join(dirPath, item);
        try {
          const stat = statSync(itemPath);
          if (stat.isDirectory()) {
            entries.push({
              name: item,
              path: itemPath,
              hasPiSessions: this.checkForPiSessions(itemPath),
            });
          }
        } catch {
          // Skip items we can't stat
        }
      }
    } catch {
      // Directory may have been deleted
    }

    // Sort alphabetically, directories first
    entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return entries;
  }

  private checkForPiSessions(dirPath: string): boolean {
    try {
      const piSessionsPath = join(dirPath, '.pi', 'sessions');
      return existsSync(piSessionsPath);
    } catch {
      return false;
    }
  }

  private handleFsEvent(dirPath: string, filename: string, eventType: string): void {
    // Debounce events for this directory
    const key = dirPath;
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.processFsEvent(dirPath, filename, eventType);
    }, this.options.debounceMs));
  }

  private processFsEvent(dirPath: string, filename: string, _eventType: string): void {
    const watched = this.watchedDirs.get(dirPath);
    if (!watched) return;

    // Skip hidden files
    if (filename.startsWith('.')) return;

    const fullPath = join(dirPath, filename);

    // Check if file/directory exists now
    let exists = false;
    let isDirectory = false;
    let hasPiSessions = false;

    try {
      const stat = statSync(fullPath);
      exists = true;
      isDirectory = stat.isDirectory();
      if (isDirectory) {
        hasPiSessions = this.checkForPiSessions(fullPath);
      }
    } catch {
      // File doesn't exist (was deleted)
    }

    const existingEntry = watched.entries.get(filename);

    if (exists) {
      const entry: DirectoryEntry = {
        name: filename,
        path: fullPath,
        hasPiSessions,
      };

      if (!existingEntry) {
        // New file/directory added
        watched.entries.set(filename, entry);
        this.emit('change', {
          type: 'add',
          path: fullPath,
          entry,
        } as FileWatcherEvent);
      } else {
        // Existing entry changed (metadata like hasPiSessions might have changed)
        watched.entries.set(filename, entry);
        this.emit('change', {
          type: 'change',
          path: fullPath,
          entry,
        } as FileWatcherEvent);
      }
    } else if (existingEntry) {
      // File/directory was removed
      watched.entries.delete(filename);
      this.emit('change', {
        type: 'remove',
        path: fullPath,
        entry: existingEntry,
      } as FileWatcherEvent);
    }

    watched.lastAccessed = Date.now();
  }

  private detectChanges(watched: WatchedDirectory, newEntries: Map<string, DirectoryEntry>): void {
    const oldEntries = watched.entries;

    // Find added entries
    for (const [name, entry] of newEntries) {
      if (!oldEntries.has(name)) {
        this.emit('change', {
          type: 'add',
          path: entry.path,
          entry,
        } as FileWatcherEvent);
      }
    }

    // Find removed entries
    for (const [name, entry] of oldEntries) {
      if (!newEntries.has(name)) {
        this.emit('change', {
          type: 'remove',
          path: entry.path,
          entry,
        } as FileWatcherEvent);
      }
    }
  }

  private evictOldest(): void {
    let oldest: WatchedDirectory | null = null;
    let oldestPath = '';

    for (const [path, watched] of this.watchedDirs) {
      if (!oldest || watched.lastAccessed < oldest.lastAccessed) {
        oldest = watched;
        oldestPath = path;
      }
    }

    if (oldest && oldestPath) {
      console.log(`[FileWatcher] LRU evicting ${oldestPath}`);
      this.unwatchDirectory(oldestPath);
      this.emit('evicted', { path: oldestPath });
    }
  }
}
