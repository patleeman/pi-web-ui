import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIStateStore, ThinkingLevel } from '../../src/ui-state.js';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Thinking Level Preference', () => {
  let tempDir: string;
  let uiStateStore: UIStateStore;

  beforeEach(() => {
    // Create a temporary directory for the test database
    tempDir = mkdtempSync(join(tmpdir(), 'pi-test-'));
    const dbPath = join(tempDir, 'test-ui-state.db');
    uiStateStore = new UIStateStore(dbPath);
  });

  afterEach(() => {
    uiStateStore.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('UIStateStore thinking level persistence', () => {
    it('stores thinking level for a workspace path', () => {
      const workspacePath = '/home/user/project';
      const level: ThinkingLevel = 'high';

      uiStateStore.setThinkingLevel(workspacePath, level);

      const state = uiStateStore.loadState();
      expect(state.thinkingLevels[workspacePath]).toBe('high');
    });

    it('stores different thinking levels for different workspaces', () => {
      uiStateStore.setThinkingLevel('/project1', 'low');
      uiStateStore.setThinkingLevel('/project2', 'high');
      uiStateStore.setThinkingLevel('/project3', 'off');

      const state = uiStateStore.loadState();
      expect(state.thinkingLevels['/project1']).toBe('low');
      expect(state.thinkingLevels['/project2']).toBe('high');
      expect(state.thinkingLevels['/project3']).toBe('off');
    });

    it('overwrites thinking level for same workspace', () => {
      const workspacePath = '/home/user/project';

      uiStateStore.setThinkingLevel(workspacePath, 'low');
      uiStateStore.setThinkingLevel(workspacePath, 'medium');
      uiStateStore.setThinkingLevel(workspacePath, 'high');

      const state = uiStateStore.loadState();
      expect(state.thinkingLevels[workspacePath]).toBe('high');
    });

    it('persists thinking level across store instances', () => {
      const workspacePath = '/home/user/project';
      const dbPath = join(tempDir, 'test-ui-state.db');

      uiStateStore.setThinkingLevel(workspacePath, 'xhigh');
      uiStateStore.close();

      // Create new store instance
      const newStore = new UIStateStore(dbPath);
      const state = newStore.loadState();
      expect(state.thinkingLevels[workspacePath]).toBe('xhigh');
      newStore.close();
    });

    it('supports all thinking levels', () => {
      const levels: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

      levels.forEach((level, index) => {
        const workspacePath = `/workspace${index}`;
        uiStateStore.setThinkingLevel(workspacePath, level);
      });

      const state = uiStateStore.loadState();
      levels.forEach((level, index) => {
        expect(state.thinkingLevels[`/workspace${index}`]).toBe(level);
      });
    });

    it('returns empty object when no thinking levels are set', () => {
      const state = uiStateStore.loadState();
      expect(state.thinkingLevels).toEqual({});
    });
  });

  describe('Workspace opening with thinking level preference', () => {
    // These tests verify the pattern used in index.ts

    it('retrieves stored thinking level when workspace opens', () => {
      // Simulate: user previously set thinking level for a workspace
      uiStateStore.setThinkingLevel('/home/user/project', 'high');

      // Simulate: workspace is being opened, server retrieves preference
      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels['/home/user/project'];

      // Server should find the stored preference
      expect(storedThinkingLevel).toBe('high');
      expect(storedThinkingLevel).toBeDefined();
    });

    it('returns undefined for workspace without stored preference', () => {
      // Simulate: workspace is being opened for first time
      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels['/new/workspace'];

      // Server should not find a preference (will use default)
      expect(storedThinkingLevel).toBeUndefined();
    });

    it('mock orchestrator receives correct thinking level', () => {
      // Mock orchestrator
      const mockOrchestrator = {
        setThinkingLevel: vi.fn(),
      };

      // Simulate stored preference
      uiStateStore.setThinkingLevel('/workspace', 'medium');

      // Simulate workspace opening logic from index.ts
      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels['/workspace'];
      
      if (storedThinkingLevel) {
        mockOrchestrator.setThinkingLevel('default', storedThinkingLevel);
      }

      // Verify orchestrator was called with correct values
      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledWith('default', 'medium');
    });

    it('does not call orchestrator when no preference is stored', () => {
      const mockOrchestrator = {
        setThinkingLevel: vi.fn(),
      };

      // No preference stored for this workspace
      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels['/new/workspace'];

      if (storedThinkingLevel) {
        mockOrchestrator.setThinkingLevel('default', storedThinkingLevel);
      }

      // Orchestrator should not be called
      expect(mockOrchestrator.setThinkingLevel).not.toHaveBeenCalled();
    });
  });

  describe('Session slot creation with thinking level preference', () => {
    it('applies workspace thinking level to new session slots', () => {
      const mockOrchestrator = {
        setThinkingLevel: vi.fn(),
      };

      const workspacePath = '/home/user/project';
      uiStateStore.setThinkingLevel(workspacePath, 'high');

      // Simulate new slot creation logic
      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels[workspacePath];

      if (storedThinkingLevel) {
        mockOrchestrator.setThinkingLevel('slot-2', storedThinkingLevel);
      }

      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledWith('slot-2', 'high');
    });

    it('applies thinking level to multiple new slots', () => {
      const mockOrchestrator = {
        setThinkingLevel: vi.fn(),
      };

      const workspacePath = '/project';
      uiStateStore.setThinkingLevel(workspacePath, 'low');

      const state = uiStateStore.loadState();
      const storedThinkingLevel = state.thinkingLevels[workspacePath];

      // Simulate creating multiple slots
      ['slot-1', 'slot-2', 'slot-3'].forEach((slotId) => {
        if (storedThinkingLevel) {
          mockOrchestrator.setThinkingLevel(slotId, storedThinkingLevel);
        }
      });

      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledTimes(3);
      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledWith('slot-1', 'low');
      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledWith('slot-2', 'low');
      expect(mockOrchestrator.setThinkingLevel).toHaveBeenCalledWith('slot-3', 'low');
    });
  });
});
