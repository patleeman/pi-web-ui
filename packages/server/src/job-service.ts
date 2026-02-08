import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import type { JobPhase, JobFrontmatter, JobInfo, JobTask, PlanStatus } from '@pi-deck/shared';

// Re-export parseTasks from plan-service (same format)
export { parseTasks } from './plan-service.js';
import { parseTasks } from './plan-service.js';

// ============================================================================
// Phase Helpers
// ============================================================================

const PHASE_ORDER: JobPhase[] = ['backlog', 'planning', 'ready', 'executing', 'review', 'complete'];

/** Map legacy plan `status` to job `phase` */
function statusToPhase(status: PlanStatus): JobPhase {
  switch (status) {
    case 'draft': return 'backlog';
    case 'active': return 'executing';
    case 'complete': return 'complete';
    default: return 'backlog';
  }
}

export function getNextPhase(current: JobPhase): JobPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export function getPreviousPhase(current: JobPhase): JobPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return PHASE_ORDER[idx - 1];
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

function cleanYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

function parseInlineYamlStringArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(cleanYamlScalar)
      .filter(Boolean);
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map(cleanYamlScalar).filter(Boolean);
  }

  return [cleanYamlScalar(trimmed)].filter(Boolean);
}

function parseYamlListItems(lines: string[], startIndex: number): { items: string[]; endIndex: number } {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index].match(/^\s*-\s+(.+)\s*$/);
    if (!itemMatch) break;

    items.push(cleanYamlScalar(itemMatch[1]));
    index++;
  }

  return { items, endIndex: index - 1 };
}

export function parseJobFrontmatter(content: string): { frontmatter: JobFrontmatter; bodyStart: number } {
  const frontmatter: JobFrontmatter = {};

  if (!content.startsWith('---')) {
    return { frontmatter, bodyStart: 0 };
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter, bodyStart: 0 };
  }

  const fmBlock = content.slice(4, endIndex); // skip opening '---\n'
  const lines = fmBlock.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();

    switch (key) {
      case 'title':
        frontmatter.title = value;
        break;
      case 'phase':
        if (PHASE_ORDER.includes(value as JobPhase)) {
          frontmatter.phase = value as JobPhase;
        }
        break;
      case 'tags': {
        if (value.length > 0) {
          frontmatter.tags = normalizeTags(parseInlineYamlStringArray(value));
          break;
        }

        const { items, endIndex: consumedEnd } = parseYamlListItems(lines, i + 1);
        frontmatter.tags = normalizeTags(items);
        i = Math.max(i, consumedEnd);
        break;
      }
      case 'status':
        // Legacy plan compatibility
        if (['draft', 'active', 'complete'].includes(value)) {
          frontmatter.status = value as PlanStatus;
        }
        break;
      case 'created':
        frontmatter.created = value;
        break;
      case 'updated':
        frontmatter.updated = value;
        break;
      case 'completedAt':
        frontmatter.completedAt = value;
        break;
      case 'completed':
        // Legacy plan field → map to completedAt
        frontmatter.completedAt = value;
        break;
      case 'planningSessionId':
        frontmatter.planningSessionId = value;
        break;
      case 'executionSessionId':
        frontmatter.executionSessionId = value;
        break;
      case 'reviewSessionId':
        frontmatter.reviewSessionId = value;
        break;
    }
  }

  const bodyStart = endIndex + 4; // skip '\n---'
  return { frontmatter, bodyStart: Math.min(bodyStart, content.length) };
}

// ============================================================================
// Job Parsing
// ============================================================================

export function parseJob(filePath: string, content: string): JobInfo {
  const { frontmatter } = parseJobFrontmatter(content);
  const tasks = parseTasks(content);
  const fileName = basename(filePath, '.md');

  // Determine title: frontmatter > first H1 > filename
  let title = frontmatter.title;
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    title = h1Match ? h1Match[1] : fileName;
  }

  // Determine phase: explicit phase > mapped status > backlog
  let phase: JobPhase = 'backlog';
  if (frontmatter.phase) {
    phase = frontmatter.phase;
  } else if (frontmatter.status) {
    phase = statusToPhase(frontmatter.status);
  }

  const tags = normalizeTags(frontmatter.tags);
  const doneCount = tasks.filter(t => t.done).length;
  const updatedAt = frontmatter.updated || frontmatter.created || new Date().toISOString();

  return {
    path: filePath,
    fileName,
    title,
    phase,
    tags,
    frontmatter: {
      ...frontmatter,
      tags,
    },
    tasks,
    taskCount: tasks.length,
    doneCount,
    updatedAt,
  };
}

// ============================================================================
// Frontmatter Update
// ============================================================================

function formatYamlInlineValue(value: string): string {
  // Keep simple scalars unquoted for readability
  if (/^[a-zA-Z0-9._\/-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function formatFrontmatterValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map(formatYamlInlineValue).join(', ')}]`;
  }

  return value;
}

/**
 * Update or set fields in the YAML frontmatter of a job file.
 * Creates frontmatter if it doesn't exist.
 */
export function updateJobFrontmatter(
  content: string,
  updates: Record<string, string | string[] | undefined>,
): string {
  if (!content.startsWith('---')) {
    // No frontmatter — prepend it
    const lines = ['---'];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        lines.push(`${key}: ${formatFrontmatterValue(value)}`);
      }
    }
    lines.push('---', '');
    return lines.join('\n') + content;
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return content;

  let fmBlock = content.slice(4, endIndex);

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    const serializedValue = formatFrontmatterValue(value);
    const regex = Array.isArray(value)
      ? new RegExp(`^${key}\\s*:.*(?:\\n\\s*-\\s+.*)*$`, 'm')
      : new RegExp(`^${key}\\s*:.*$`, 'm');

    if (fmBlock.match(regex)) {
      fmBlock = fmBlock.replace(regex, `${key}: ${serializedValue}`);
    } else {
      fmBlock += `\n${key}: ${serializedValue}`;
    }
  }

  return `---\n${fmBlock}\n---${content.slice(endIndex + 4)}`;
}

// ============================================================================
// Task Update (reuse from plan-service)
// ============================================================================

export function updateTaskInContent(content: string, lineNumber: number, done: boolean): string {
  const lines = content.split('\n');
  if (lineNumber < 0 || lineNumber >= lines.length) return content;

  const line = lines[lineNumber];
  if (done) {
    lines[lineNumber] = line.replace(/- \[ \]/, '- [x]');
  } else {
    lines[lineNumber] = line.replace(/- \[[xX]\]/, '- [ ]');
  }

  return lines.join('\n');
}

// ============================================================================
// Job Discovery
// ============================================================================

export function getJobDirectories(workspacePath: string): string[] {
  const workspaceName = basename(workspacePath);
  const dirs: string[] = [];

  // Primary: ~/jobs/<workspace-name>/
  dirs.push(join(homedir(), 'jobs', workspaceName));

  // Local: <workspace>/.pi/jobs/
  dirs.push(join(workspacePath, '.pi', 'jobs'));

  // Legacy: ~/plans/<workspace-name>/
  dirs.push(join(homedir(), 'plans', workspaceName));

  return dirs;
}

export function discoverJobs(workspacePath: string): JobInfo[] {
  const dirs = getJobDirectories(workspacePath);
  const jobs: JobInfo[] = [];
  const seenPaths = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = resolve(join(dir, file));
        if (seenPaths.has(filePath)) continue;
        seenPaths.add(filePath);

        try {
          const content = readFileSync(filePath, 'utf-8');
          jobs.push(parseJob(filePath, content));
        } catch (err) {
          console.warn(`[JobService] Failed to parse job file: ${filePath}`, err);
        }
      }
    } catch (err) {
      console.warn(`[JobService] Failed to read job directory: ${dir}`, err);
    }
  }

  // Sort: active phases first (executing, planning), then by updated descending
  const phaseWeight: Record<JobPhase, number> = {
    executing: 0,
    planning: 1,
    review: 2,
    ready: 3,
    backlog: 4,
    complete: 5,
  };

  jobs.sort((a, b) => {
    const pw = phaseWeight[a.phase] - phaseWeight[b.phase];
    if (pw !== 0) return pw;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return jobs;
}

// ============================================================================
// Job CRUD
// ============================================================================

export function readJob(jobPath: string): { content: string; job: JobInfo } {
  const content = readFileSync(jobPath, 'utf-8');
  const job = parseJob(jobPath, content);
  return { content, job };
}

export function writeJob(jobPath: string, content: string): JobInfo {
  writeFileSync(jobPath, content, 'utf-8');
  return parseJob(jobPath, content);
}

/**
 * Create a new job file in the primary jobs directory.
 */
export function createJob(workspacePath: string, title: string, description: string, tags?: string[]): { path: string; content: string; job: JobInfo } {
  const workspaceName = basename(workspacePath);
  const jobsDir = join(homedir(), 'jobs', workspaceName);

  // Ensure directory exists
  if (!existsSync(jobsDir)) {
    mkdirSync(jobsDir, { recursive: true });
  }

  // Generate filename: YYYYMMDD-<slug>.md
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  
  let filePath = join(jobsDir, `${dateStr}-${slug}.md`);
  
  // Handle collision
  let counter = 1;
  while (existsSync(filePath)) {
    filePath = join(jobsDir, `${dateStr}-${slug}-${counter}.md`);
    counter++;
  }

  const isoNow = now.toISOString();
  const normalizedTags = normalizeTags(tags);
  const content = [
    '---',
    `title: ${title}`,
    'phase: backlog',
    `tags: ${formatFrontmatterValue(normalizedTags)}`,
    `created: ${isoNow}`,
    `updated: ${isoNow}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Description',
    description,
    '',
    '## Review',
    '<!-- Optional: Add review steps that run automatically after execution completes. -->',
    '<!-- Examples: -->',
    '<!-- - Run /skill:code-review on all changed files -->',
    '<!-- - Run /skill:security-review -->',
    '<!-- - Use playwright to verify the new feature works -->',
    '',
  ].join('\n');

  writeFileSync(filePath, content, 'utf-8');
  const job = parseJob(filePath, content);
  return { path: filePath, content, job };
}

/**
 * Promote a job to the next (or specified) phase.
 * Returns the updated content and job info.
 */
export function promoteJob(
  jobPath: string,
  toPhase?: JobPhase,
): { content: string; job: JobInfo } {
  const { content, job } = readJob(jobPath);
  const targetPhase = toPhase || getNextPhase(job.phase);

  if (!targetPhase) {
    throw new Error(`Cannot promote job from phase "${job.phase}" — already at final phase`);
  }

  const now = new Date().toISOString();
  const updates: Record<string, string | undefined> = {
    phase: targetPhase,
    updated: now,
  };

  if (targetPhase === 'complete') {
    updates.completedAt = now;
  }

  const updatedContent = updateJobFrontmatter(content, updates);
  const updatedJob = writeJob(jobPath, updatedContent);
  return { content: updatedContent, job: updatedJob };
}

/**
 * Demote a job to a previous (or specified) phase.
 */
export function demoteJob(
  jobPath: string,
  toPhase?: JobPhase,
): { content: string; job: JobInfo } {
  const { content, job } = readJob(jobPath);
  const targetPhase = toPhase || getPreviousPhase(job.phase);

  if (!targetPhase) {
    throw new Error(`Cannot demote job from phase "${job.phase}" — already at first phase`);
  }

  const now = new Date().toISOString();
  const updates: Record<string, string | undefined> = {
    phase: targetPhase,
    updated: now,
  };

  const updatedContent = updateJobFrontmatter(content, updates);
  const updatedJob = writeJob(jobPath, updatedContent);
  return { content: updatedContent, job: updatedJob };
}

/**
 * Store a session ID in the job frontmatter.
 */
export function setJobSessionId(
  jobPath: string,
  field: 'planningSessionId' | 'executionSessionId' | 'reviewSessionId',
  sessionId: string,
): void {
  const { content } = readJob(jobPath);
  const updatedContent = updateJobFrontmatter(content, {
    [field]: sessionId,
    updated: new Date().toISOString(),
  });
  writeFileSync(jobPath, updatedContent, 'utf-8');
}

// ============================================================================
// Active Job Helpers
// ============================================================================

/**
 * Build the system prompt for a planning conversation.
 */
export function buildPlanningPrompt(jobPath: string): string {
  return `<active_job phase="planning">
You have a job to plan at: ${jobPath}
Read the job file. It contains a title and description.
Your goal is to create a detailed implementation plan. Ask the user clarifying questions if needed, then write a concrete plan with \`- [ ]\` checkbox tasks back into the job file under a "## Plan" section.
Group tasks under \`### Phase\` headings. Keep tasks concise and actionable (start with a verb).
When you're done writing the plan, let the user know so they can review and iterate or mark it as ready.
</active_job>`;
}

/**
 * Build the system prompt for an execution conversation.
 */
export function buildExecutionPrompt(jobPath: string): string {
  return `<active_job phase="executing">
You have a job to execute at: ${jobPath}
Read the job file. It contains a plan with \`- [ ]\` checkbox tasks.
Work through each task systematically. As you complete each one, update the job file by checking off the corresponding checkbox (change \`- [ ]\` to \`- [x]\`).
When all tasks are complete, let the user know the job is ready for review.
</active_job>`;
}

/**
 * Extract the `## Review` section from a job file's content.
 * Returns the raw text of the review section (after the heading, up to the next ## heading or EOF),
 * or null if no review section exists.
 */
export function extractReviewSection(content: string): string | null {
  // Match "## Review" heading (case-insensitive)
  const reviewMatch = content.match(/^## Review\s*$/im);
  if (!reviewMatch || reviewMatch.index === undefined) return null;

  const startIndex = reviewMatch.index + reviewMatch[0].length;
  const rest = content.slice(startIndex);

  // Find the next ## heading (end of review section)
  const nextHeading = rest.match(/^## /m);
  const sectionText = nextHeading && nextHeading.index !== undefined
    ? rest.slice(0, nextHeading.index)
    : rest;

  const trimmed = sectionText.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the system prompt for a review conversation.
 * Reads the job file and extracts the ## Review section to tell the agent what to do.
 */
export function buildReviewPrompt(jobPath: string): string {
  const content = readFileSync(jobPath, 'utf-8');
  const reviewSection = extractReviewSection(content);

  if (!reviewSection) {
    return `<active_job phase="review">
You have a job to review at: ${jobPath}
Read the job file and perform a general review of the completed work.
When the review is complete, let the user know.
</active_job>`;
  }

  return `<active_job phase="review">
You have a job to review at: ${jobPath}
Read the job file first to understand the full context.

Then execute the following review steps:

${reviewSection}

Work through each review step. When all review steps are complete, let the user know the review is done.
</active_job>`;
}

/**
 * Get active job states for a workspace (jobs in planning, executing, or review phase).
 */
export function getActiveJobStates(workspacePath: string): import('@pi-deck/shared').ActiveJobState[] {
  const jobs = discoverJobs(workspacePath);
  const activePhases: import('@pi-deck/shared').JobPhase[] = ['planning', 'executing', 'review'];

  return jobs
    .filter(j => activePhases.includes(j.phase))
    .map(j => ({
      jobPath: j.path,
      title: j.title,
      phase: j.phase,
      tasks: j.tasks,
      taskCount: j.taskCount,
      doneCount: j.doneCount,
      sessionSlotId: j.phase === 'planning'
        ? j.frontmatter.planningSessionId
        : j.phase === 'review'
        ? j.frontmatter.reviewSessionId
        : j.frontmatter.executionSessionId,
    }));
}
