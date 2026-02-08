import { existsSync, readFileSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname, join } from 'path';

export interface ServerConfig {
  port: number;
  host: string;
  allowedDirectories: string[];
}

/**
 * Find project root by looking for .git, package.json with workspaces, or .pi directory
 */
function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  const root = resolve('/');
  
  while (dir !== root) {
    // Check for .git (most reliable project root indicator)
    if (existsSync(join(dir, '.git'))) {
      return dir;
    }
    // Check for package.json with workspaces (monorepo root)
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // Ignore parse errors
      }
    }
    // Check for .pi directory (Pi session root)
    if (existsSync(join(dir, '.pi'))) {
      return dir;
    }
    
    dir = dirname(dir);
  }
  
  // Fallback to original directory
  return startDir;
}

const projectRoot = findProjectRoot(process.cwd());

const DEFAULT_CONFIG: ServerConfig = {
  port: 9741,
  host: '0.0.0.0',
  // Default to detected project root, then home as fallback
  allowedDirectories: [projectRoot, homedir()],
};

const CONFIG_PATHS = [
  resolve(process.cwd(), 'pi-deck.config.json'),
  resolve(homedir(), '.config', 'pi-deck', 'config.json'),
  resolve(homedir(), '.pi-deck.config.json'),
];

function loadConfigFromFile(): Partial<ServerConfig> {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        console.log(`[Config] Loaded from ${configPath}`);
        return parsed;
      } catch (error) {
        console.warn(`[Config] Failed to parse ${configPath}:`, error);
      }
    }
  }
  return {};
}

function loadConfigFromEnv(): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {};

  if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
  }

  if (process.env.HOST) {
    config.host = process.env.HOST;
  }

  if (process.env.PI_ALLOWED_DIRS) {
    config.allowedDirectories = process.env.PI_ALLOWED_DIRS.split(':').map((d) =>
      resolve(d.replace(/^~/, homedir()))
    );
  }

  return config;
}

const TILDE_PREFIX = /^~(?=\/|$)/;

export function canonicalizePath(input: string): string {
  const normalized = resolve(input.replace(TILDE_PREFIX, homedir()));
  try {
    return realpathSync(normalized);
  } catch {
    return normalized;
  }
}

function normalizeDirectories(dirs: string[]): string[] {
  return dirs.map((d) => canonicalizePath(d));
}

export function loadConfig(): ServerConfig {
  const fileConfig = loadConfigFromFile();
  const envConfig = loadConfigFromEnv();

  const config: ServerConfig = {
    port: envConfig.port ?? fileConfig.port ?? DEFAULT_CONFIG.port,
    host: envConfig.host ?? fileConfig.host ?? DEFAULT_CONFIG.host,
    allowedDirectories: normalizeDirectories(
      envConfig.allowedDirectories ?? fileConfig.allowedDirectories ?? DEFAULT_CONFIG.allowedDirectories
    ),
  };

  console.log('[Config] Allowed directories:', config.allowedDirectories);
  return config;
}

export function isPathAllowed(path: string, allowedDirectories: string[]): boolean {
  const normalizedPath = canonicalizePath(path);
  return allowedDirectories.some((allowed) => {
    const normalizedAllowed = canonicalizePath(allowed);
    return normalizedPath === normalizedAllowed || normalizedPath.startsWith(normalizedAllowed + '/');
  });
}
