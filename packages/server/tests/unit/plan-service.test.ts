import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseTasks,
  parsePlan,
  updateTaskInContent,
  updateFrontmatterStatus,
  buildActivePlanPrompt,
} from '../../src/plan-service.js';

describe('Plan Service', () => {
  describe('parseFrontmatter', () => {
    it('parses valid frontmatter', () => {
      const content = `---
title: My Plan
status: active
created: 2026-02-06T09:00:00
---

# My Plan`;

      const { frontmatter, bodyStart } = parseFrontmatter(content);
      expect(frontmatter.title).toBe('My Plan');
      expect(frontmatter.status).toBe('active');
      expect(frontmatter.created).toBe('2026-02-06T09:00:00');
      expect(bodyStart).toBeGreaterThan(0);
    });

    it('returns empty frontmatter when none present', () => {
      const content = '# My Plan\n\nSome content';
      const { frontmatter, bodyStart } = parseFrontmatter(content);
      expect(frontmatter).toEqual({});
      expect(bodyStart).toBe(0);
    });

    it('handles unclosed frontmatter', () => {
      const content = '---\ntitle: Broken\n# No closing';
      const { frontmatter, bodyStart } = parseFrontmatter(content);
      expect(frontmatter).toEqual({});
      expect(bodyStart).toBe(0);
    });

    it('parses completed frontmatter', () => {
      const content = `---
title: Done Plan
status: complete
completed: 2026-02-06T12:00:00
summary: All tasks done
---`;

      const { frontmatter } = parseFrontmatter(content);
      expect(frontmatter.status).toBe('complete');
      expect(frontmatter.completed).toBe('2026-02-06T12:00:00');
      expect(frontmatter.summary).toBe('All tasks done');
    });
  });

  describe('parseTasks', () => {
    it('parses unchecked tasks', () => {
      const content = '- [ ] Task 1\n- [ ] Task 2';
      const tasks = parseTasks(content);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].text).toBe('Task 1');
      expect(tasks[0].done).toBe(false);
      expect(tasks[1].text).toBe('Task 2');
    });

    it('parses checked tasks', () => {
      const content = '- [x] Done task\n- [X] Also done';
      const tasks = parseTasks(content);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].done).toBe(true);
      expect(tasks[1].done).toBe(true);
    });

    it('parses nested tasks', () => {
      const content = '- [ ] Top level\n  - [ ] Sub-task\n    - [ ] Sub-sub';
      const tasks = parseTasks(content);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].depth).toBe(0);
      expect(tasks[1].depth).toBe(1);
      expect(tasks[2].depth).toBe(2);
    });

    it('tracks line numbers', () => {
      const content = '# Heading\n\n- [ ] Task 1\nSome text\n- [x] Task 2';
      const tasks = parseTasks(content);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].line).toBe(2);
      expect(tasks[1].line).toBe(4);
    });

    it('ignores non-checkbox lines', () => {
      const content = '- Regular list item\n- [ ] Actual task\n- Another item';
      const tasks = parseTasks(content);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('Actual task');
    });
  });

  describe('parsePlan', () => {
    it('extracts title from H1 when no frontmatter title', () => {
      const content = '# My Great Plan\n\n- [ ] Do thing';
      const plan = parsePlan('/tmp/test.md', content);
      expect(plan.title).toBe('My Great Plan');
    });

    it('prefers frontmatter title over H1', () => {
      const content = '---\ntitle: FM Title\n---\n\n# H1 Title\n- [ ] Task';
      const plan = parsePlan('/tmp/test.md', content);
      expect(plan.title).toBe('FM Title');
    });

    it('falls back to filename', () => {
      const content = 'No heading here\n- [ ] Task';
      const plan = parsePlan('/tmp/my-plan.md', content);
      expect(plan.title).toBe('my-plan');
    });

    it('counts tasks correctly', () => {
      const content = '- [ ] A\n- [x] B\n- [ ] C\n- [x] D';
      const plan = parsePlan('/tmp/test.md', content);
      expect(plan.taskCount).toBe(4);
      expect(plan.doneCount).toBe(2);
    });

    it('defaults to draft status', () => {
      const content = '# Plan\n- [ ] Task';
      const plan = parsePlan('/tmp/test.md', content);
      expect(plan.status).toBe('draft');
    });
  });

  describe('updateTaskInContent', () => {
    it('checks off a task', () => {
      const content = '- [ ] Task 1\n- [ ] Task 2';
      const updated = updateTaskInContent(content, 0, true);
      expect(updated).toBe('- [x] Task 1\n- [ ] Task 2');
    });

    it('unchecks a task', () => {
      const content = '- [x] Task 1\n- [ ] Task 2';
      const updated = updateTaskInContent(content, 0, false);
      expect(updated).toBe('- [ ] Task 1\n- [ ] Task 2');
    });

    it('handles out of bounds', () => {
      const content = '- [ ] Task 1';
      const updated = updateTaskInContent(content, 5, true);
      expect(updated).toBe(content);
    });
  });

  describe('updateFrontmatterStatus', () => {
    it('updates existing status', () => {
      const content = '---\ntitle: Plan\nstatus: draft\n---\n\n# Plan';
      const updated = updateFrontmatterStatus(content, 'active');
      expect(updated).toContain('status: active');
      expect(updated).not.toContain('status: draft');
    });

    it('adds status when missing', () => {
      const content = '---\ntitle: Plan\n---\n\n# Plan';
      const updated = updateFrontmatterStatus(content, 'active');
      expect(updated).toContain('status: active');
    });

    it('adds completed datetime', () => {
      const content = '---\ntitle: Plan\nstatus: active\n---\n\n# Plan';
      const updated = updateFrontmatterStatus(content, 'complete', {
        completed: '2026-02-06T12:00:00',
      });
      expect(updated).toContain('status: complete');
      expect(updated).toContain('completed: 2026-02-06T12:00:00');
    });

    it('prepends frontmatter when none exists', () => {
      const content = '# Plan\n- [ ] Task';
      const updated = updateFrontmatterStatus(content, 'active');
      expect(updated.startsWith('---')).toBe(true);
      expect(updated).toContain('status: active');
      expect(updated).toContain('# Plan');
    });
  });

  describe('buildActivePlanPrompt', () => {
    it('includes plan path', () => {
      const prompt = buildActivePlanPrompt('/home/user/plans/test.md');
      expect(prompt).toContain('/home/user/plans/test.md');
      expect(prompt).toContain('<active_plan>');
      expect(prompt).toContain('</active_plan>');
    });

    it('includes task completion instructions', () => {
      const prompt = buildActivePlanPrompt('/tmp/plan.md');
      expect(prompt).toContain('- [ ]');
      expect(prompt).toContain('- [x]');
    });
  });
});
