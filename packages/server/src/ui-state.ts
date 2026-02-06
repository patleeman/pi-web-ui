import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface UIState {
  openWorkspaces: string[];
  activeWorkspacePath: string | null;
  draftInputs: Record<string, string>;
  sidebarWidth: number;
  themeId: string | null;
  /** Maps workspace path to active session ID */
  activeSessions: Record<string, string>;
  /** Maps workspace path to selected model */
  activeModels: Record<string, { provider: string; modelId: string }>;
  /** Maps workspace path to thinking level */
  thinkingLevels: Record<string, ThinkingLevel>;
  /** Maps workspace path to right pane visibility */
  rightPaneByWorkspace: Record<string, boolean>;
}

const DEFAULT_STATE: UIState = {
  openWorkspaces: [],
  activeWorkspacePath: null,
  draftInputs: {},
  sidebarWidth: 224,
  themeId: null,
  activeSessions: {},
  activeModels: {},
  thinkingLevels: {},
  rightPaneByWorkspace: {},
};

/**
 * Manages UI state persistence with SQLite.
 * Single-user, no authentication needed.
 */
export class UIStateStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || join(homedir(), '.config', 'pi-web-ui', 'ui-state.db');
    
    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(path);
    this.init();
  }

  private init(): void {
    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ui_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Initialize default values if table is empty
    const count = this.db.prepare('SELECT COUNT(*) as count FROM ui_state').get() as { count: number };
    if (count.count === 0) {
      this.saveState(DEFAULT_STATE);
    }
  }

  private getValue(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM ui_state WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setValue(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO ui_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  /**
   * Load the full UI state
   */
  loadState(): UIState {
    const openWorkspacesRaw = this.getValue('openWorkspaces');
    const draftInputsRaw = this.getValue('draftInputs');
    const activeSessionsRaw = this.getValue('activeSessions');
    const activeModelsRaw = this.getValue('activeModels');
    const thinkingLevelsRaw = this.getValue('thinkingLevels');
    const rightPaneByWorkspaceRaw = this.getValue('rightPaneByWorkspace');
    
    return {
      openWorkspaces: openWorkspacesRaw ? JSON.parse(openWorkspacesRaw) : DEFAULT_STATE.openWorkspaces,
      activeWorkspacePath: this.getValue('activeWorkspacePath') || null,
      draftInputs: draftInputsRaw ? JSON.parse(draftInputsRaw) : DEFAULT_STATE.draftInputs,
      sidebarWidth: parseInt(this.getValue('sidebarWidth') || String(DEFAULT_STATE.sidebarWidth), 10),
      themeId: this.getValue('themeId') || null,
      activeSessions: activeSessionsRaw ? JSON.parse(activeSessionsRaw) : DEFAULT_STATE.activeSessions,
      activeModels: activeModelsRaw ? JSON.parse(activeModelsRaw) : DEFAULT_STATE.activeModels,
      thinkingLevels: thinkingLevelsRaw ? JSON.parse(thinkingLevelsRaw) : DEFAULT_STATE.thinkingLevels,
      rightPaneByWorkspace: rightPaneByWorkspaceRaw ? JSON.parse(rightPaneByWorkspaceRaw) : DEFAULT_STATE.rightPaneByWorkspace,
    };
  }

  /**
   * Save the full UI state
   */
  saveState(state: UIState): void {
    this.setValue('openWorkspaces', JSON.stringify(state.openWorkspaces));
    this.setValue('activeWorkspacePath', state.activeWorkspacePath || '');
    this.setValue('draftInputs', JSON.stringify(state.draftInputs));
    this.setValue('sidebarWidth', String(state.sidebarWidth));
    this.setValue('themeId', state.themeId || '');
    this.setValue('activeSessions', JSON.stringify(state.activeSessions));
    this.setValue('activeModels', JSON.stringify(state.activeModels));
    this.setValue('thinkingLevels', JSON.stringify(state.thinkingLevels));
    this.setValue('rightPaneByWorkspace', JSON.stringify(state.rightPaneByWorkspace));
  }

  /**
   * Update specific fields of UI state
   */
  updateState(updates: Partial<UIState>): UIState {
    const current = this.loadState();
    const updated = { ...current, ...updates };
    this.saveState(updated);
    return updated;
  }

  /**
   * Update just the open workspaces list
   */
  setOpenWorkspaces(paths: string[]): void {
    this.setValue('openWorkspaces', JSON.stringify(paths));
  }

  /**
   * Update just the active workspace
   */
  setActiveWorkspace(path: string | null): void {
    this.setValue('activeWorkspacePath', path || '');
  }

  /**
   * Update a single draft input
   */
  setDraftInput(workspacePath: string, value: string): void {
    const draftInputsRaw = this.getValue('draftInputs');
    const draftInputs = draftInputsRaw ? JSON.parse(draftInputsRaw) : {};
    
    if (value) {
      draftInputs[workspacePath] = value;
    } else {
      delete draftInputs[workspacePath];
    }
    
    this.setValue('draftInputs', JSON.stringify(draftInputs));
  }

  /**
   * Update sidebar width
   */
  setSidebarWidth(width: number): void {
    this.setValue('sidebarWidth', String(width));
  }

  /**
   * Update theme
   */
  setThemeId(themeId: string | null): void {
    this.setValue('themeId', themeId || '');
  }

  /**
   * Update active session for a workspace
   */
  setActiveSession(workspacePath: string, sessionId: string): void {
    const activeSessionsRaw = this.getValue('activeSessions');
    const activeSessions = activeSessionsRaw ? JSON.parse(activeSessionsRaw) : {};
    
    if (sessionId) {
      activeSessions[workspacePath] = sessionId;
    } else {
      delete activeSessions[workspacePath];
    }
    
    this.setValue('activeSessions', JSON.stringify(activeSessions));
  }

  /**
   * Get active session for a workspace
   */
  getActiveSession(workspacePath: string): string | null {
    const activeSessionsRaw = this.getValue('activeSessions');
    const activeSessions = activeSessionsRaw ? JSON.parse(activeSessionsRaw) : {};
    return activeSessions[workspacePath] || null;
  }

  /**
   * Update active model for a workspace
   */
  setActiveModel(workspacePath: string, provider: string, modelId: string): void {
    const activeModelsRaw = this.getValue('activeModels');
    const activeModels = activeModelsRaw ? JSON.parse(activeModelsRaw) : {};
    
    activeModels[workspacePath] = { provider, modelId };
    this.setValue('activeModels', JSON.stringify(activeModels));
  }

  /**
   * Update thinking level for a workspace
   */
  setThinkingLevel(workspacePath: string, level: ThinkingLevel): void {
    const thinkingLevelsRaw = this.getValue('thinkingLevels');
    const thinkingLevels = thinkingLevelsRaw ? JSON.parse(thinkingLevelsRaw) : {};
    
    thinkingLevels[workspacePath] = level;
    this.setValue('thinkingLevels', JSON.stringify(thinkingLevels));
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let storeInstance: UIStateStore | null = null;

export function getUIStateStore(): UIStateStore {
  if (!storeInstance) {
    storeInstance = new UIStateStore();
  }
  return storeInstance;
}
