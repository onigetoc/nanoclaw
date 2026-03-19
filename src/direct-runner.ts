/**
 * Direct Runner for EureClaw (Windows/Linux fallback)
 * Runs agent directly without container isolation
 * WARNING: Less secure than container mode - use only when containers unavailable
 */
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { CONTAINER_MAX_OUTPUT_SIZE, CONTAINER_TIMEOUT, DATA_DIR, WORKSPACES_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { getOpenCodePort, getOpenCodeHost } from './opencode-server.js';
import { RegisteredWorkspace } from './types.js';
import { ContainerInput, ContainerOutput } from './container-runner.js';
import { filterEnv } from './security/env-filter.js';

const OUTPUT_START_MARKER = '---EURECLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---EURECLAW_OUTPUT_END---';

/**
 * Run agent directly using Node.js (no container isolation)
 */
export async function runDirectAgent(
  workspace: RegisteredWorkspace,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const workspaceDir = path.join(WORKSPACES_DIR, workspace.folder);
  fs.mkdirSync(workspaceDir, { recursive: true});

  // Setup IPC directory
  const workspaceIpcDir = path.join(DATA_DIR, 'ipc', workspace.folder);
  fs.mkdirSync(path.join(workspaceIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(workspaceIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(workspaceIpcDir, 'input'), { recursive: true });

  // Setup sessions directory and sync skills (same as container mode)
  const workspaceSessionsDir = path.join(DATA_DIR, 'sessions', workspace.folder);
  fs.mkdirSync(workspaceSessionsDir, { recursive: true });

  // Sync skills from container/skills/ into sessions directory
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

  const processName = `eureclaw-direct-${workspace.folder}-${Date.now()}`;
  const agentRunnerPath = path.join(process.cwd(), 'container', 'agent-runner', 'src', 'index.ts');

  logger.info(
    { workspace: workspace.name, processName, isMain: input.isMain },
    'Spawning direct agent (no container)',
  );

  const logsDir = path.join(WORKSPACES_DIR, workspace.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    // Filter secrets from environment using security middleware
    const filteredEnv: Record<string, string> = filterEnv(process.env);
    
    // Load HEADED from .env if not in process.env
    const envFile = readEnvFile(['HEADED']);
    const headedValue = process.env.HEADED || envFile.HEADED || 'false';
    
    // Add HEADED explicitly (for browser automation)
    filteredEnv['HEADED'] = headedValue;
    
    // Add WORKSPACE_FOLDER for browser scripts to save files in correct location
    filteredEnv['WORKSPACE_FOLDER'] = workspace.folder;
    
    // Add PROJECT_DIR so scripts can find the project root
    filteredEnv['PROJECT_DIR'] = process.cwd();
    
    // Add OpenCode server connection info so agent can connect to the correct port
    const opencodePort = getOpenCodePort();
    const opencodeHost = getOpenCodeHost();
    filteredEnv['OPENCODE_BASE_URL'] = `http://${opencodeHost}:${opencodePort}`;
    
    logger.debug({ workspace: workspace.name, opencodeUrl: filteredEnv['OPENCODE_BASE_URL'] }, `Filtered env has ${Object.keys(filteredEnv).length} vars (secrets removed)`);
    
    const agentProcess = spawn('node', ['--import', 'tsx/esm', agentRunnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workspaceDir,
      env: filteredEnv,
    });

    onProcess(agentProcess, processName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Pass input via stdin (OpenCode SDK reads API keys from system config,
    // so no secrets need to be passed. Keep the field for future use.)
    input.secrets = {};
    // Direct mode: pass real host paths so agent-runner doesn't use container paths
    (input as any).directMode = {
      ipcDir: workspaceIpcDir,
      workspaceDir: workspaceDir,
      globalDir: path.join(WORKSPACES_DIR, 'global'),
      projectDir: process.cwd(),
    };
    agentProcess.stdin.write(JSON.stringify(input));
    agentProcess.stdin.end();
    delete input.secrets;
    delete (input as any).directMode;

    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();
    let hadStreamingOutput = false;

    agentProcess.stdout.on('data', (data) => {
      const chunk = data.toString();

      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
        } else {
          stdout += chunk;
        }
      }

      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break;

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            logger.info({ workspace: workspace.name, result: parsed.result?.toString().slice(0, 100) }, 'Parsed output from agent');
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            outputChain = outputChain.then(() => {
              logger.info({ workspace: workspace.name }, 'Calling onOutput callback');
              return onOutput(parsed);
            });
          } catch (err) {
            logger.warn({ workspace: workspace.name, error: err }, 'Failed to parse output');
          }
        }
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ process: workspace.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
      } else {
        stderr += chunk;
      }
    });

    const timeout = setTimeout(() => {
      logger.error({ workspace: workspace.name }, 'Agent timeout');
      agentProcess.kill('SIGTERM');
    }, CONTAINER_TIMEOUT);

    agentProcess.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `direct-${timestamp}.log`);

      fs.writeFileSync(logFile, [
        `=== Direct Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Workspace: ${workspace.name}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        ``,
        `=== Stderr ===`,
        stderr,
        ``,
        `=== Stdout ===`,
        stdout,
      ].join('\n'));

      if (code !== 0) {
        logger.error({ workspace: workspace.name, code, logFile }, 'Agent exited with error');
        resolve({
          status: 'error',
          result: null,
          error: `Agent exited with code ${code}`,
        });
        return;
      }

      if (onOutput) {
        outputChain.then(() => {
          logger.info({ workspace: workspace.name, duration, newSessionId }, 'Agent completed');
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        }).catch((err) => {
          logger.error({ workspace: workspace.name, error: err }, 'Error in onOutput callback chain');
          resolve({
            status: 'error',
            result: null,
            error: `onOutput callback error: ${err instanceof Error ? err.message : String(err)}`,
          });
        });
        return;
      }

      // Legacy mode
      try {
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);
        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout.slice(startIdx + OUTPUT_START_MARKER.length, endIdx).trim();
        } else {
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }
        const output: ContainerOutput = JSON.parse(jsonLine);
        logger.info({ workspace: workspace.name, duration, status: output.status }, 'Agent completed');
        resolve(output);
      } catch (err) {
        logger.error({ workspace: workspace.name, error: err }, 'Failed to parse output');
        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    agentProcess.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ workspace: workspace.name, error: err }, 'Agent spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Spawn error: ${err.message}`,
      });
    });
  });
}
