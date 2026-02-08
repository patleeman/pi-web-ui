import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';
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
// Frontmatter Parsing (uses `yaml` library)
// ============================================================================

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = String(raw).trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

/**
 * Extract the raw YAML block and body start position from markdown with frontmatter.
 * Returns null if no valid frontmatter delimiters found.
 */
function extractFrontmatterBlock(content: string): { yamlBlock: string; bodyStart: number } | null {
  if (!content.startsWith('---')) return null;

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return null;

  const yamlBlock = content.slice(4, endIndex); // skip opening '---\n'
  const bodyStart = Math.min(endIndex + 4, content.length); // skip '\n---'
  return { yamlBlock, bodyStart };
}

export function parseJobFrontmatter(content: string): { frontmatter: JobFrontmatter; bodyStart: number } {
  const frontmatter: JobFrontmatter = {};

  const block = extractFrontmatterBlock(content);
  if (!block) return { frontmatter, bodyStart: 0 };

  let parsed: Record<string, unknown>;
  try {
    parsed = YAML.parse(block.yamlBlock) ?? {};
  } catch {
    // Malformed YAML — treat as no frontmatter
    return { frontmatter, bodyStart: 0 };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { frontmatter, bodyStart: 0 };
  }

  const str = (v: unknown): string | undefined =>
    v != null ? String(v) : undefined;

  if (parsed.title != null) frontmatter.title = str(parsed.title);
  if (typeof parsed.phase === 'string' && PHASE_ORDER.includes(parsed.phase as JobPhase)) {
    frontmatter.phase = parsed.phase as JobPhase;
  }
  frontmatter.tags = normalizeTags(parsed.tags);
  if (typeof parsed.status === 'string' && ['draft', 'active', 'complete'].includes(parsed.status)) {
    frontmatter.status = parsed.status as PlanStatus;
  }
  if (parsed.created != null) frontmatter.created = str(parsed.created);
  if (parsed.updated != null) frontmatter.updated = str(parsed.updated);
  if (parsed.completedAt != null) frontmatter.completedAt = str(parsed.completedAt);
  // Legacy field
  if (parsed.completed != null && frontmatter.completedAt == null) {
    frontmatter.completedAt = str(parsed.completed);
  }
  if (parsed.planningSessionId != null) frontmatter.planningSessionId = str(parsed.planningSessionId);
  if (parsed.executionSessionId != null) frontmatter.executionSessionId = str(parsed.executionSessionId);
  if (parsed.reviewSessionId != null) frontmatter.reviewSessionId = str(parsed.reviewSessionId);

  return { frontmatter, bodyStart: block.bodyStart };
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

/**
 * Update or set fields in the YAML frontmatter of a job file.
 * Creates frontmatter if it doesn't exist.
 * Uses the `yaml` library for correct parsing and serialization.
 */
export function updateJobFrontmatter(
  content: string,
  updates: Record<string, string | string[] | undefined>,
): string {
  const block = extractFrontmatterBlock(content);

  let existing: Record<string, unknown> = {};
  let body = content;

  if (block) {
    try {
      existing = YAML.parse(block.yamlBlock) ?? {};
    } catch {
      existing = {};
    }
    body = content.slice(block.bodyStart);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    existing[key] = value;
  }

  const yamlStr = YAML.stringify(existing).trimEnd();
  return `---\n${yamlStr}\n---${body}`;
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

  // Primary: ~/.pi/agent/jobs/<workspace-name>/
  dirs.push(join(homedir(), '.pi', 'agent', 'jobs', workspaceName));

  // Local: <workspace>/.pi/jobs/
  dirs.push(join(workspacePath, '.pi', 'jobs'));

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
  const jobsDir = join(homedir(), '.pi', 'agent', 'jobs', workspaceName);

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
  const fmObj: Record<string, unknown> = {
    title,
    phase: 'backlog',
    tags: normalizedTags,
    created: isoNow,
    updated: isoNow,
  };
  const yamlStr = YAML.stringify(fmObj).trimEnd();
  const content = [
    `---`,
    yamlStr,
    '---',
    '',
    `# ${title}`,
    '',
    '## Description',
    description,
    '',
    '## Review',
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
