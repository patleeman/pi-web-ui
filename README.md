# Pi-Deck

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
- 💾 **Persistent UI State** - Open workspaces, theme, sidebar width, and draft inputs are saved to the server and restored on any device

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Pi-Deck                               │
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
git clone https://github.com/patleeman/pi-deck.git
cd pi-deck

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

In production, the server serves both the API and the static frontend on port 3001.

---

## Running on a Mac mini with Tailscale

This section covers how to set up Pi-Deck as a persistent service on a Mac mini, accessible securely from anywhere via Tailscale.

### Why This Setup?

- **Always-on access**: Your coding agent runs 24/7 on your Mac mini
- **Secure remote access**: Tailscale provides encrypted, private networking without exposing ports to the internet
- **Access from any device**: Use Pi-Deck from your laptop, phone, or tablet anywhere in the world

### Step 1: Install Tailscale on Your Mac mini

1. Download Tailscale from the [Mac App Store](https://apps.apple.com/app/tailscale/id1475387142) or [tailscale.com](https://tailscale.com/download)
2. Open Tailscale and sign in
3. Your Mac mini will get a Tailscale IP (e.g., `100.x.y.z`) and hostname (e.g., `mac-mini.tailnet-name.ts.net`)

### Step 2: Install Pi-Deck

```bash
# Clone the repo
git clone https://github.com/patleeman/pi-deck.git
cd pi-deck

# Install dependencies
npm install

# Build for production
npm run build
```

### Step 3: Configure Allowed Directories

Create a config file to control which directories can be accessed:

```bash
# Create config directory
mkdir -p ~/.config/pi-deck

# Create config file
cat > ~/.config/pi-deck/config.json << 'EOF'
{
  "port": 3001,
  "host": "0.0.0.0",
  "allowedDirectories": [
    "~/projects",
    "~/code",
    "~/work"
  ]
}
EOF
```

Edit `allowedDirectories` to match your project locations.

### Step 4: Install as a Background Service

Install Pi-Deck as a launchd service that starts automatically on boot:

```bash
npm run service:install
```

This creates a persistent service that:
- Starts automatically when you log in
- Restarts if it crashes
- Logs to `~/Library/Logs/pi-deck/`

### Step 5: Access from Other Devices

1. Install Tailscale on your other devices (laptop, phone, etc.)
2. Sign in with the same account
3. Access Pi-Deck at: `http://mac-mini:3001` or `http://100.x.y.z:3001`

Replace `mac-mini` with your Mac mini's Tailscale hostname.

### Service Management

```bash
# Check status
launchctl list | grep pi-deck

# View logs
tail -f ~/Library/Logs/pi-deck/stdout.log

# Restart after config changes
launchctl stop com.pi-deck.server
launchctl start com.pi-deck.server

# Uninstall
npm run service:uninstall
```

### Optional: Auto-Updates

Set up automatic updates from git:

```bash
npm run update:install
```

This checks for updates every 5 minutes and automatically rebuilds/restarts if changes are detected.

### Customization

#### Change the Port

Edit your config file or set an environment variable:

```bash
# In config.json
{
  "port": 8080,
  ...
}

# Or via environment (requires editing the launchd plist)
```

#### Restrict to Localhost Only

If you want to disable network access and only allow local connections:

```json
{
  "host": "127.0.0.1",
  ...
}
```

#### Multiple Allowed Directories

Add as many project directories as needed:

```json
{
  "allowedDirectories": [
    "~/projects",
    "~/work",
    "/Volumes/External/repos",
    "/opt/development"
  ]
}
```

---

## Configuration Reference

### Config File Locations

Create `pi-deck.config.json` in one of these locations (checked in order):

1. Current working directory
2. `~/.config/pi-deck/config.json`
3. `~/.pi-deck.config.json`

### Config Options

```json
{
  "port": 3001,
  "host": "0.0.0.0",
  "allowedDirectories": [
    "~/projects",
    "~/code"
  ]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `port` | 3001 | Server port |
| `host` | 0.0.0.0 | Bind address (`127.0.0.1` for localhost only) |
| `allowedDirectories` | Home directory | Directories accessible via the UI |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Backend server port |
| `HOST` | 0.0.0.0 | Host to bind to |
| `PI_ALLOWED_DIRS` | Home directory | Colon-separated list of allowed directories |

Example:
```bash
PI_ALLOWED_DIRS="~/projects:~/work" PORT=8080 npm start
```

### API Keys

API keys are read from standard locations:
- Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- Pi's auth storage (`~/.pi/agent/auth.json`)

### Data Storage

UI state is persisted to SQLite at:
```
~/.config/pi-deck/ui-state.db
```

**Persisted state includes:**
- Open workspaces
- Active workspace and session
- Selected model per workspace
- Thinking level per workspace
- Sidebar width
- Theme
- Draft inputs

---

## Background Service Options

### Option 1: launchd Service (Recommended)

For persistent service that starts on login:

```bash
npm run service:install    # Install and start
npm run service:uninstall  # Remove
```

### Option 2: Simple Background Process

For quick testing without auto-start:

```bash
npm run background:start   # Start
npm run background:stop    # Stop
npm run background:status  # Check status
npm run background:logs    # View logs
```

---

## Project Structure

```
pi-deck/
├── packages/
│   ├── shared/                    # Shared types
│   │   └── src/
│   │       └── index.ts           # WebSocket protocol types
│   ├── server/                    # Node.js backend
│   │   └── src/
│   │       ├── index.ts           # Express + WebSocket server
│   │       ├── config.ts          # Configuration loading
│   │       ├── directory-browser.ts
│   │       ├── session-orchestrator.ts
│   │       ├── pi-session.ts
│   │       └── ui-state.ts
│   └── client/                    # React frontend
│       └── src/
│           ├── App.tsx
│           ├── hooks/
│           └── components/
├── scripts/                       # Service management scripts
│   ├── install-service.sh         # Install launchd service
│   ├── uninstall-service.sh       # Remove launchd service
│   ├── start-background.sh        # Simple background process
│   ├── deploy.sh                  # Build and restart
│   ├── auto-update.sh             # Git pull and rebuild
│   └── install-auto-update.sh     # Install auto-update job
├── pi-deck.config.example.json
├── package.json
└── README.md
```

---

## Usage

### Opening Workspaces

1. Click "+ dir" in the workspace tabs or press `⌘O` / `Ctrl+O`
2. Navigate the directory browser (only allowed directories are shown)
3. Click `[open]` to open a directory as a workspace
4. The workspace opens in a new tab

### Managing Workspaces

- Click tabs to switch between workspaces
- Each workspace maintains its own chat history, session state, and settings
- Close workspaces with the × button
- Activity indicator shows which workspaces are streaming

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `⌘O` / `Ctrl+O` | Open directory browser |
| `⌘,` / `Ctrl+,` | Open settings |
| `⌘?` / `Ctrl+?` | Show hotkeys |
| `⌘Enter` | Send message |
| `Escape` | Close dialogs |

---

## Theming

The UI includes multiple themes. Change via Settings (`⌘,`) or the theme selector.

To customize colors, modify `packages/client/src/themes.ts`.

---

## Security Notes

- The allowlist controls which directories can be accessed through the web UI
- By default, only the user's home directory is allowed
- Tailscale provides secure, encrypted access without exposing ports to the public internet
- For additional security, consider:
  - Restricting the allowlist to specific project directories
  - Using Tailscale ACLs to limit which devices can access the Mac mini

---

## License

MIT
