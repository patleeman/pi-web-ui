# Pi Web UI

A full-featured web interface for [Pi](https://github.com/badlogic/pi-mono), the terminal coding agent.

## Features

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
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Express + WebSocket + Pi SDK
- **Communication**: WebSocket for real-time streaming

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

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Backend server port |
| `PI_CWD` | `process.cwd()` | Working directory for Pi |

API keys are read from the standard locations:
- Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- Pi's auth storage (`~/.pi/agent/auth.json`)

## Project Structure

```
pi-web-ui/
├── packages/
│   ├── shared/           # Shared types
│   │   └── src/
│   │       └── index.ts  # WebSocket protocol types
│   ├── server/           # Node.js backend
│   │   └── src/
│   │       ├── index.ts      # Express + WebSocket server
│   │       └── pi-session.ts # Pi SDK integration
│   └── client/           # React frontend
│       └── src/
│           ├── App.tsx
│           ├── hooks/
│           │   └── useWebSocket.ts
│           └── components/
│               ├── ChatView.tsx
│               ├── MessageBubble.tsx
│               ├── InputEditor.tsx
│               └── ...
├── package.json          # Monorepo root
└── README.md
```

## WebSocket Protocol

The client and server communicate via WebSocket with JSON messages.

### Client → Server

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
| `connected` | Initial connection with state |
| `state` | State update |
| `messages` | Full message list |
| `agentStart/End` | Agent lifecycle |
| `messageStart/Update/End` | Message streaming |
| `toolStart/Update/End` | Tool execution |
| `error` | Error notification |

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
