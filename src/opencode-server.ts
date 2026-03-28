/**
 * OpenCode Server Supervisor
 *
 * Manages the lifecycle of the `opencode serve` process using the official SDK:
 * - Starts the server via spawn (SDK-compatible approach with shell:true for Windows)
 * - Periodic health checks via HTTP
 * - Auto-restarts on crash or unresponsive state
 * - Graceful shutdown via server.close()
 */
import { execSync, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

/** Root directory of the EureClaw project (where opencode.json lives). */
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');

let OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '4100', 10);
const OPENCODE_HOST = '127.0.0.1';

/** Track the OpenCode child process PID for emergency cleanup */
let opencodePid: number | null = null;

/**
 * Emergency kill: synchronously kill OpenCode if our process dies unexpectedly.
 * process.on('exit') is SYNCHRONOUS and fires on crash, unhandled exception, etc.
 * This is the safety net that prevents zombie OpenCode processes.
 */
process.on('exit', () => {
  if (opencodePid) {
    try {
      // No signal arg = SIGTERM. On Windows: TerminateProcess(). On Unix: graceful shutdown.
      process.kill(opencodePid);
    } catch {
      // Process already dead — that's fine
    }
    opencodePid = null;
  }
});

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
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 2_000;
const SDK_STARTUP_TIMEOUT_MS = 15_000;   // SDK waits for server to be ready

/** Handle returned by createOpencodeServer() — has { url, close() } */
let sdkServer: { url: string; close(): void } | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let restartCount = 0;
let lastHealthy = 0;
let shuttingDown = false;

/**
 * Kill orphaned OpenCode servers by finding and terminating their processes.
 * Only used as a fallback when we don't have an SDK handle (e.g. stale servers from previous runs).
 */
async function killOrphanedServers(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      execSync('powershell -Command "Get-Process opencode -ErrorAction SilentlyContinue | Stop-Process -Force"', {
        timeout: 5000,
        stdio: 'ignore',
      });
    } else {
      execSync('pkill -f "opencode serve"', { timeout: 5000, stdio: 'ignore' });
    }
    // Give the OS time to release the port
    await new Promise((r) => setTimeout(r, 2000));
    logger.info('Killed orphaned OpenCode server(s)');
  } catch {
    // No process found — that's fine
  }
}

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
 * Read the OpenCode config from opencode.json for logging purposes.
 * OpenCode server reads this itself from CWD — we just use it for logging.
 */
function readOpencodeConfig(): Record<string, unknown> {
  try {
    const configPath = path.join(PROJECT_ROOT, 'opencode.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Clean up corrupted SQLite WAL/SHM files from the OpenCode data directory.
 * On Windows, abrupt kills (Ctrl+C, taskkill) can leave these in an inconsistent state,
 * preventing OpenCode from starting. Removing them lets SQLite rebuild cleanly.
 */
function cleanCorruptedDb(): void {
  const dataDir = path.join(
    process.env.LOCALAPPDATA || path.join(process.env.HOME || process.env.USERPROFILE || '', '.local', 'share'),
    ...(process.platform === 'win32' ? [] : ['opencode']),
  );
  // OpenCode stores data at ~/.local/share/opencode/ on all platforms
  const opencodeDataDir = process.platform === 'win32'
    ? path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\LENOVO', '.local', 'share', 'opencode')
    : path.join(process.env.HOME || '', '.local', 'share', 'opencode');
  
  const walFile = path.join(opencodeDataDir, 'opencode.db-wal');
  const shmFile = path.join(opencodeDataDir, 'opencode.db-shm');
  
  try {
    let cleaned = false;
    if (fs.existsSync(walFile)) {
      const walSize = fs.statSync(walFile).size;
      if (walSize > 1_000_000) { // WAL > 1MB = likely corrupted / not checkpointed
        logger.warn({ walSize, path: walFile }, 'Removing large WAL file (likely corrupted)');
        fs.unlinkSync(walFile);
        cleaned = true;
      }
    }
    if (cleaned && fs.existsSync(shmFile)) {
      fs.unlinkSync(shmFile);
      logger.info('Removed SHM file after WAL cleanup');
    }
  } catch (err) {
    logger.debug({ err }, 'Could not clean DB files (non-critical)');
  }
}

/**
 * Resolve the full path to the opencode binary.
 * On Windows, `spawn` without `shell: true` can't find .cmd/.ps1 wrappers.
 * We resolve the real .exe path so we can spawn without shell (avoids env corruption).
 */
function resolveOpencodeBinary(): string {
  try {
    // `where` on Windows / `which` on Unix returns the full path
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    // `where` may return multiple lines — take the first .exe or non-.cmd/.ps1 path
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    if (process.platform === 'win32') {
      // Prefer .exe, then .cmd, then first result
      const exePath = lines.find(l => l.endsWith('.exe'));
      if (exePath) return exePath;
      
      // If we only have .cmd, resolve the real binary via the .cmd wrapper
      const cmdPath = lines.find(l => l.endsWith('.cmd'));
      if (cmdPath) {
        // npm .cmd wrappers call node with the JS entry point
        // The real binary is typically at: <npm_prefix>/node_modules/<pkg>/...
        // Try to find it by reading the .cmd file
        try {
          const cmdContent = fs.readFileSync(cmdPath, 'utf-8');
          // Look for the actual opencode.exe in the npm tree
          const npmPrefix = path.dirname(path.dirname(cmdPath)); // up from npm/ to Roaming/
          const possibleExe = path.join(npmPrefix, 'npm', 'node_modules', 'opencode-ai', 'node_modules', 
            `opencode-windows-x64-baseline`, 'bin', 'opencode.exe');
          if (fs.existsSync(possibleExe)) return possibleExe;
          
          // Alternative: try npm prefix structure
          const npmNmExe = path.join(path.dirname(cmdPath), 'node_modules', 'opencode-ai', 'node_modules',
            'opencode-windows-x64-baseline', 'bin', 'opencode.exe');
          if (fs.existsSync(npmNmExe)) return npmNmExe;
        } catch {}
        
        // Fall back to .cmd (will need shell: true)
        return cmdPath;
      }
    }
    
    return lines[0];
  } catch {
    return 'opencode'; // fallback — will fail without shell but that's caught
  }
}

/**
 * Spawn the OpenCode server using the same approach as the SDK's createOpencodeServer(),
 * but resolving the binary path for Windows compatibility.
 * Returns an object matching the SDK's { url, close() } interface.
 */
async function spawnServerViaSdk(): Promise<boolean> {
  const config = readOpencodeConfig();
  
  logger.info(
    { 
      model: config.model,
      small_model: config.small_model,
      port: OPENCODE_PORT,
    }, 
    'Starting OpenCode server via SDK-compatible spawn'
  );

  try {
    const args = ['serve', `--hostname=${OPENCODE_HOST}`, `--port=${OPENCODE_PORT}`];
    if (config.logLevel) {
      args.push(`--log-level=${config.logLevel}`);
    }

    const binaryPath = resolveOpencodeBinary();
    const needsShell = binaryPath.endsWith('.cmd') || binaryPath.endsWith('.ps1') || binaryPath === 'opencode';
    
    logger.info({ binaryPath, needsShell }, 'Resolved opencode binary');

    const proc = spawn(binaryPath, args, {
      shell: needsShell, // Only use shell if we couldn't find the real .exe
      cwd: PROJECT_ROOT, // OpenCode reads opencode.json from CWD
      env: process.env,
    });

    // Track PID for emergency cleanup on crash (process.on('exit') handler)
    opencodePid = proc.pid ?? null;

    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for server to start after ${SDK_STARTUP_TIMEOUT_MS}ms`));
      }, SDK_STARTUP_TIMEOUT_MS);

      let output = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('opencode server listening')) {
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
            if (!match) {
              clearTimeout(timeout);
              reject(new Error(`Failed to parse server url from output: ${line}`));
              return;
            }
            clearTimeout(timeout);
            resolve(match[1]);
            return;
          }
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        let msg = `Server exited with code ${code}`;
        if (output.trim()) {
          msg += `\nServer output: ${output}`;
        }
        reject(new Error(msg));
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    sdkServer = {
      url,
      close() {
        proc.kill();
      },
    };

    // Extract the actual port from the URL in case the SDK chose a different one
    try {
      const url = new URL(sdkServer.url);
      const actualPort = parseInt(url.port, 10);
      if (actualPort && actualPort !== OPENCODE_PORT) {
        logger.info({ requestedPort: OPENCODE_PORT, actualPort }, 'SDK assigned different port');
        OPENCODE_PORT = actualPort;
      }
    } catch {
      // URL parsing failed, keep our port
    }

    logger.info({ url: sdkServer.url, port: OPENCODE_PORT }, 'OpenCode server started via SDK');
    lastHealthy = Date.now();
    restartCount = 0;
    return true;
  } catch (err) {
    logger.error({ err, component: 'opencode-server' }, 'Failed to start OpenCode server via SDK');
    sdkServer = null;
    return false;
  }
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
 * If a process is already listening on the port, kill it first to ensure clean state.
 */
export async function startServer(): Promise<boolean> {
  // If we already have an SDK handle and it's healthy, we're good
  if (sdkServer) {
    const alive = await pingServer();
    if (alive) {
      logger.debug('OpenCode server already running and healthy (SDK managed)');
      lastHealthy = Date.now();
      restartCount = 0;
      return true;
    }
    // SDK handle exists but server not responding — close and restart
    logger.warn('OpenCode server (SDK managed) not responding, restarting...');
    sdkServer.close();
    sdkServer = null;
  }

  // Kill any orphaned OpenCode servers from previous runs
  const existingPort = await findRunningOpenCodeServer();
  if (existingPort) {
    logger.info({ port: existingPort }, 'Found orphaned OpenCode server, killing before fresh start...');
    await killOrphanedServers();
  }

  // Clean corrupted DB files that can prevent startup
  cleanCorruptedDb();

  // Determine port
  const preferredPort = parseInt(process.env.OPENCODE_PORT || '4100', 10);
  
  if (await isZombiePort(preferredPort)) {
    logger.warn({ zombiePort: preferredPort }, 'Preferred port is occupied by zombie process, trying alternative ports');
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

  // Start fresh server via SDK
  return spawnServerViaSdk();
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
      if (restartCount >= MAX_RESTART_ATTEMPTS) {
        logger.error(
          { restartCount, component: 'opencode-server' },
          'OpenCode server down but max restart attempts reached. Stopping health checks. Manual restart required.',
        );
        if (healthInterval) {
          clearInterval(healthInterval);
          healthInterval = null;
        }
        return;
      }
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
 * Stop health checks and shut down the OpenCode server.
 * Uses sdk server.close() for clean shutdown.
 */
export async function stopServer(): Promise<void> {
  shuttingDown = true;

  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }

  if (sdkServer) {
    logger.info('Stopping OpenCode server via SDK close()...');
    sdkServer.close();
    sdkServer = null;
    opencodePid = null; // Clear PID — process is dead, no need for emergency kill
    // Give the OS a moment to release the port
    await new Promise((r) => setTimeout(r, 1000));
    logger.info('OpenCode server stopped via SDK');
  }
  
  // Always kill any orphaned processes (even if we had an SDK handle)
  // This ensures zombie processes from previous crashes are cleaned up
  logger.info('Cleaning up any orphaned OpenCode processes...');
  await killOrphanedServers();
  opencodePid = null;
  logger.info('OpenCode server fully stopped');
}

/**
 * Restart the OpenCode server.
 * Useful after API key changes or configuration updates.
 */
export async function restartServer(): Promise<boolean> {
  logger.info('Restarting OpenCode server...');
  await stopServer();
  // Give it a moment to fully shut down
  await new Promise((r) => setTimeout(r, 2000));
  const success = await startServer();
  if (success) {
    logger.info('OpenCode server restarted successfully');
  } else {
    logger.error('Failed to restart OpenCode server');
  }
  return success;
}
