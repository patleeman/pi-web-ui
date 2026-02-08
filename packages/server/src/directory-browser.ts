import { readdirSync, statSync, existsSync } from 'fs';
import { basename, join } from 'path';
import type { DirectoryEntry } from '@pi-deck/shared';
import { canonicalizePath, isPathAllowed } from './config.js';

export class DirectoryBrowser {
  constructor(private allowedDirectories: string[]) {}

  /**
   * List the allowed root directories
   */
  listRoots(): DirectoryEntry[] {
    return this.allowedDirectories.map((dir) => ({
      name: basename(dir) || dir,
      path: dir,
      hasPiSessions: this.checkForPiSessions(dir),
    }));
  }

  /**
   * Browse a directory and return its subdirectories
   */
  browse(path: string): DirectoryEntry[] {
    const normalizedPath = canonicalizePath(path);

    // Security check: ensure path is within allowed directories
    if (!isPathAllowed(normalizedPath, this.allowedDirectories)) {
      throw new Error(`Access denied: ${path} is not within allowed directories`);
    }

    // Check if path exists and is a directory
    if (!existsSync(normalizedPath)) {
      throw new Error(`Directory not found: ${path}`);
    }

    const stat = statSync(normalizedPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${path}`);
    }

    // Read directory contents
    const entries: DirectoryEntry[] = [];

    try {
      const items = readdirSync(normalizedPath);

      for (const item of items) {
        // Skip hidden files/directories
        if (item.startsWith('.')) {
          continue;
        }

        const itemPath = join(normalizedPath, item);

        try {
          const itemStat = statSync(itemPath);
          if (itemStat.isDirectory()) {
            entries.push({
              name: item,
              path: itemPath,
              hasPiSessions: this.checkForPiSessions(itemPath),
            });
          }
        } catch {
          // Skip items we can't stat (permission issues, etc.)
        }
      }
    } catch (error) {
      throw new Error(`Cannot read directory: ${path}`);
    }

    // Sort alphabetically, case-insensitive
    entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return entries;
  }

  /**
   * Check if a directory has existing Pi sessions
   */
  private checkForPiSessions(dirPath: string): boolean {
    const piSessionsPath = join(dirPath, '.pi', 'sessions');
    return existsSync(piSessionsPath);
  }

  /**
   * Get the allowed directories
   */
  getAllowedDirectories(): string[] {
    return [...this.allowedDirectories];
  }
}
