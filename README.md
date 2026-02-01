# Pi Web UI

A full-featured web interface for [Pi](https://github.com/badlogic/pi-mono), the terminal coding agent.

## Features

- 📁 **Multi-Workspace Support** - Open multiple directories simultaneously with tab-based navigation
- 🔒 **Directory Allowlist** - Secure access control for which directories can be opened
- 💬 **Real-time Chat** - Streaming responses with markdown rendering
- 🧠 **Thinking Display** - Collapsible thinking blocks for reasoning models
- 🔧 **Tool Visualization** - Live tool execution with streaming output
- 📁 **Session Management** - Switch between sessions, create new ones
- 🎯 **Model Selection** - Switch between available models on the fly
- 🖼️ **Image Support** - Paste or drag images to include in prompts
- ⚡ **Steering & Follow-up** - Interrupt or queue messages during streaming

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Pi Web UI                               │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   React Frontend    │◄──►│     Node.js Backend         │ │
│  │   (Vite + TS)       │ WS │     (Express + Pi SDK)      │ │
│  │   port 3000 (dev)   │    │     port 3001               │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Session Orchestrator                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │   │
│  │  │Workspace1│ │Workspace2│ │Workspace3│ ...         │   │
│  │  │/proj/foo │ │/proj/bar │ │~/code/baz│             │   │
│  │  └──────────┘ └──────────┘ └──────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Express + WebSocket + Pi SDK
- **Communication**: WebSocket for real-time streaming
- **Orchestration**: Multi-workspace session management

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Pi installed globally: `npm install -g @mariozechner/pi-coding-agent`
- An API key configured (e.g., `ANTHROPIC_API_KEY`)

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/pi-web-ui.git
cd pi-web-ui

# Install dependencies
npm install

# Start development servers
npm run dev
```

This starts:
- Frontend at http://localhost:3000
- Backend at http://localhost:3001

### Production Build

```bash
npm run build
npm start
```

### Running as a Background Service (macOS)

#### Option 1: launchd Service (Recommended)

Install as a persistent service that starts automatically on login:

```bash
npm run service:install
```

This creates a launchd service that:
- Starts automatically when you log in
- Restarts if it crashes
- Logs to `~/Library/Logs/pi-web-ui/`

Service management:
```bash
# Start/stop manually
launchctl start com.pi-web-ui.server
launchctl stop com.pi-web-ui.server

# View status
launchctl list | grep pi-web-ui

# View logs
tail -f ~/Library/Logs/pi-web-ui/stdout.log

# Uninstall
npm run service:uninstall
```

#### Option 2: Simple Background Process

For quick testing without auto-start:

```bash
npm run background:start   # Start server in background
npm run background:stop    # Stop server
npm run background:status  # Check if running
npm run background:logs    # Tail the logs
```

## Configuration

### Config File

Create `pi-web-ui.config.json` in one of these locations:
- Current working directory
- `~/.config/pi-web-ui/config.json`
- `~/.pi-web-ui.config.json`

Example configuration:

```json
{
  "port": 3001,
  "allowedDirectories": [
    "~/projects",
    "~/code",
    "/work/repos"
  ]
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Backend server port |
| `PI_ALLOWED_DIRS` | Home directory | Colon-separated list of allowed directories |

Example:
```bash
PI_ALLOWED_DIRS="~/projects:~/work:/opt/repos" npm start
```

### Security

**Important**: The allowlist controls which directories can be accessed through the web UI. By default, only the user's home directory is allowed.

For untrusted networks, you should:
1. Configure a restrictive allowlist
2. Use a reverse proxy with authentication
3. Consider running behind a VPN

API keys are read from the standard locations:
- Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- Pi's auth storage (`~/.pi/agent/auth.json`)

## Project Structure

```
pi-web-ui/
├── packages/
│   ├── shared/                    # Shared types
│   │   └── src/
│   │       └── index.ts           # WebSocket protocol types
│   ├── server/                    # Node.js backend
│   │   └── src/
│   │       ├── index.ts           # Express + WebSocket server
│   │       ├── config.ts          # Configuration loading
│   │       ├── directory-browser.ts # Directory browsing
│   │       ├── session-orchestrator.ts # Multi-workspace management
│   │       └── pi-session.ts      # Pi SDK integration
│   └── client/                    # React frontend
│       └── src/
│           ├── App.tsx
│           ├── hooks/
│           │   └── useWorkspaces.ts  # Multi-workspace state
│           └── components/
│               ├── ChatView.tsx
│               ├── DirectoryBrowser.tsx
│               ├── WorkspaceTabs.tsx
│               ├── MessageBubble.tsx
│               ├── InputEditor.tsx
│               └── ...
├── pi-web-ui.config.example.json  # Example config
├── package.json                   # Monorepo root
└── README.md
```

## WebSocket Protocol

The client and server communicate via WebSocket with JSON messages.

### Client → Server

#### Workspace Management
| Message | Description |
|---------|-------------|
| `openWorkspace` | Open a directory as a workspace |
| `closeWorkspace` | Close a workspace |
| `listWorkspaces` | Get list of open workspaces |
| `browseDirectory` | Browse directory contents |

#### Session Operations (require `workspaceId`)
| Message | Description |
|---------|-------------|
| `prompt` | Send a user message |
| `steer` | Interrupt agent with new instruction |
| `followUp` | Queue message for after agent finishes |
| `abort` | Cancel current operation |
| `setModel` | Change the model |
| `setThinkingLevel` | Change thinking level |
| `newSession` | Start a new session |
| `switchSession` | Switch to different session |
| `compact` | Manually trigger compaction |

### Server → Client

| Event | Description |
|-------|-------------|
| `connected` | Initial connection with allowed roots |
| `workspaceOpened` | Workspace opened with initial state |
| `workspaceClosed` | Workspace was closed |
| `directoryList` | Directory browser results |
| `state` | State update (includes `workspaceId`) |
| `messages` | Full message list |
| `agentStart/End` | Agent lifecycle |
| `messageStart/Update/End` | Message streaming |
| `toolStart/Update/End` | Tool execution |
| `error` | Error notification |

## Usage

### Opening Workspaces

1. Click "+ dir" in the workspace tabs or press `⌘O` / `Ctrl+O`
2. Navigate the directory browser (only allowed directories are shown)
3. Click `[open]` on a directory or `[open here]` to open the current location
4. The workspace opens in a new tab

### Managing Multiple Workspaces

- Click tabs to switch between open workspaces
- Each workspace maintains its own:
  - Chat history
  - Session state
  - Model settings
  - Streaming state
- Close workspaces with the × button on the tab
- Activity indicator shows which workspaces are streaming

### Directory Browser

- Shows only directories (not files)
- `●` indicator shows directories with existing Pi sessions
- Navigate with click, go back with `..`
- Respects the allowlist - directories outside allowed paths are hidden

## Customization

### Theming

The UI uses TailwindCSS with a custom Pi-inspired color scheme. Modify `tailwind.config.js` to customize:

```js
colors: {
  pi: {
    bg: '#0d0d0d',
    surface: '#1a1a1a',
    accent: '#7c3aed',
    // ...
  }
}
```

### Adding Features

The modular architecture makes it easy to extend:

1. **New commands**: Add to `WsClientMessage` type and handle in server
2. **New UI components**: Add to `components/` and integrate in `App.tsx`
3. **Custom tools**: Register via Pi's extension system

## License

MIT
