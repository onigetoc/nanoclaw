/**
 * OpenCode Server Supervisor
 *
 * Manages the lifecycle of the `opencode serve` process:
 * - Starts the server if not running
 * - Periodic health checks via HTTP
 * - Auto-restarts on crash or unresponsive state
 * - Graceful shutdown
 */
import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import net from 'net';

import { logger } from './logger.js';
import { getOpenCodeEnv, getModelInfo } from './opencode-config.js';

let OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '4100', 10);
const OPENCODE_HOST = '127.0.0.1';

/**
 * Get the current OpenCode server port.
 * This may change at runtime if the preferred port is occupied.
 */
export function getOpenCodePort(): number {
  return OPENCODE_PORT;
}

/**
 * Get the current OpenCode server host.
 */
export function getOpenCodeHost(): string {
  return OPENCODE_HOST;
}

/**
 * Check if a port is occupied by a zombie process (port in use but process doesn't exist).
 * Returns true if it's a zombie, false otherwise.
 */
async function isZombiePort(port: number): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false; // Only relevant on Windows
  }
  
  try {
    const { execSync } = await import('child_process');
    
    // Find PID listening on the port
    const netstatOutput = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, {
      encoding: 'utf-8',
      timeout: 5000
    }).trim();
    
    if (!netstatOutput) {
      return false; // Port not in use
    }
    
    // Extract PID from netstat output
    const match = netstatOutput.match(/\s+(\d+)\s*$/);
    if (!match) {
      return false;
    }
    
    const pid = match[1];
    
    // Check if process exists
    try {
      execSync(`tasklist /FI "PID eq ${pid}" | findstr "${pid}"`, {
        encoding: 'utf-8',
        timeout: 5000
      });
      return false; // Process exists, not a zombie
    } catch {
      logger.warn({ port, pid }, 'Detected zombie port (process does not exist)');
      return true; // Process doesn't exist = zombie
    }
  } catch {
    return false;
  }
}

/**
 * Check if any OpenCode server is already running by looking for the process.
 * Returns the port it's listening on, or null if not found.
 */
async function findRunningOpenCodeServer(): Promise<number | null> {
  try {
    // Try to find opencode process and extract port from command line
    const { execSync } = await import('child_process');
    
    // Windows: use wmic or Get-Process
    if (process.platform === 'win32') {
      try {
        const output = execSync('powershell -Command "Get-Process opencode -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"', {
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
        
        if (output) {
          // Found opencode process, try to find which port it's using
          // Check common ports first
          for (const port of [4096, 4097, 4098, 4099, 4100]) {
            if (await pingServerOnPort(port)) {
              logger.info({ port }, 'Found existing OpenCode server');
              return port;
            }
          }
        }
      } catch {
        // No opencode process found
      }
    } else {
      // Unix: use pgrep
      try {
        const output = execSync('pgrep -f "opencode serve"', {
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
        
        if (output) {
          // Found opencode process, try common ports
          for (const port of [4096, 4097, 4098, 4099, 4100]) {
            if (await pingServerOnPort(port)) {
              logger.info({ port }, 'Found existing OpenCode server');
              return port;
            }
          }
        }
      } catch {
        // No opencode process found
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Error checking for existing OpenCode server');
  }
  
  return null;
}

/**
 * Ping a specific port to check if OpenCode server is running there.
 */
function pingServerOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, 2000);

    const req = http.get(
      `http://${OPENCODE_HOST}:${port}/doc`,
      (res) => {
        clearTimeout(timer);
        res.resume();
        resolve(true);
      },
    );

    req.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
const HEALTH_CHECK_INTERVAL_MS = 30_000; // Check every 30s
const HEALTH_CHECK_TIMEOUT_MS = 5_000;   // 5s timeout per check
const STARTUP_WAIT_MS = 4_000;           // Wait after spawning before first check
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 2_000;

let serverProcess: ChildProcess | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let restartCount = 0;
let lastHealthy = 0;
let shuttingDown = false;

/**
 * Ping the OpenCode server with a lightweight HTTP request.
 * Returns true if the server responds within the timeout.
 */
export function pingServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, HEALTH_CHECK_TIMEOUT_MS);

    const req = http.get(
      `http://${OPENCODE_HOST}:${OPENCODE_PORT}/doc`,
      (res) => {
        clearTimeout(timer);
        // Any response (even 404) means the server is alive
        res.resume();
        resolve(true);
      },
    );

    req.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Check if something is already listening on the OpenCode port.
 */
async function isPortInUse(): Promise<boolean> {
  return pingServer();
}

/**
 * Spawn the `opencode serve` process as a managed child.
 * Unlike the old detached approach, this keeps the process attached
 * so we can monitor it and restart on crash.
 */
function spawnServer(): ChildProcess {
  // Load model configuration from models-config.json
  const modelInfo = getModelInfo();
  logger.info(
    { 
      primary: modelInfo.primary, 
      small: modelInfo.small, 
      fallback: modelInfo.fallback 
    }, 
    'Starting OpenCode server with model configuration'
  );

  // Merge models-config.json config with process.env
  const serverEnv = {
    ...process.env,
    ...getOpenCodeEnv(),
    OPENCODE_SERVER_PORT: OPENCODE_PORT.toString(),
    OPENCODE_SERVER_HOST: OPENCODE_HOST
  };

  const proc = spawn('opencode', [
    'serve',
    '--port', OPENCODE_PORT.toString(),
    '--hostname', OPENCODE_HOST
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    cwd: process.cwd(),
    env: serverEnv
  });

  proc.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) logger.debug({ component: 'opencode-server' }, line);
  });

  proc.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) logger.warn({ component: 'opencode-server' }, line);
  });

  proc.on('exit', (code, signal) => {
    logger.warn(
      { code, signal, component: 'opencode-server' },
      'OpenCode server exited',
    );
    serverProcess = null;

    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  proc.on('error', (err) => {
    logger.error(
      { err, component: 'opencode-server' },
      'Failed to spawn OpenCode server',
    );
    serverProcess = null;
  });

  return proc;
}

/**
 * Schedule a restart with exponential backoff.
 */
function scheduleRestart(): void {
  if (shuttingDown) return;

  restartCount++;
  if (restartCount > MAX_RESTART_ATTEMPTS) {
    logger.error(
      { restartCount, component: 'opencode-server' },
      'Max restart attempts exceeded. OpenCode server will not be restarted automatically.',
    );
    return;
  }

  const delay = RESTART_BACKOFF_BASE_MS * Math.pow(2, restartCount - 1);
  logger.info(
    { restartCount, delayMs: delay, component: 'opencode-server' },
    'Scheduling OpenCode server restart',
  );

  setTimeout(async () => {
    if (shuttingDown) return;
    await startServer();
  }, delay);
}

/**
 * Start the OpenCode server if not already running.
 * If a process is already listening on the port, reuse it.
 */
export async function startServer(): Promise<boolean> {
  if (serverProcess && !serverProcess.killed) {
    const alive = await pingServer();
    if (alive) {
      logger.debug('OpenCode server already running and healthy');
      lastHealthy = Date.now();
      restartCount = 0;
      return true;
    }
    // Process exists but not responding — kill and restart
    logger.warn('OpenCode server process exists but not responding, killing...');
    serverProcess.kill('SIGKILL');
    serverProcess = null;
  }

  // Check if there's already an OpenCode server running (any port)
  const existingPort = await findRunningOpenCodeServer();
  if (existingPort) {
    logger.info({ port: existingPort }, 'Reusing existing OpenCode server');
    OPENCODE_PORT = existingPort;
    lastHealthy = Date.now();
    restartCount = 0;
    return true;
  }

  // No existing server, start a new one on preferred port
  const preferredPort = parseInt(process.env.OPENCODE_PORT || '4100', 10);
  
  // Check if preferred port is a zombie, if so use next available
  if (await isZombiePort(preferredPort)) {
    logger.warn(
      { zombiePort: preferredPort },
      'Preferred port is occupied by zombie process, trying alternative ports'
    );
    // Try next 10 ports
    let foundPort = false;
    for (let port = preferredPort + 1; port < preferredPort + 11; port++) {
      if (!(await isZombiePort(port))) {
        OPENCODE_PORT = port;
        foundPort = true;
        logger.info({ port }, 'Using alternative port');
        break;
      }
    }
    if (!foundPort) {
      logger.error('Could not find available port, all ports appear to be zombies');
      return false;
    }
  } else {
    OPENCODE_PORT = preferredPort;
  }

  // Spawn new server
  serverProcess = spawnServer();

  // Wait for it to become responsive
  await new Promise((r) => setTimeout(r, STARTUP_WAIT_MS));

  const alive = await pingServer();
  if (alive) {
    logger.info('OpenCode server started and responding');
    lastHealthy = Date.now();
    restartCount = 0;
    return true;
  }

  logger.warn('OpenCode server started but not yet responding');
  return false;
}

/**
 * Ensure the server is healthy. If not, attempt restart.
 * Call this before spawning agent containers.
 */
export async function ensureServerHealthy(): Promise<boolean> {
  const alive = await pingServer();
  if (alive) {
    lastHealthy = Date.now();
    restartCount = 0;
    return true;
  }

  logger.warn('OpenCode server health check failed, attempting restart...');
  return startServer();
}

/**
 * Start periodic health checks.
 * If the server becomes unresponsive, it will be restarted automatically.
 */
export function startHealthChecks(): void {
  if (healthInterval) return;

  healthInterval = setInterval(async () => {
    if (shuttingDown) return;

    const alive = await pingServer();
    if (alive) {
      lastHealthy = Date.now();
      restartCount = 0;
    } else {
      const downFor = Date.now() - lastHealthy;
      logger.warn(
        { downForMs: downFor, component: 'opencode-server' },
        'OpenCode server not responding',
      );
      await startServer();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop health checks and kill the server process.
 */
export async function stopServer(): Promise<void> {
  shuttingDown = true;

  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }

  if (serverProcess && !serverProcess.killed) {
    logger.info('Stopping OpenCode server...');
    serverProcess.kill('SIGTERM');

    // Give it 3s to shut down gracefully, then force kill
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 3000);

      serverProcess!.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    serverProcess = null;
    logger.info('OpenCode server stopped');
  }
}
