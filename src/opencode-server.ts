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

import { logger } from './logger.js';
import { getOpenCodeEnv, getModelInfo } from './opencode-config.js';

const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '4096', 10);
const OPENCODE_HOST = '127.0.0.1';
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
  // Load model configuration from opencode.json
  const modelInfo = getModelInfo();
  logger.info(
    { 
      primary: modelInfo.primary, 
      small: modelInfo.small, 
      fallback: modelInfo.fallback 
    }, 
    'Starting OpenCode server with model configuration'
  );

  // Merge opencode.json config with process.env
  const serverEnv = {
    ...process.env,
    ...getOpenCodeEnv()
  };

  const proc = spawn('opencode', ['serve'], {
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

  // Check if an external process is already on the port
  const portUsed = await isPortInUse();
  if (portUsed) {
    logger.info('OpenCode server already running (external process)');
    lastHealthy = Date.now();
    restartCount = 0;
    return true;
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
