import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, basename, resolve, dirname } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';
import type { JobPhase, JobType, JobFrontmatter, JobInfo, JobTask, PlanStatus, JobAttachment, JobAttachmentType } from '@pi-deck/shared';

// Re-export parseTasks from plan-service (same format)
export { parseTasks } from './plan-service.js';
import { parseTasks } from './plan-service.js';

// ============================================================================
// Job Configuration
// ============================================================================

/**
 * Schema for the .pi/jobs.json configuration file.
 *
 * This configuration file allows customizing where job files are stored.
 * Without this file, the system uses default locations for backward compatibility.
 *
 * Example .pi/jobs.json:
 * ```json
 * {
 *   "locations": ["~/.pi/agent/jobs/my-workspace", ".pi/jobs"],
 *   "defaultLocation": "~/.pi/agent/jobs/my-workspace"
 * }
 * ```
 */
export interface JobConfig {
  /** Array of directory paths to scan for jobs */
  locations: string[];
  /** Where new jobs are created (defaults to first location) */
  defaultLocation?: string;
}

/**
 * Load and parse the .pi/jobs.json configuration file from a workspace.
 * Returns null if the config doesn't exist (backward compatibility).
 * Throws on invalid JSON or invalid configuration structure.
 *
 * Backward compatibility: If .pi/jobs.json doesn't exist, returns null and
 * the system falls back to default job directory locations.
 */
export function loadJobConfig(workspacePath: string): JobConfig | null {
  const configPath = join(workspacePath, '.pi', 'jobs.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const rawContent = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(rawContent);

    // Validate the configuration structure
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Configuration must be a JSON object');
    }

    if (!Array.isArray(parsed.locations) || parsed.locations.length === 0) {
      throw new Error('Configuration must have a non-empty "locations" array');
    }

    // Validate each location is a string
    for (const loc of parsed.locations) {
      if (typeof loc !== 'string') {
        throw new Error(`Location must be a string, got ${typeof loc}`);
      }
    }

    // Validate defaultLocation if provided
    if (parsed.defaultLocation !== undefined && typeof parsed.defaultLocation !== 'string') {
      throw new Error(`defaultLocation must be a string, got ${typeof parsed.defaultLocation}`);
    }

    return {
      locations: parsed.locations,
      defaultLocation: parsed.defaultLocation,
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse ${configPath}: Invalid JSON`);
    }
    throw err;
  }
}

/**
 * Resolve a location path to an absolute path.
 * Expands ~ to home directory and resolves relative paths from workspace root.
 *
 * This enables flexible path specifications in .pi/jobs.json:
 * - Absolute paths: "/Users/you/jobs"
 * - Home paths: "~/.pi/jobs"
 * - Relative paths: "./jobs", ".pi/jobs" (resolved from workspace root)
 */
export function resolveLocationPath(location: string, workspacePath: string): string {
  // Validate path is a string
  if (typeof location !== 'string') {
    throw new Error(`Location must be a string, got ${typeof location}`);
  }

  let path = location;

  // Expand ~ to home directory
  if (path.startsWith('~/') || path === '~') {
    path = join(homedir(), path.slice(1));
  }

  // If path is relative, resolve from workspace root
  if (!path.startsWith('/')) {
    path = resolve(workspacePath, path);
  }

  return path;
}

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
  if (parsed.attachments != null) frontmatter.attachments = parseJobAttachments(parsed.attachments);

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
  updates: Record<string, unknown>,
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
    if (value === undefined) {
      delete existing[key];
      continue;
    }
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
  // Try to load custom configuration
  try {
    const config = loadJobConfig(workspacePath);

    if (config) {
      // Use configured locations
      return config.locations.map(loc => {
        const resolvedPath = resolveLocationPath(loc, workspacePath);

        // Warn if configured directory doesn't exist
        if (!existsSync(resolvedPath)) {
          console.warn(`[JobService] Configured job directory does not exist: ${resolvedPath}`);
        }

        return resolvedPath;
      });
    }
  } catch (err) {
    console.warn(`[JobService] Failed to load job configuration: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fall back to default behavior for backward compatibility
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
 * Create a new job file in the appropriate jobs directory.
 * Uses location parameter if provided (must be in configured locations),
 * otherwise uses defaultLocation from config if specified,
 * otherwise first location,
 * otherwise falls back to default behavior for backward compatibility.
 */
export function createJob(
  workspacePath: string,
  title: string,
  description: string,
  tags?: string[],
  location?: string,
): { path: string; content: string; job: JobInfo } {
  let config: JobConfig | null = null;
  let jobsDir: string;

  try {
    config = loadJobConfig(workspacePath);

    // If location is specified, validate it's in the configured locations
    if (location) {
      if (config) {
        const resolvedLocation = resolveLocationPath(location, workspacePath);
        const availableLocations = config.locations.map(loc => resolveLocationPath(loc, workspacePath));
        if (availableLocations.includes(resolvedLocation)) {
          jobsDir = resolvedLocation;
        } else {
          throw new Error(`Location "${location}" is not in the configured job locations`);
        }
      } else {
        // No config - check against default locations
        const defaultLocs = [
          join(homedir(), '.pi', 'agent', 'jobs', basename(workspacePath)),
          join(workspacePath, '.pi', 'jobs'),
        ];
        if (defaultLocs.includes(location)) {
          jobsDir = location;
        } else {
          throw new Error(`Location "${location}" is not available (no custom config)`);
        }
      }
    } else if (config && config.defaultLocation) {
      // Use configured default location
      jobsDir = resolveLocationPath(config.defaultLocation, workspacePath);
    } else if (config && config.locations.length > 0) {
      // Use first location from config
      jobsDir = resolveLocationPath(config.locations[0], workspacePath);
    } else {
      // Fall back to default behavior for backward compatibility
      const workspaceName = basename(workspacePath);
      jobsDir = join(homedir(), '.pi', 'agent', 'jobs', workspaceName);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('not available')) {
      throw err; // Re-throw validation errors
    }
    console.warn(`[JobService] Failed to load job config for createJob: ${err instanceof Error ? err.message : String(err)}`);
    // Fall back to default behavior
    const workspaceName = basename(workspacePath);
    jobsDir = join(homedir(), '.pi', 'agent', 'jobs', workspaceName);
  }

  // Ensure directory exists
  try {
    if (!existsSync(jobsDir)) {
      mkdirSync(jobsDir, { recursive: true });
    }
  } catch (err) {
    throw new Error(`Failed to create job directory at ${jobsDir}: ${err instanceof Error ? err.message : String(err)}`);
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
  const updates: Record<string, string | boolean | undefined> = {
    phase: targetPhase,
    updated: now,
  };

  if (targetPhase === 'complete') {
    updates.completedAt = now;
    // Clear finalize flag from review phase
    updates.finalized = undefined;
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
// Archive Helpers
// ============================================================================

/**
 * Get the archived subdirectory for a given job directory.
 */
function getArchivedDir(jobDir: string): string {
  return join(jobDir, 'archived');
}

/**
 * Archive a job by moving its file into the archived/ subdirectory.
 * Returns the new path.
 */
export function archiveJob(jobPath: string): string {
  const dir = dirname(jobPath);
  const file = basename(jobPath);
  const archivedDir = getArchivedDir(dir);

  if (!existsSync(archivedDir)) {
    mkdirSync(archivedDir, { recursive: true });
  }

  const newPath = join(archivedDir, file);
  renameSync(jobPath, newPath);
  return newPath;
}

/**
 * Unarchive a job by moving it back from the archived/ subdirectory.
 * Returns the new path.
 */
export function unarchiveJob(jobPath: string): string {
  const archivedDir = dirname(jobPath);
  const parentDir = dirname(archivedDir);
  const file = basename(jobPath);

  const newPath = join(parentDir, file);
  renameSync(jobPath, newPath);
  return newPath;
}

/**
 * Discover archived jobs across all job directories for a workspace.
 */
export function discoverArchivedJobs(workspacePath: string): JobInfo[] {
  const dirs = getJobDirectories(workspacePath);
  const jobs: JobInfo[] = [];

  for (const dir of dirs) {
    const archivedDir = getArchivedDir(dir);
    if (!existsSync(archivedDir)) continue;

    try {
      const files = readdirSync(archivedDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = resolve(join(archivedDir, file));
        try {
          const content = readFileSync(filePath, 'utf-8');
          jobs.push(parseJob(filePath, content));
        } catch (err) {
          console.warn(`[JobService] Failed to parse archived job: ${filePath}`, err);
        }
      }
    } catch (err) {
      console.warn(`[JobService] Failed to read archived directory: ${archivedDir}`, err);
    }
  }

  jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return jobs;
}

// ============================================================================
// Active Job Helpers
// ============================================================================

/**
 * Build a system context block describing the job system for any session.
 * Injected into the first prompt of a new session so the agent knows how to manage jobs.
 */
export function buildJobSystemContext(workspacePath: string): string | null {
  const dirs = getJobDirectories(workspacePath);
  const config = loadJobConfig(workspacePath);

  // Determine primary directory (first in list)
  const primaryDir = dirs[0];

  const jobs = discoverJobs(workspacePath);

  // Build a brief listing of current jobs
  const jobLines = jobs.map(j => `  - [${j.phase}] "${j.title}" → ${j.path}`).join('\n');
  const jobListing = jobs.length > 0
    ? `\nCurrent jobs:\n${jobLines}`
    : '\nNo jobs exist yet.';

  // Build directory listing
  const dirListing = dirs.map(d => `  - ${d}`).join('\n');

  return `<job_system>
You have access to a job management system. Jobs are markdown files with YAML frontmatter.

## Job Locations
Jobs are stored in the following directories:
${dirListing}

${config ? `Configuration loaded from: .pi/jobs.json` : 'Using default job locations (no .pi/jobs.json config)'}

## Job File Format
\`\`\`markdown
---
title: "Job Title"
phase: backlog        # backlog → planning → ready → executing → review → complete
tags:
  - feature
  - frontend
created: 2026-01-15T10:00:00.000Z
updated: 2026-01-15T10:00:00.000Z
---

# Job Title

## Description
What needs to be done.

## Plan
- [ ] Task 1
- [ ] Task 2
- [x] Completed task

## Review
- Run /skill:code-review on all changed files
\`\`\`

## Managing Jobs
- **Create a job**: Write a new .md file to ${primaryDir} with the frontmatter format above. Use filename format: YYYYMMDD-slug.md
- **List jobs**: Read files from any of the job directories
- **Update phase**: Edit the \`phase\` field in frontmatter. Update \`updated\` timestamp.
- **Check off tasks**: Change \`- [ ]\` to \`- [x]\` in the job file.
- **Complete a job**: Set phase to "complete" and add \`completedAt\` to frontmatter.

## Phase Lifecycle
backlog → planning → ready → executing → review → complete

${jobListing}
</job_system>`;
}

/**
 * Build the system prompt for a planning conversation.
 */
export function buildPlanningPrompt(jobPath: string): string {
  return `<active_job phase="planning">
You have a job to plan at: ${jobPath}
Read the job file. It contains a title and description.

Before creating the plan, you MUST:
1. Explore the codebase to understand the current implementation
2. Search for relevant files, functions, and existing patterns
3. Read documentation and configuration files as needed
4. Gather context about the architecture and conventions used

Do this research yourself — DO NOT include research or exploration tasks in the plan. The plan should only contain concrete implementation steps that will be performed after planning is complete.

Your goal is to create a detailed implementation plan. Ask the user clarifying questions if needed, then write a concrete plan with \`- [ ]\` checkbox tasks back into the job file under a "## Plan" section.

Plan tasks should be actionable implementation steps only (e.g., "Add function X", "Update file Y"). Do not include research tasks like "review current implementation" — you should do that during planning, not put it in the plan.

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
 * Get job locations for a workspace with metadata.
 * Returns display info about all configured job locations and which is default.
 */
export function getJobLocations(workspacePath: string): Array<{ path: string; isDefault: boolean; displayName: string }> {
  const config = loadJobConfig(workspacePath);
  const dirs = getJobDirectories(workspacePath);
  let defaultDir: string;

  if (config && config.defaultLocation) {
    defaultDir = resolveLocationPath(config.defaultLocation, workspacePath);
  } else if (config && config.locations.length > 0) {
    defaultDir = resolveLocationPath(config.locations[0], workspacePath);
  } else {
    // Default to first directory from getJobDirectories
    defaultDir = dirs[0];
  }

  return dirs.map(dir => ({
    path: dir,
    isDefault: dir === defaultDir,
    displayName: dir.startsWith(workspacePath)
      ? `.${dir.slice(workspacePath.length)}` // Relative path
      : dir.replace(homedir(), '~'), // Replace home directory with ~
  }));
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
 * Build the finalize prompt — sent after review completes.
 * Asks the agent to update the job doc with final remarks, links, and artifacts.
 */
export function buildFinalizePrompt(jobPath: string): string {
  return `<active_job phase="finalize">
The review for this job is complete. Now finalize the job at: ${jobPath}

Please update the job file with a ## Summary section at the end containing:
- A brief summary of what was accomplished
- Links to any pull requests created
- Links to any other important artifacts (docs, configs, etc.)
- Any notes for future reference

Then mark all remaining tasks as done if they aren't already.
Update the \`updated\` timestamp in the frontmatter.
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

// ============================================================================
// Job Attachments
// ============================================================================

/**
 * Get the attachments directory for a job file.
 * Returns: <job-file-dir>/<job-name>.attachments/
 */
export function getAttachmentsDir(jobPath: string): string {
  const jobDir = dirname(jobPath);
  const jobFileName = basename(jobPath, '.md');
  return join(jobDir, `${jobFileName}.attachments`);
}

/**
 * Parse attachment metadata from frontmatter attachments array.
 * Returns the parsed attachments array.
 */
export function parseJobAttachments(attachments: unknown): JobAttachment[] {
  if (!Array.isArray(attachments)) return [];

  const parsed: JobAttachment[] = [];

  for (const raw of attachments) {
    if (typeof raw !== 'object' || raw === null) continue;

    const obj = raw as Record<string, unknown>;

    // Validate required fields
    if (typeof obj.id !== 'string') continue;
    if (typeof obj.type !== 'string' || !['image', 'file'].includes(obj.type as JobAttachmentType)) continue;
    if (typeof obj.name !== 'string') continue;
    if (typeof obj.path !== 'string') continue;
    if (typeof obj.mediaType !== 'string') continue;
    if (typeof obj.size !== 'number') continue;
    if (typeof obj.createdAt !== 'string') continue;

    parsed.push({
      id: obj.id,
      type: obj.type as JobAttachmentType,
      name: obj.name,
      path: obj.path,
      mediaType: obj.mediaType,
      size: obj.size,
      createdAt: obj.createdAt,
    });
  }

  return parsed;
}

/**
 * Generate a unique attachment filename.
 * Format: <type>-<seq>-<original-name>
 * Example: img-001-screenshot.png
 */
export function generateAttachmentFileName(attachments: JobAttachment[], mediaType: string, originalName: string): string {
  const prefix = mediaType.startsWith('image/') ? 'img' : 'file';

  // Find existing sequence numbers for this prefix
  const existingSeqs = attachments
    .filter(a => a.name.startsWith(prefix))
    .map(a => {
      const match = a.name.match(new RegExp(`^${prefix}-(\\d+)-`));
      return match ? parseInt(match[1], 10) : 0;
    });

  const nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 1;

  // Get file extension from original name
  const ext = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';

  // Generate filename: <type>-<seq>-<slugified-name>.<ext>
  const slug = originalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return `${prefix}-${String(nextSeq).padStart(3, '0')}-${slug}${ext}`;
}

/**
 * Add an attachment to a job.
 * Writes the attachment file to disk and updates the job frontmatter.
 */
export function addAttachmentToJob(
  jobPath: string,
  fileName: string,
  mediaType: string,
  buffer: Buffer,
): { job: JobInfo; attachment: JobAttachment } {
  const { content, job } = readJob(jobPath);
  const attachments = parseJobAttachments(job.frontmatter.attachments);

  // Generate attachment ID
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Generate unique filename
  const attachmentFileName = generateAttachmentFileName(attachments, mediaType, fileName);

  // Get or create attachments directory
  const attachmentsDir = getAttachmentsDir(jobPath);
  if (!existsSync(attachmentsDir)) {
    mkdirSync(attachmentsDir, { recursive: true });
  }

  // Write attachment file
  const attachmentFilePath = join(attachmentsDir, attachmentFileName);
  writeFileSync(attachmentFilePath, buffer);

  // Get relative path from job directory
  const jobDir = dirname(jobPath);
  const relativePath = attachmentFilePath.slice(jobDir.length + 1);

  // Create attachment metadata
  const attachment: JobAttachment = {
    id,
    type: mediaType.startsWith('image/') ? 'image' : 'file',
    name: attachmentFileName,
    path: relativePath,
    mediaType,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };

  // Update frontmatter with new attachment
  const updatedAttachments = [...attachments, attachment];
  const updatedContent = updateJobFrontmatter(content, {
    attachments: updatedAttachments.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      path: a.path,
      mediaType: a.mediaType,
      size: a.size,
      createdAt: a.createdAt,
    })),
    updated: new Date().toISOString(),
  });

  // Write updated job content
  writeJob(jobPath, updatedContent);

  // Return updated job info
  const updatedJob = parseJob(jobPath, updatedContent);
  return { job: updatedJob, attachment };
}

/**
 * Remove an attachment from a job.
 * Deletes the attachment file and updates the job frontmatter.
 */
export function removeAttachmentFromJob(
  jobPath: string,
  attachmentId: string,
): { job: JobInfo; attachment: JobAttachment | null } {
  const { content, job } = readJob(jobPath);
  const attachments = parseJobAttachments(job.frontmatter.attachments);

  // Find the attachment to remove
  const attachmentIndex = attachments.findIndex(a => a.id === attachmentId);
  if (attachmentIndex === -1) {
    return { job, attachment: null };
  }

  const removedAttachment = attachments[attachmentIndex];

  // Delete the attachment file
  const jobDir = dirname(jobPath);
  const attachmentFilePath = join(jobDir, removedAttachment.path);
  if (existsSync(attachmentFilePath)) {
    unlinkSync(attachmentFilePath);
  }

  // Remove attachment from frontmatter
  const updatedAttachments = attachments.filter(a => a.id !== attachmentId);

  // Check if attachments directory is empty (except .gitignore)
  const attachmentsDir = getAttachmentsDir(jobPath);
  if (existsSync(attachmentsDir)) {
    const remainingFiles = readdirSync(attachmentsDir);
    if (remainingFiles.length === 0 || (remainingFiles.length === 1 && remainingFiles[0] === '.gitignore')) {
      // Directory is empty, we could delete it but leave it for now
    }
  }

  // Update frontmatter
  const updatedContent = updateJobFrontmatter(content, {
    attachments: updatedAttachments.length > 0 ? updatedAttachments.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      path: a.path,
      mediaType: a.mediaType,
      size: a.size,
      createdAt: a.createdAt,
    })) : undefined,
    updated: new Date().toISOString(),
  });

  // Write updated job content
  writeJob(jobPath, updatedContent);

  // Return updated job info
  const updatedJob = parseJob(jobPath, updatedContent);
  return { job: updatedJob, attachment: removedAttachment };
}

/**
 * Read an attachment file as base64 data.
 */
export function readAttachmentFile(jobPath: string, attachmentId: string): { base64Data: string; mediaType: string } | null {
  const { job } = readJob(jobPath);
  const attachments = parseJobAttachments(job.frontmatter.attachments);

  // Find the attachment
  const attachment = attachments.find(a => a.id === attachmentId);
  if (!attachment) {
    return null;
  }

  // Read the attachment file
  const jobDir = dirname(jobPath);
  const attachmentFilePath = join(jobDir, attachment.path);

  if (!existsSync(attachmentFilePath)) {
    return null;
  }

  const buffer = readFileSync(attachmentFilePath);
  const base64Data = buffer.toString('base64');

  return { base64Data, mediaType: attachment.mediaType };
}
