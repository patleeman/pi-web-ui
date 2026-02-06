import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, watch } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import type { PlanInfo, PlanTask, PlanFrontmatter, PlanStatus, ActivePlanState } from '@pi-web-ui/shared';

// ============================================================================
// Plan Parsing
// ============================================================================

/**
 * Parse YAML-ish frontmatter from a markdown string.
 * Handles the simple key: value format used in plan files.
 */
export function parseFrontmatter(content: string): { frontmatter: PlanFrontmatter; bodyStart: number } {
  const frontmatter: PlanFrontmatter = {};
  
  if (!content.startsWith('---')) {
    return { frontmatter, bodyStart: 0 };
  }
  
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter, bodyStart: 0 };
  }
  
  const fmBlock = content.slice(4, endIndex); // skip opening '---\n'
  const lines = fmBlock.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    
    switch (key) {
      case 'title':
        frontmatter.title = value;
        break;
      case 'status':
        if (['draft', 'active', 'complete'].includes(value)) {
          frontmatter.status = value as PlanStatus;
        }
        break;
      case 'created':
        frontmatter.created = value;
        break;
      case 'completed':
        frontmatter.completed = value;
        break;
      case 'summary':
        frontmatter.summary = value;
        break;
    }
  }
  
  // bodyStart is the character after the closing '---\n'
  const bodyStart = endIndex + 4; // skip '\n---'
  return { frontmatter, bodyStart: Math.min(bodyStart, content.length) };
}

/**
 * Parse tasks (checkboxes) from markdown content.
 */
export function parseTasks(content: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match lines like "- [ ] Task text" or "  - [x] Sub-task"
    const match = line.match(/^(\s*)- \[([ xX])\]\s+(.*)$/);
    if (match) {
      const [, indent, checkChar, text] = match;
      const depth = Math.floor(indent.length / 2);
      tasks.push({
        text,
        done: checkChar.toLowerCase() === 'x',
        depth,
        line: i,
      });
    }
  }
  
  return tasks;
}

/**
 * Parse a plan file into a PlanInfo object.
 */
export function parsePlan(filePath: string, content: string): PlanInfo {
  const { frontmatter } = parseFrontmatter(content);
  const tasks = parseTasks(content);
  const fileName = basename(filePath, '.md');
  
  // Extract title from first H1 heading if not in frontmatter
  let title = frontmatter.title;
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    title = h1Match ? h1Match[1] : fileName;
  }
  
  const doneCount = tasks.filter(t => t.done).length;
  
  return {
    path: filePath,
    fileName,
    title,
    status: frontmatter.status || 'draft',
    frontmatter,
    tasks,
    taskCount: tasks.length,
    doneCount,
  };
}

/**
 * Update a task's checked state in plan content.
 * Returns the updated content string.
 */
export function updateTaskInContent(content: string, lineNumber: number, done: boolean): string {
  const lines = content.split('\n');
  if (lineNumber < 0 || lineNumber >= lines.length) {
    return content;
  }
  
  const line = lines[lineNumber];
  if (done) {
    lines[lineNumber] = line.replace(/- \[ \]/, '- [x]');
  } else {
    lines[lineNumber] = line.replace(/- \[[xX]\]/, '- [ ]');
  }
  
  return lines.join('\n');
}

/**
 * Update the frontmatter status in plan content.
 */
export function updateFrontmatterStatus(
  content: string,
  status: PlanStatus,
  extra?: { completed?: string; summary?: string }
): string {
  const { frontmatter } = parseFrontmatter(content);
  
  if (!content.startsWith('---')) {
    // No frontmatter — prepend it
    const lines = ['---', `status: ${status}`];
    if (extra?.completed) lines.push(`completed: ${extra.completed}`);
    if (extra?.summary) lines.push(`summary: ${extra.summary}`);
    lines.push('---', '');
    return lines.join('\n') + content;
  }
  
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return content;
  
  let fmBlock = content.slice(4, endIndex);
  
  // Update or add status
  if (fmBlock.match(/^status\s*:/m)) {
    fmBlock = fmBlock.replace(/^status\s*:.*$/m, `status: ${status}`);
  } else {
    fmBlock += `\nstatus: ${status}`;
  }
  
  // Add completed datetime
  if (extra?.completed) {
    if (fmBlock.match(/^completed\s*:/m)) {
      fmBlock = fmBlock.replace(/^completed\s*:.*$/m, `completed: ${extra.completed}`);
    } else {
      fmBlock += `\ncompleted: ${extra.completed}`;
    }
  }
  
  // Add summary
  if (extra?.summary) {
    if (fmBlock.match(/^summary\s*:/m)) {
      fmBlock = fmBlock.replace(/^summary\s*:.*$/m, `summary: ${extra.summary}`);
    } else {
      fmBlock += `\nsummary: ${extra.summary}`;
    }
  }
  
  return `---\n${fmBlock}\n---${content.slice(endIndex + 4)}`;
}

// ============================================================================
// Plan Discovery
// ============================================================================

/**
 * Get the plan directories for a workspace.
 * Returns both ~/plans/<workspace-name>/ and <workspace>/.pi/plans/
 */
export function getPlanDirectories(workspacePath: string): string[] {
  const workspaceName = basename(workspacePath);
  const dirs: string[] = [];
  
  // Global: ~/plans/<workspace-name>/
  const globalDir = join(homedir(), 'plans', workspaceName);
  dirs.push(globalDir);
  
  // Local: <workspace>/.pi/plans/
  const localDir = join(workspacePath, '.pi', 'plans');
  dirs.push(localDir);
  
  return dirs;
}

/**
 * Discover all plan files for a workspace.
 */
export function discoverPlans(workspacePath: string): PlanInfo[] {
  const dirs = getPlanDirectories(workspacePath);
  const plans: PlanInfo[] = [];
  
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = resolve(join(dir, file));
        try {
          const content = readFileSync(filePath, 'utf-8');
          plans.push(parsePlan(filePath, content));
        } catch (err) {
          console.warn(`[PlanService] Failed to parse plan file: ${filePath}`, err);
        }
      }
    } catch (err) {
      console.warn(`[PlanService] Failed to read plan directory: ${dir}`, err);
    }
  }
  
  // Sort: active first, then by filename descending (newest first)
  plans.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return b.fileName.localeCompare(a.fileName);
  });
  
  return plans;
}

/**
 * Read a plan file and parse it.
 */
export function readPlan(planPath: string): { content: string; plan: PlanInfo } {
  const content = readFileSync(planPath, 'utf-8');
  const plan = parsePlan(planPath, content);
  return { content, plan };
}

/**
 * Write plan content to a file.
 */
export function writePlan(planPath: string, content: string): PlanInfo {
  writeFileSync(planPath, content, 'utf-8');
  return parsePlan(planPath, content);
}

// ============================================================================
// Active Plan Management
// ============================================================================

/**
 * Build the system prompt prefix for an active plan.
 */
export function buildActivePlanPrompt(planPath: string): string {
  return `<active_plan>
You have an active plan at: ${planPath}
Read this plan and work through the tasks. As you complete each task, update the plan file by checking off the corresponding checkbox (change \`- [ ]\` to \`- [x]\`).
When all tasks are complete, let the user know the plan is finished.
</active_plan>`;
}

/**
 * Get active plan state from a plan file.
 */
export function getActivePlanState(planPath: string): ActivePlanState | null {
  if (!existsSync(planPath)) return null;
  
  try {
    const content = readFileSync(planPath, 'utf-8');
    const plan = parsePlan(planPath, content);
    return {
      planPath: plan.path,
      title: plan.title,
      tasks: plan.tasks,
      taskCount: plan.taskCount,
      doneCount: plan.doneCount,
    };
  } catch {
    return null;
  }
}
