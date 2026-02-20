/**
 * Direct Runner for NanoClaw (Windows/Linux fallback)
 * Runs agent directly without container isolation
 * WARNING: Less secure than container mode - use only when containers unavailable
 */
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { CONTAINER_MAX_OUTPUT_SIZE, CONTAINER_TIMEOUT, DATA_DIR, GROUPS_DIR } from './config.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';
import { ContainerInput, ContainerOutput } from './container-runner.js';

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

/**
 * Run agent directly using Node.js (no container isolation)
 */
export async function runDirectAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true});

  // Setup IPC directory
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });

  const processName = `nanoclaw-direct-${group.folder}-${Date.now()}`;
  const agentRunnerPath = path.join(process.cwd(), 'container', 'agent-runner', 'src', 'index.ts');

  logger.info(
    { group: group.name, processName, isMain: input.isMain },
    'Spawning direct agent (no container)',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    // Filter secrets from environment to prevent leakage
    // CRITICAL: Create a clean environment without any secrets
    const filteredEnv: Record<string, string> = {};
    
    // Only copy safe environment variables
    for (const [key, value] of Object.entries(process.env)) {
      // Skip all known secrets
      if (key === 'TELEGRAM_BOT_TOKEN' || 
          key === 'GROQ_API_KEY' || 
          key === 'OPENAI_API_KEY' ||
          key.includes('TOKEN') ||
          key.includes('SECRET') ||
          key.includes('PASSWORD') ||
          key.includes('API_KEY')) {
        continue;
      }
      if (value !== undefined) {
        filteredEnv[key] = value;
      }
    }
    
    logger.debug({ group: group.name }, `Filtered env has ${Object.keys(filteredEnv).length} vars (secrets removed)`);
    
    const agentProcess = spawn('node', ['--import', 'tsx/esm', agentRunnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: groupDir,
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
      ipcDir: groupIpcDir,
      groupDir: groupDir,
      globalDir: path.join(GROUPS_DIR, 'global'),
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
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn({ group: group.name, error: err }, 'Failed to parse output');
          }
        }
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ process: group.folder }, line);
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
      logger.error({ group: group.name }, 'Agent timeout');
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
        `Group: ${group.name}`,
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
        logger.error({ group: group.name, code, logFile }, 'Agent exited with error');
        resolve({
          status: 'error',
          result: null,
          error: `Agent exited with code ${code}`,
        });
        return;
      }

      if (onOutput) {
        outputChain.then(() => {
          logger.info({ group: group.name, duration, newSessionId }, 'Agent completed');
          resolve({
            status: 'success',
            result: null,
            newSessionId,
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
        logger.info({ group: group.name, duration, status: output.status }, 'Agent completed');
        resolve(output);
      } catch (err) {
        logger.error({ group: group.name, error: err }, 'Failed to parse output');
        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    agentProcess.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, error: err }, 'Agent spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Spawn error: ${err.message}`,
      });
    });
  });
}
