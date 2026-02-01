import { execSync } from 'child_process';

export interface GitInfo {
  branch: string | null;
  changedFiles: number;
}

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
