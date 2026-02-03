# Pi Web UI Test Plan

**Status**: 🔄 IN PROGRESS  
**Started**: 2026-02-02 21:50 EST  
**Last Updated**: 2026-02-02 22:05 EST

---

## ⚠️ CRITICAL INSTRUCTION FOR AGENT ⚠️

**YOU MUST CONTINUE WORKING ON THIS PLAN UNTIL IT IS 100% COMPLETE. DO NOT STOP.**

After every compaction or context reset:
1. Read this file first
2. Check the progress tracker to see what's done and what's next
3. Continue from where you left off
4. Commit and push progress regularly
5. Update the "Last Updated" timestamp and Work Log

**THE USER EXPECTS THIS TO BE FULLY COMPLETE BY MORNING. KEEP GOING.**

---

## Progress Tracker

### Phase 1: Test Infrastructure Setup
- [x] Install dependencies (Playwright, Vitest, testing-library, mock-socket)
- [x] Create vitest.config.ts for client
- [x] Create vitest.config.ts for server
- [x] Create playwright.config.ts
- [x] Create mock Pi SDK factory
- [x] Create mock WebSocket utilities
- [x] Create test fixtures (messages, workspaces)
- [x] Add test scripts to package.json

### Phase 2: Unit Tests (25 files)

**Client Components:**
- [x] `StatusBar.test.tsx` - State display, git info, context usage
- [ ] `Pane.test.tsx` - Input handling, message display, mode indicators, toolbar actions
- [ ] `MessageList.test.tsx` - Message rendering, tool call display, streaming state
- [ ] `MarkdownContent.test.tsx` - Markdown rendering, code blocks, syntax highlighting
- [ ] `DiffDisplay.test.tsx` - Diff parsing, line highlighting
- [ ] `SlashMenu.test.tsx` - Command filtering, selection, keyboard nav
- [ ] `QuestionnaireUI.test.tsx` - Question rendering, answer submission
- [ ] `ExtensionUIDialog.test.tsx` - Select, confirm, input, editor dialogs
- [ ] `TreeDialog.test.tsx` - Tree rendering, navigation
- [ ] `ScopedModelsDialog.test.tsx` - Model selection, toggle states
- [ ] `DirectoryBrowser.test.tsx` - File listing, navigation, selection
- [ ] `WorkspaceTabs.test.tsx` - Tab switching, close buttons
- [ ] `Settings.test.tsx` - Toggle states, deploy actions
- [ ] `HotkeysDialog.test.tsx` - Shortcut rendering
- [ ] `ForkDialog.test.tsx` - Message selection, fork action
- [ ] `StartupDisplay.test.tsx` - Info rendering

**Client Hooks:**
- [ ] `useWorkspaces.test.ts` - WebSocket connection, message handling, state updates
- [ ] `usePanes.test.ts` - Layout management, pane CRUD
- [ ] `useNotifications.test.ts` - Permission handling, notification display
- [ ] `useIsMobile.test.ts` - Responsive detection
- [ ] `useKeyboardVisible.test.ts` - Keyboard state on mobile

**Server:**
- [ ] `pi-session.test.ts` - Event emission, state management, all session methods
- [ ] `session-orchestrator.test.ts` - Multi-slot management, event routing
- [ ] `workspace-manager.test.ts` - Workspace lifecycle, persistence
- [ ] `web-extension-ui.test.ts` - Request/response handling, timeouts

### Phase 3: Integration Tests (10 files)
- [ ] `websocket-api.test.ts` - All message types and responses
- [ ] `session-lifecycle.test.ts` - Create → prompt → stream → complete
- [ ] `multi-workspace.test.ts` - Open multiple, switch, close
- [ ] `multi-pane.test.ts` - Split, focus, sync state
- [ ] `tool-execution.test.ts` - Tool call → result → display
- [ ] `bash-execution.test.ts` - Command → streaming output → completion
- [ ] `questionnaire-flow.test.ts` - Request → render → response
- [ ] `extension-ui-flow.test.ts` - Request → dialog → response
- [ ] `state-persistence.test.ts` - Save → reload → restore
- [ ] `model-switching.test.ts` - Cycle, set, verify

### Phase 4: E2E Tests (15 files)
- [ ] `workspace.spec.ts` - Open workspace, browse directories, close workspace
- [ ] `chat-basic.spec.ts` - Send message, receive response, see streaming
- [ ] `chat-steering.spec.ts` - Steer while streaming, follow-up mode
- [ ] `tool-calls.spec.ts` - Tool execution display, expand/collapse, copy
- [ ] `bash.spec.ts` - Run bash command (! and !!), see output
- [ ] `sessions.spec.ts` - New session, switch session, fork session
- [ ] `models.spec.ts` - Change model, cycle model (Ctrl+P), thinking level
- [ ] `panes.spec.ts` - Split pane, focus pane, close pane
- [ ] `keyboard.spec.ts` - All keyboard shortcuts work
- [ ] `slash-commands.spec.ts` - Trigger menu, filter, select command
- [ ] `questionnaire.spec.ts` - Answer questions, cancel
- [ ] `extension-ui.spec.ts` - Select, confirm, input, editor dialogs
- [ ] `settings.spec.ts` - Toggle modes, deploy/restart
- [ ] `mobile.spec.ts` - Touch interactions, responsive layout
- [ ] `error-recovery.spec.ts` - Disconnect/reconnect, abort, retry

---

## Work Log

### 2026-02-02 21:50 EST
- Created test plan
- Starting Phase 1: Infrastructure setup

### 2026-02-02 22:05 EST
- Completed Phase 1: Infrastructure setup
- Created vitest configs for client and server
- Created playwright config
- Created mock WebSocket and Pi SDK
- Created test fixtures
- Added test scripts to package.json
- Wrote first unit test (StatusBar) - 10 tests passing
- Starting Phase 2: Unit Tests

