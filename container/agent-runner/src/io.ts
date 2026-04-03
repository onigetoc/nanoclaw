/**
 * I/O helpers for the EureClaw Agent Runner.
 * Handles stdin reading, stdout output protocol, logging, and IPC communication.
 */

import fs from 'fs';
import path from 'path';
import {
  type ContainerOutput,
  type IpcMessage,
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
  IPC_POLL_MS,
} from './types.js';

// Import mutable IPC paths — these are set by main() via setIpcPaths()
import { IPC_INPUT_DIR, IPC_INPUT_CLOSE_SENTINEL } from './types.js';

// ─── Stdin ───────────────────────────────────────────────────────────────────

export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ─── Output Protocol ─────────────────────────────────────────────────────────

export function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

// ─── Logging ─────────────────────────────────────────────────────────────────

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [agent-runner] ${message}`);
}

export function debugLog(message: string): void {
  if (process.env.LOG_LEVEL === 'debug') {
    log(`[DEBUG] ${message}`);
  }
}

// ─── IPC Functions ───────────────────────────────────────────────────────────

/** Check for _close sentinel. */
export function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found (with optional model/agent overrides), or empty array.
 */
export function drainIpcInput(): IpcMessage[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: IpcMessage[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message') {
          if (data.text) {
            messages.push({ text: data.text, model: data.model, agent: data.agent });
          } else if (data.model || data.agent) {
            messages.push({ text: '', model: data.model, agent: data.agent });
          }
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the combined message with model/agent from the latest IPC file, or null if _close.
 */
export function waitForIpcMessage(): Promise<IpcMessage | null> {
  return new Promise((resolve) => {
    let pendingModel: string | undefined;
    let pendingAgent: string | undefined;

    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        for (const m of messages) {
          if (m.model) pendingModel = m.model;
          if (m.agent) pendingAgent = m.agent;
        }

        const texts = messages.filter(m => m.text).map(m => m.text);
        if (texts.length > 0) {
          resolve({
            text: texts.join('\n'),
            model: pendingModel,
            agent: pendingAgent,
          });
          return;
        }
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

// ─── Model Override Parsing ──────────────────────────────────────────────────

/** Parse "provider/model" string into { providerID, modelID } for the SDK. */
export function parseModelOverride(
  modelStr?: string
): { providerID: string; modelID: string } | undefined {
  if (!modelStr) return undefined;
  const slashIdx = modelStr.indexOf('/');
  if (slashIdx > 0) {
    return {
      providerID: modelStr.slice(0, slashIdx),
      modelID: modelStr.slice(slashIdx + 1),
    };
  }
  return undefined;
}

// ─── Security ────────────────────────────────────────────────────────────────

import { SECRET_ENV_VARS } from './types.js';

/**
 * Verify that secrets are not present in process.env.
 * OpenCode SDK spawns subprocesses that inherit process.env,
 * so secrets must only exist in the local sdkEnv variable.
 */
export function verifySecretsNotInProcessEnv(): void {
  const leakedSecrets: string[] = [];

  for (const secretKey of SECRET_ENV_VARS) {
    if (process.env[secretKey]) {
      leakedSecrets.push(secretKey);
    }
  }

  if (leakedSecrets.length > 0) {
    const error = `SECURITY ERROR: Secrets found in process.env: ${leakedSecrets.join(', ')}. ` +
                  `Secrets must only be in sdkEnv to prevent leakage to subprocesses.`;
    log(error);
    throw new Error(error);
  }

  log('✓ Secret isolation verified: No secrets in process.env');
}
