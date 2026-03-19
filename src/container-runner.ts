/**
 * Container Runner for EureClaw
 * Spawns agent execution in Apple Container and handles IPC
 */
import { ChildProcess, exec, execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  WORKSPACES_DIR,
  IDLE_TIMEOUT,
} from './config.js';
import { logger } from './logger.js';
import { validateAdditionalMounts } from './mount-security.js';
import { filterEnv } from './security/env-filter.js';
import { RegisteredWorkspace } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---EURECLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---EURECLAW_OUTPUT_END---';

function getHomeDir(): string {
  const home = process.env.HOME || os.homedir();
  if (!home) {
    throw new Error(
      'Unable to determine home directory: HOME environment variable is not set and os.homedir() returned empty',
    );
  }
  return home;
}

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  workspaceFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  forceNewSession?: boolean; // Skip loading conversation history from SQLite
  secrets?: Record<string, string>;
  model?: string; // Override model from web UI
  agent?: string; // Override agent (mode) from web UI
  // Direct mode (Windows/Linux): real paths instead of container mount points
  directMode?: {
    ipcDir: string;
    workspaceDir: string;
    globalDir?: string;
    projectDir?: string;
  };
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
  metadata?: {
    modelID?: string;
    providerID?: string;
    mode?: string;
    agent?: string;
    tokens?: { total: number; input: number; output: number; reasoning: number };
    cost?: number;
  };
}

/**
 * Check if Docker is available AND functional on the system
 */
function isDockerAvailable(): boolean {
  try {
    // First check if docker command exists
    execSync('docker --version', { stdio: 'pipe', timeout: 5000 });
    
    // Then check if Docker daemon is actually running
    execSync('docker ps', { stdio: 'pipe', timeout: 5000 });
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we should use direct mode (no containers)
 * Returns true if containers are NOT available
 */
export function shouldUseDirectMode(): boolean {
  const platform = os.platform();
  
  // macOS always uses Apple Container (built-in)
  if (platform === 'darwin') {
    return false;
  }
  
  // Windows/Linux: check if Docker is available
  // If Docker is available, use it for security
  // Otherwise fall back to direct mode
  return !isDockerAvailable();
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

function buildVolumeMounts(
  workspace: RegisteredWorkspace,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const homeDir = getHomeDir();
  const projectRoot = process.cwd();

  if (isMain) {
    // Main gets the entire project root mounted
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: false,
    });

    // Main also gets its workspace folder as the working directory
    mounts.push({
      hostPath: path.join(WORKSPACES_DIR, workspace.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other workspaces only get their own folder
    mounts.push({
      hostPath: path.join(WORKSPACES_DIR, workspace.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    // Apple Container only supports directory mounts, not file mounts
    const globalDir = path.join(WORKSPACES_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Per-workspace sessions directory (isolated from other workspaces)
  const workspaceSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    workspace.folder,
  );
  fs.mkdirSync(workspaceSessionsDir, { recursive: true });

  // Sync skills from container/skills/ into each workspace's sessions directory
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(workspaceSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.mkdirSync(dstDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        const srcFile = path.join(srcDir, file);
        const dstFile = path.join(dstDir, file);
        fs.copyFileSync(srcFile, dstFile);
      }
    }
  }
  mounts.push({
    hostPath: workspaceSessionsDir,
    containerPath: '/workspace/sessions',
    readonly: false,
  });

  // Per-workspace IPC namespace: each workspace gets its own IPC directory
  // This prevents cross-workspace privilege escalation via IPC
  const workspaceIpcDir = path.join(DATA_DIR, 'ipc', workspace.folder);
  fs.mkdirSync(path.join(workspaceIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(workspaceIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(workspaceIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: workspaceIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Mount agent-runner source from host — recompiled on container startup.
  // Bypasses Apple Container's sticky build cache for code changes.
  const agentRunnerSrc = path.join(projectRoot, 'container', 'agent-runner', 'src');
  mounts.push({
    hostPath: agentRunnerSrc,
    containerPath: '/app/src',
    readonly: true,
  });

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (workspace.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      workspace.containerConfig.additionalMounts,
      workspace.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

/**
 * Read secrets from .env for passing to the container via stdin.
 * OpenCode SDK reads API keys from system config (~/.opencode/config.yaml),
 * so no AI provider secrets need to be passed.
 * Uses filterEnv() to ensure no secret-pattern variables leak through.
 */
function readSecrets(): Record<string, string> {
  // Currently no secrets are passed to containers.
  // If secrets are added in the future, they go through filterEnv() first.
  return filterEnv({});
}

function buildContainerArgs(mounts: VolumeMount[], containerName: string): string[] {
  const platform = os.platform();
  const isDocker = platform !== 'darwin';
  
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Mount syntax differs between Apple Container and Docker
  for (const mount of mounts) {
    if (isDocker) {
      // Docker: always use -v (supports :ro suffix for readonly)
      const mountStr = mount.readonly 
        ? `${mount.hostPath}:${mount.containerPath}:ro`
        : `${mount.hostPath}:${mount.containerPath}`;
      args.push('-v', mountStr);
    } else {
      // Apple Container: --mount for readonly, -v for read-write
      if (mount.readonly) {
        args.push(
          '--mount',
          `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
        );
      } else {
        args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
      }
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  workspace: RegisteredWorkspace,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const workspaceDir = path.join(WORKSPACES_DIR, workspace.folder);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const mounts = buildVolumeMounts(workspace, input.isMain);
  const safeName = workspace.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `eureclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      workspace: workspace.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      workspace: workspace.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(WORKSPACES_DIR, workspace.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    // Use 'docker' on Windows/Linux, 'container' (Apple Container) on macOS
    const containerCommand = os.platform() === 'darwin' ? 'container' : 'docker';
    
    const container = spawn(containerCommand, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Pass secrets via stdin (never written to disk or mounted as files)
    input.secrets = readSecrets();
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();
    // Remove secrets from input so they don't appear in logs
    delete input.secrets;

    // Streaming output: parse OUTPUT_START/END marker pairs as they arrive
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data) => {
      const chunk = data.toString();

      // Always accumulate for logging
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { workspace: workspace.name, size: stdout.length },
            'Container stdout truncated due to size limit',
          );
        } else {
          stdout += chunk;
        }
      }

      // Stream-parse for output markers
      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break; // Incomplete pair, wait for more data

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            // Activity detected — reset the hard timeout
            resetTimeout();
            // Call onOutput for all markers (including null results)
            // so idle timers start even for "silent" query completions.
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { workspace: workspace.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: workspace.folder }, line);
      }
      // Don't reset timeout on stderr — SDK writes debug logs continuously.
      // Timeout only resets on actual output (OUTPUT_MARKER in stdout).
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { workspace: workspace.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = workspace.containerConfig?.timeout || CONTAINER_TIMEOUT;
    // Grace period: hard timeout must be at least IDLE_TIMEOUT + 30s so the
    // graceful _close sentinel has time to trigger before the hard kill fires.
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error({ workspace: workspace.name, containerName }, 'Container timeout, stopping gracefully');
      const containerCmd = os.platform() === 'darwin' ? 'container' : 'docker';
      exec(`${containerCmd} stop ${containerName}`, { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn({ workspace: workspace.name, containerName, err }, 'Graceful stop failed, force killing');
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    // Reset the timeout whenever there's activity (streaming output)
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `container-${ts}.log`);
        fs.writeFileSync(timeoutLog, [
          `=== Container Run Log (TIMEOUT) ===`,
          `Timestamp: ${new Date().toISOString()}`,
          `Workspace: ${workspace.name}`,
          `Container: ${containerName}`,
          `Duration: ${duration}ms`,
          `Exit Code: ${code}`,
          `Had Streaming Output: ${hadStreamingOutput}`,
        ].join('\n'));

        // Timeout after output = idle cleanup, not failure.
        // The agent already sent its response; this is just the
        // container being reaped after the idle period expired.
        if (hadStreamingOutput) {
          logger.info(
            { workspace: workspace.name, containerName, duration, code },
            'Container timed out after output (idle cleanup)',
          );
          outputChain.then(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId,
            });
          });
          return;
        }

        logger.error(
          { workspace: workspace.name, containerName, duration, code },
          'Container timed out with no output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose = process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Workspace: ${workspace.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(' '),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
            )
            .join('\n'),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
            .join('\n'),
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Container log written');

      if (code !== 0) {
        logger.error(
          {
            workspace: workspace.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // Streaming mode: wait for output chain to settle, return completion marker
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { workspace: workspace.name, duration, newSessionId },
            'Container completed (streaming mode)',
          );
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // Legacy mode: parse the last output marker pair from accumulated stdout
      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            workspace: workspace.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            workspace: workspace.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse container output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ workspace: workspace.name, containerName, error: err }, 'Container spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  workspaceFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    workspaceFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the workspace's IPC directory
  const workspaceIpcDir = path.join(DATA_DIR, 'ipc', workspaceFolder);
  fs.mkdirSync(workspaceIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.workspaceFolder === workspaceFolder);

  const tasksFile = path.join(workspaceIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableWorkspace {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available workspaces snapshot for the container to read.
 * Only main workspace can see all available workspaces (for activation).
 * Non-main workspaces only see their own registration status.
 */
export function writeWorkspacesSnapshot(
  workspaceFolder: string,
  isMain: boolean,
  workspaces: AvailableWorkspace[],
  registeredJids: Set<string>,
): void {
  const workspaceIpcDir = path.join(DATA_DIR, 'ipc', workspaceFolder);
  fs.mkdirSync(workspaceIpcDir, { recursive: true });

  // Main sees all workspaces; others see nothing (they can't activate workspaces)
  const visibleWorkspaces = isMain ? workspaces : [];

  const workspacesFile = path.join(workspaceIpcDir, 'available_groups.json');
  fs.writeFileSync(
    workspacesFile,
    JSON.stringify(
      {
        groups: visibleWorkspaces,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
