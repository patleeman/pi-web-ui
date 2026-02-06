import { execSync } from 'child_process';

export interface GitInfo {
  branch: string | null;
  changedFiles: number;
}

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export function getGitInfo(cwd: string): GitInfo {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Get number of changed files (staged + unstaged + untracked)
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const changedFiles = status.split('\n').filter((line) => line.trim()).length;

    return { branch, changedFiles };
  } catch {
    // Not a git repo or git not available
    return { branch: null, changedFiles: 0 };
  }
}

/**
 * Get a map of changed files with their git status.
 * Keys are relative paths from the repo root.
 */
export function getGitChangedFiles(cwd: string): Map<string, GitFileStatus> {
  try {
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const changes = new Map<string, GitFileStatus>();
    
    for (const line of status.split('\n')) {
      if (!line.trim()) continue;
      
      const statusCode = line.slice(0, 2);
      let filePath = line.slice(3);
      
      // Handle renamed files: "R  old -> new"
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ')[1];
      }
      
      // Parse git status codes (XY format where X=staged, Y=unstaged)
      if (statusCode.includes('?')) {
        changes.set(filePath, 'untracked');
      } else if (statusCode.includes('A')) {
        changes.set(filePath, 'added');
      } else if (statusCode.includes('D')) {
        changes.set(filePath, 'deleted');
      } else if (statusCode.includes('R')) {
        changes.set(filePath, 'renamed');
      } else if (statusCode.includes('U') || statusCode === 'AA' || statusCode === 'DD') {
        changes.set(filePath, 'conflicted');
      } else if (statusCode.includes('M') || statusCode.trim()) {
        changes.set(filePath, 'modified');
      }
    }
    
    return changes;
  } catch {
    // Not a git repo or git not available
    return new Map();
  }
}

/**
 * Get git status for directories (has changes inside).
 * Returns a set of directory paths that contain changed files.
 */
export function getGitChangedDirectories(cwd: string): Set<string> {
  const changedFiles = getGitChangedFiles(cwd);
  const changedDirs = new Set<string>();
  
  for (const filePath of changedFiles.keys()) {
    // Add all parent directories
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      changedDirs.add(parts.slice(0, i).join('/'));
    }
  }
  
  return changedDirs;
}

/**
 * Get the git diff for a specific file.
 * Returns unified diff output.
 */
export function getFileDiff(cwd: string, filePath: string): string {
  try {
    // First check if the file is untracked
    const status = execSync(`git status --porcelain -- "${filePath}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (status.startsWith('??')) {
      // Untracked file - show the entire file as added
      try {
        const content = execSync(`cat "${filePath}"`, {
          cwd,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 1024 * 1024, // 1MB
        });
        // Format as a diff with all lines added
        const lines = content.split('\n');
        const header = `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lines.length} @@
`;
        return header + lines.map(line => `+${line}`).join('\n');
      } catch {
        return `Unable to read untracked file: ${filePath}`;
      }
    }

    // For tracked files, get the diff (staged + unstaged)
    // First try to get combined diff
    let diff = execSync(`git diff HEAD -- "${filePath}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024, // 1MB
    });

    // If no diff from HEAD, try unstaged changes
    if (!diff.trim()) {
      diff = execSync(`git diff -- "${filePath}"`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    }

    // If still no diff, try staged changes
    if (!diff.trim()) {
      diff = execSync(`git diff --cached -- "${filePath}"`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    }

    return diff || 'No changes detected';
  } catch (error) {
    return `Error getting diff: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
