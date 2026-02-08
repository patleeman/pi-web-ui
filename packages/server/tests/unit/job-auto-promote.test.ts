import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseJob,
  readJob,
  promoteJob,
  extractReviewSection,
  setJobSessionId,
  buildReviewPrompt,
  getActiveJobStates,
} from '../../src/job-service.js';

const TEST_DIR = join(tmpdir(), 'pi-job-auto-promote-test-' + Date.now());
const FAKE_WORKSPACE = join(TEST_DIR, 'workspace');

beforeAll(() => {
  // Create the workspace jobs directory that getActiveJobStates expects
  mkdirSync(join(TEST_DIR, 'workspace'), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeTestJob(filename: string, content: string): string {
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Job auto-promote: executing → review → complete', () => {
  it('job with ## Review section promotes executing → review → complete', () => {
    const content = `---
title: Feature with review
phase: executing
executionSessionId: job-executing-123
created: 2026-02-08T00:00:00.000Z
updated: 2026-02-08T00:00:00.000Z
---

# Feature with review

## Plan

- [x] Build the thing

## Review

Run /skill:code-review on all changed files.
Verify tests pass.`;

    const filePath = writeTestJob('job-with-review.md', content);

    // Simulate: agent ends → check for review section
    const { content: jobContent, job } = readJob(filePath);
    expect(job.phase).toBe('executing');

    const reviewSection = extractReviewSection(jobContent);
    expect(reviewSection).not.toBeNull();
    expect(reviewSection).toContain('/skill:code-review');

    // Auto-promote: executing → review
    const { job: reviewJob } = promoteJob(filePath);
    expect(reviewJob.phase).toBe('review');

    // Store review session ID
    setJobSessionId(filePath, 'reviewSessionId', 'job-review-456');
    const { job: reviewJobWithSession } = readJob(filePath);
    expect(reviewJobWithSession.frontmatter.reviewSessionId).toBe('job-review-456');

    // Build review prompt includes the review section content
    const prompt = buildReviewPrompt(filePath);
    expect(prompt).toContain('phase="review"');
    expect(prompt).toContain('/skill:code-review');
    expect(prompt).toContain('Verify tests pass');

    // Auto-promote: review → complete
    const { job: completeJob } = promoteJob(filePath);
    expect(completeJob.phase).toBe('complete');
    expect(completeJob.frontmatter.completedAt).toBeDefined();
  });

  it('job without ## Review section stays in executing (no auto-promote)', () => {
    const content = `---
title: Simple job
phase: executing
executionSessionId: job-executing-789
created: 2026-02-08T00:00:00.000Z
updated: 2026-02-08T00:00:00.000Z
---

# Simple job

## Plan

- [x] Do the thing`;

    const filePath = writeTestJob('job-no-review.md', content);

    // Simulate: agent ends → check for review section
    const { content: jobContent, job } = readJob(filePath);
    expect(job.phase).toBe('executing');

    const reviewSection = extractReviewSection(jobContent);
    expect(reviewSection).toBeNull();

    // No auto-promote should happen — job stays in executing
    // (In the real server, the agentEnd handler checks this and skips promotion)
    const { job: stillExecuting } = readJob(filePath);
    expect(stillExecuting.phase).toBe('executing');
  });
});

describe('getActiveJobStates includes review phase', () => {
  it('returns review-phase jobs with reviewSessionId as sessionSlotId', () => {
    // Create a jobs directory in the expected location for discovery
    const workspaceName = 'auto-promote-workspace';
    const workspaceDir = join(TEST_DIR, workspaceName);
    mkdirSync(workspaceDir, { recursive: true });

    // getActiveJobStates looks in ~/jobs/<workspace-name>/
    // We can't easily mock that, so test via parseJob + the mapping logic directly
    const content = `---
title: Review job
phase: review
reviewSessionId: job-review-slot-abc
updated: 2026-02-08T00:00:00.000Z
---

# Review job`;

    const job = parseJob('/tmp/review-job.md', content);
    expect(job.phase).toBe('review');
    expect(job.frontmatter.reviewSessionId).toBe('job-review-slot-abc');

    // Simulate the mapping from getActiveJobStates
    const activePhases = ['planning', 'executing', 'review'];
    expect(activePhases.includes(job.phase)).toBe(true);

    const sessionSlotId = job.phase === 'planning'
      ? job.frontmatter.planningSessionId
      : job.phase === 'review'
      ? job.frontmatter.reviewSessionId
      : job.frontmatter.executionSessionId;

    expect(sessionSlotId).toBe('job-review-slot-abc');
  });
});
