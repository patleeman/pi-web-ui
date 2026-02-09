import { readdirSync, statSync, existsSync } from 'fs';
import { basename, join } from 'path';
import type { DirectoryEntry } from '@pi-deck/shared';
import { canonicalizePath } from './config.js';
import { homedir } from 'os';

export class DirectoryBrowser {
  /**
   * List the allowed root directories
   */
  listRoots(): DirectoryEntry[] {
    return [{
      name: 'Home',
      path: homedir(),
      hasPiSessions: this.checkForPiSessions(homedir()),
    }];
  }

  /**
   * Browse a directory and return its subdirectories
   */
  browse(path: string): DirectoryEntry[] {
    const normalizedPath = canonicalizePath(path);

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
    return [homedir()];
  }
}
