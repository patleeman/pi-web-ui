#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join, resolve, extname } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { execSync, fork } from 'child_process';
import { createServer, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const bundledServer = join(ROOT, 'dist/server.js');
const clientDist = join(ROOT, 'packages/client/dist');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const subcommand = args[0] && !args[0].startsWith('-') ? args[0] : null;
const restArgs = subcommand ? args.slice(1) : args;

function hasFlag(name) {
  return restArgs.includes(name);
}

function getFlagValue(name) {
  const idx = restArgs.indexOf(name);
  return idx !== -1 ? restArgs[idx + 1] : undefined;
}

const helpFlag = hasFlag('--help') || hasFlag('-h');

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

switch (subcommand) {
  case 'server':
    if (helpFlag) { showServerHelp(); process.exit(0); }
    startServer();
    break;
  case 'client':
    if (helpFlag) { showClientHelp(); process.exit(0); }
    startClient();
    break;
  case null:
    if (helpFlag) { showMainHelp(); process.exit(0); }
    startServer(); // backward-compatible default
    break;
  default:
    console.error(`[pi-deck] Unknown command: ${subcommand}\n`);
    showMainHelp();
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function showMainHelp() {
  console.log(`
  pi-deck - Web UI for Pi coding agent

  Usage:
    pi-deck [options]            Start server (default)
    pi-deck server [options]     Start the API server
    pi-deck client [options]     Start a local client connecting to a remote server

  Commands:
    server    Start the Pi-Deck server (API + WebSocket + serves client UI)
    client    Start a local client UI that proxies to a remote server

  Run 'pi-deck <command> --help' for command-specific options.
`);
}

function showServerHelp() {
  console.log(`
  pi-deck server - Start the API server

  Usage:
    pi-deck server [options]

  Options:
    --build       Build before starting (if not already built)
    --port <n>    Override server port (default: 9741)
    -h, --help    Show this help message

  The server serves the built client UI and exposes the WebSocket API.
  Run 'npm run build' in the project root first, or use --build.
`);
}

function showClientHelp() {
  console.log(`
  pi-deck client - Start a local client connected to a remote server

  Usage:
    pi-deck client --server <url> [options]

  Options:
    --server <url>   URL of the Pi-Deck server (required, e.g. http://remote:9741)
    --port <n>       Local port for the client (default: 9740)
    -h, --help       Show this help message

  Examples:
    pi-deck client --server http://my-pod:9741
    pi-deck client --server https://workspace.example.com:9741 --port 8080
`);
}

// ---------------------------------------------------------------------------
// Server mode (default)
// ---------------------------------------------------------------------------

function startServer() {
  const buildFlag = hasFlag('--build');
  const portValue = getFlagValue('--port');

  const serverBuilt = existsSync(bundledServer);
  const clientBuilt = existsSync(clientDist);

  if (!serverBuilt || !clientBuilt) {
    if (buildFlag) {
      console.log('[pi-deck] Building project...');
      try {
        execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
      } catch {
        console.error('[pi-deck] Build failed. Fix errors and retry.');
        process.exit(1);
      }
    } else {
      if (!serverBuilt) console.error(`[pi-deck] Server not built. Missing: ${bundledServer}`);
      if (!clientBuilt) console.error(`[pi-deck] Client not built. Missing: ${clientDist}`);
      console.error('[pi-deck] Run "npm run build" first, or use "pi-deck --build".');
      process.exit(1);
    }
  }

  if (portValue) {
    process.env.PORT = portValue;
  }

  // Tell the bundled server where the client dist lives
  process.env.PI_DECK_CLIENT_DIST = clientDist;

  // Pass version so the bundled server doesn't need to find package.json
  const pkgJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  process.env.PI_DECK_VERSION = pkgJson.version;

  console.log('[pi-deck] Starting server...');
  const child = fork(bundledServer, [], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}

// ---------------------------------------------------------------------------
// Client mode — lightweight static server + WebSocket proxy
// ---------------------------------------------------------------------------

function startClient() {
  const serverUrl = getFlagValue('--server');
  const port = parseInt(getFlagValue('--port') || '9740', 10);

  if (!serverUrl) {
    console.error('[pi-deck] --server <url> is required for client mode.');
    console.error('[pi-deck] Example: pi-deck client --server http://remote:9741');
    process.exit(1);
  }

  if (!existsSync(clientDist)) {
    console.error(`[pi-deck] Client not built. Missing: ${clientDist}`);
    console.error('[pi-deck] Run "npm run build" first, or use "pi-deck server --build".');
    process.exit(1);
  }

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
  };

  const parsed = new URL(serverUrl);
  const isHttps = parsed.protocol === 'https:';
  const remoteHost = parsed.hostname;
  const remotePort = parseInt(parsed.port || (isHttps ? '443' : '80'), 10);
  const doRequest = isHttps ? httpsRequest : httpRequest;

  // ---- HTTP: serve static files, proxy /health to remote ----

  const httpServer = createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    // Proxy /health to remote server
    if (urlPath === '/health') {
      const proxyReq = doRequest({
        hostname: remoteHost,
        port: remotePort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${remoteHost}:${remotePort}` },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => {
        res.writeHead(502);
        res.end('Bad Gateway — cannot reach server');
      });
      req.pipe(proxyReq);
      return;
    }

    // Serve static files from client dist
    let filePath = join(clientDist, urlPath === '/' ? 'index.html' : urlPath);

    // SPA fallback — if file doesn't exist, serve index.html
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(clientDist, 'index.html');
    }

    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // ---- WebSocket: proxy /ws upgrade to remote server ----

  httpServer.on('upgrade', (req, clientSocket, head) => {
    if (req.url !== '/ws') {
      clientSocket.destroy();
      return;
    }

    const proxyReq = doRequest({
      hostname: remoteHost,
      port: remotePort,
      path: '/ws',
      method: 'GET',
      headers: {
        ...req.headers,
        host: `${remoteHost}:${remotePort}`,
      },
    });

    proxyReq.on('upgrade', (_proxyRes, proxySocket, proxyHead) => {
      // Forward the raw 101 response headers back to the client
      let response = 'HTTP/1.1 101 Switching Protocols\r\n';
      for (const [key, value] of Object.entries(_proxyRes.headers)) {
        if (value != null) {
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) {
            response += `${key}: ${v}\r\n`;
          }
        }
      }
      response += '\r\n';

      clientSocket.write(response);
      if (proxyHead.length) clientSocket.write(proxyHead);
      if (head.length) proxySocket.write(head);

      // Bi-directional pipe
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);

      proxySocket.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => proxySocket.destroy());
    });

    proxyReq.on('error', (err) => {
      console.error('[pi-deck] WebSocket proxy error:', err.message);
      clientSocket.destroy();
    });

    proxyReq.end();
  });

  // ---- Start listening ----

  httpServer.listen(port, () => {
    console.log('[pi-deck] Client mode');
    console.log(`  Local:  http://localhost:${port}`);
    console.log(`  Server: ${serverUrl}`);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      httpServer.close();
      process.exit(0);
    });
  }
}
