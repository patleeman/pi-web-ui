# Pi-Deck

A web interface for [Pi](https://github.com/badlogic/pi-mono), the terminal coding agent. This is a personal project I built for my own workflow — it lets me use Pi from a browser instead of the terminal, with multi-workspace support so I can manage several projects at once.

> **Note:** This is personal tooling, not a general-purpose product. It works for my setup and I make no guarantees about stability, compatibility, or support. Feel free to fork or take ideas from it.

## Features

- **Multi-workspace tabs** — open multiple project directories side by side
- **Real-time streaming** — chat with Pi via WebSocket, see responses as they arrive
- **Tool visualization** — watch tool calls execute with live output
- **Thinking blocks** — collapsible display for reasoning model internals
- **Session management** — switch between sessions, pick models per workspace
- **Image support** — paste or drag images into prompts
- **Persistent state** — open workspaces, theme, and drafts sync across devices via SQLite
- **Directory allowlist** — control which directories are accessible from the UI

## Stack

- **Frontend:** React 19, Vite, TailwindCSS
- **Backend:** Express, WebSocket, Pi SDK
- **Storage:** SQLite for UI state

## Setup

Requires Node.js 20+, Pi installed globally (`npm install -g @mariozechner/pi-coding-agent`), and an API key configured (e.g. `ANTHROPIC_API_KEY`).

```bash
npm install
npm run dev       # dev: frontend on :3000, backend on :3001
npm run build     # production build
npm start         # production: serves everything on :3001
```

## Configuration

Create a config file at `~/.config/pi-deck/config.json`:

```json
{
  "port": 3001,
  "host": "0.0.0.0",
  "allowedDirectories": ["~/projects", "~/code"]
}
```

Or use environment variables: `PORT`, `HOST`, `PI_ALLOWED_DIRS` (colon-separated).

## Running as a service

I run this on a Mac mini with Tailscale for always-on access from any device.

```bash
npm run service:install    # install as launchd service (starts on login)
npm run service:uninstall  # remove it
```

Logs go to `~/Library/Logs/pi-deck/`.

## License

MIT
