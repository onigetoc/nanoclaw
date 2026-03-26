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
 * Parse agent-runner stderr lines for status updates.
 * Returns a user-friendly status string if the line indicates a key milestone, null otherwise.
 */
function parseAgentStatus(line: string): string | null {
  // Order matters — check most specific patterns first
  if (line.includes('Registering EureClaw MCP server')) return 'Registering tools…';
  if (line.includes('MCP server registered successfully')) return 'Tools registered';
  if (line.includes('Injecting system context')) return 'Loading context…';
  if (line.includes('context injected successfully')) return 'Context loaded';
  if (line.includes('Sending message to session')) return 'Sending to model…';
  if (line.includes('Response received from session')) return 'Processing response…';
  if (line.includes('Using orchestrator agent')) return 'Using orchestrator…';
  if (line.includes('Using build agent')) return 'Using build agent…';
  if (line.includes('Using plan agent')) return 'Using plan agent…';
  if (line.includes('Creating new OpenCode session')) return 'Creating session…';
  if (line.includes('Session verified, resuming')) return 'Resuming session…';
  if (line.includes('Prompt failed') && line.includes('retrying')) return 'Retrying with fresh session…';
  if (line.includes('ContextOverflowError')) return 'Context overflow, resetting…';
  if (line.includes('Waiting for model response')) return 'Waiting for model…';
  // i keep it to may be use it but keep it commented because i do not want to see it in the Web UI for now 
  // Because it appear long after de conversation in finish and i do not like it.
  //if (line.includes('Query completed successfully')) return 'Query done';
  //if (line.includes('waiting for next IPC message')) return 'Ready for next message';
  if (line.includes('Discovered') && line.includes('agents')) return 'Discovering agents…';
  return null;
}

export interface AgentStepEvent {
  phase: 'init' | 'context' | 'model' | 'fallback' | 'response' | 'error' | 'done';
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parse agent-runner stderr lines for execution trace steps.
 * Returns a structured step event for key milestones, null for noise.
 */
function parseAgentStep(line: string): AgentStepEvent | null {
  // Model fallback chain
  if (line.includes('Model fallback chain:')) {
    const chain = line.split('Model fallback chain:')[1]?.trim();
    return { phase: 'model', message: `Fallback chain: ${chain}` };
  }
  // Trying a specific model
  const tryMatch = line.match(/Trying model (\d+\/\d+): (.+)/);
  if (tryMatch) {
    return { phase: 'model', message: `Trying ${tryMatch[2]} (${tryMatch[1]})`, metadata: { model: tryMatch[2] } };
  }
  // Model failed
  const failMatch = line.match(/Model "(.+?)" failed \(attempt (\d+\/\d+)\): (.+)/);
  if (failMatch) {
    return { phase: 'fallback', message: `${failMatch[1]} failed: ${failMatch[3].slice(0, 120)}`, metadata: { model: failMatch[1], attempt: failMatch[2] } };
  }
  // Fallback succeeded
  if (line.includes('Fallback model succeeded:')) {
    const model = line.split('Fallback model succeeded:')[1]?.trim();
    return { phase: 'response', message: `Fallback succeeded: ${model}`, metadata: { model } };
  }
  // All models failed
  if (line.includes('All models failed')) {
    const detail = line.split('All models failed')[1]?.trim() || '';
    return { phase: 'error', message: `All models failed ${detail.slice(0, 150)}` };
  }
  // Session creation
  if (line.includes('Creating new OpenCode session')) {
    return { phase: 'init', message: 'Creating new session' };
  }
  if (line.includes('Session verified, resuming')) {
    return { phase: 'init', message: 'Resuming existing session' };
  }
  // Context injection
  if (line.includes('Injecting system context')) {
    const sizeMatch = line.match(/\((\d+) chars\)/);
    return { phase: 'context', message: `Injecting context${sizeMatch ? ` (${sizeMatch[1]} chars)` : ''}` };
  }
  if (line.includes('context injected successfully')) {
    return { phase: 'context', message: 'Context loaded' };
  }
  // Agent routing
  if (line.includes('Using orchestrator agent')) {
    return { phase: 'init', message: 'Routed to orchestrator agent' };
  }
  if (line.includes('Using build agent')) {
    return { phase: 'init', message: 'Routed to build agent' };
  }
  if (line.includes('Using plan agent')) {
    return { phase: 'init', message: 'Routed to plan agent' };
  }
  const agentMatch = line.match(/Using (.+?) agent \((.+?)\)/);
  if (agentMatch) {
    return { phase: 'init', message: `Routed to ${agentMatch[1]} (${agentMatch[2]})` };
  }
  // Sending to model
  if (line.includes('Sending message to session')) {
    return { phase: 'model', message: 'Sending prompt to model…' };
  }
  // Response received
  if (line.includes('Response received from session')) {
    return { phase: 'response', message: 'Response received' };
  }
  // Model info
  const modelInfoMatch = line.match(/Model: (.+?), agent: (.+?), tokens: (.+?)(?:\s|$)/);
  if (modelInfoMatch) {
    try {
      const tokens = JSON.parse(modelInfoMatch[3]);
      return { phase: 'response', message: `Model: ${modelInfoMatch[1]}, agent: ${modelInfoMatch[2]}`, metadata: { tokens } };
    } catch {
      return { phase: 'response', message: `Model: ${modelInfoMatch[1]}, agent: ${modelInfoMatch[2]}` };
    }
  }
  // Context overflow
  if (line.includes('ContextOverflowError')) {
    return { phase: 'error', message: 'Context overflow — resetting session' };
  }
  // Session refresh during fallback
  if (line.includes('Failed to refresh session')) {
    return { phase: 'error', message: 'Failed to refresh session for fallback' };
  }
  // Non-model error stopping chain
  if (line.includes('Non-model error, stopping fallback chain')) {
    return { phase: 'error', message: 'Non-model error, stopping fallback chain' };
  }
  // Query done
  if (line.includes('Query completed successfully')) {
    return { phase: 'done', message: 'Query completed' };
  }
  return null;
}

/**
 * Run agent directly using Node.js (no container isolation)
 */
export async function runDirectAgent(
  workspace: RegisteredWorkspace,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  onStatus?: (detail: string) => void,
  onStep?: (step: AgentStepEvent) => void,
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
        if (line) {
          logger.debug({ process: workspace.folder }, line);
          // Parse agent-runner logs for real-time status updates
          if (onStatus) {
            const status = parseAgentStatus(line);
            if (status) onStatus(status);
          }
        }
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
        // code === null means the process was killed by a signal (SIGTERM/SIGKILL),
        // typically from /new, idle timeout, or workspace reset — not a real crash.
        const wasKilled = code === null;
        const errorMsg = wasKilled
          ? 'Agent session was interrupted (previous session closed)'
          : `Agent exited with code ${code}`;
        logger.error({ workspace: workspace.name, code, wasKilled, logFile }, wasKilled ? 'Agent was killed' : 'Agent exited with error');
        resolve({
          status: 'error',
          result: null,
          error: errorMsg,
          logFile,
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
            logFile,
          });
        }).catch((err) => {
          logger.error({ workspace: workspace.name, error: err }, 'Error in onOutput callback chain');
          resolve({
            status: 'error',
            result: null,
            error: `onOutput callback error: ${err instanceof Error ? err.message : String(err)}`,
            logFile,
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
        output.logFile = logFile;
        logger.info({ workspace: workspace.name, duration, status: output.status }, 'Agent completed');
        resolve(output);
      } catch (err) {
        logger.error({ workspace: workspace.name, error: err }, 'Failed to parse output');
        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse output: ${err instanceof Error ? err.message : String(err)}`,
          logFile,
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
