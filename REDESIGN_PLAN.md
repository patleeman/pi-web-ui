# Pi Web UI Redesign Plan

**Status:** ✅ COMPLETE  
**Started:** 2026-01-31  
**Last Updated:** 2026-01-31

## Summary

TUI-style web interface with multi-pane support. No sidebar - sessions accessed via `/resume` command.

### What's Working
- Multi-pane layout with vertical/horizontal splits (up to 4 panes)
- Resizable pane dividers
- Slash commands (pane: /split, /hsplit, /close, /stop + backend commands from pi)
- `/resume` command to load previous sessions
- `/new` command for new sessions
- `/fork` command to fork from a previous message
- Model selector in pane header
- Thinking level selector in pane header
- TUI-style tool call display with collapsible results
- Thinking trace display (collapsible)
- Steering mode when agent is running
- Questionnaire UI for agent questions
- Markdown rendering with syntax highlighting (lazy-loaded)
- Image drag-drop attachments
- Theme system (7 themes)
- Settings dialog (⌘,)
- Notifications when agent completes
- Mobile: single pane mode

### Architecture
- No session sidebar - sessions via `/resume`
- Pane header shows: status dot, title, model selector, thinking level
- Backend slash commands merged with UI commands
- Questionnaire displayed inline when agent asks

### Key Components
- `App.tsx` - Main layout
- `PaneManager.tsx` - Multi-pane container
- `Pane.tsx` - Individual pane with header, messages, input
- `MessageList.tsx` - TUI-style message display
- `QuestionnaireUI.tsx` - Inline questionnaire
- `SlashMenu.tsx` - Command autocomplete
- `ForkDialog.tsx` - Fork from message
- `Settings.tsx` - Theme, notifications, deploy

### Bundle Sizes
- Main: ~262KB gzip: ~80KB
- Markdown: ~807KB (lazy-loaded)
