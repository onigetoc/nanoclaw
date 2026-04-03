/**
 * Shared types and constants for the EureClaw Agent Runner.
 */

import path from 'path';

// ─── Container I/O Types ─────────────────────────────────────────────────────

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  workspaceFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  forceNewSession?: boolean;
  secrets?: Record<string, string>;
  model?: string;
  agent?: string;
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
    tokens?: {
      total: number;
      input: number;
      output: number;
      reasoning: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
    cost?: number;
  };
}

// ─── Session Types ───────────────────────────────────────────────────────────

export interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

export interface SessionsIndex {
  entries: SessionEntry[];
}

export interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface IpcMessage {
  text: string;
  model?: string;
  agent?: string;
}

// ─── Query Result ────────────────────────────────────────────────────────────

export interface QueryResult {
  newSessionId?: string;
  lastAssistantUuid?: string;
  closedDuringQuery: boolean;
  client: any;
  contextInjected: boolean;
  hadError?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const OUTPUT_START_MARKER = '---EURECLAW_OUTPUT_START---';
export const OUTPUT_END_MARKER = '---EURECLAW_OUTPUT_END---';
export const IPC_POLL_MS = 500;

// Mutable IPC paths — overridden in main() for direct mode
export let IPC_INPUT_DIR = '/workspace/ipc/input';
export let IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');

export function setIpcPaths(inputDir: string): void {
  IPC_INPUT_DIR = inputDir;
  IPC_INPUT_CLOSE_SENTINEL = path.join(inputDir, '_close');
}

// Secrets that should never leak to subprocess environments
export const SECRET_ENV_VARS = ['TELEGRAM_BOT_TOKEN'];

// OpenCode built-in tool names (for agent validation)
export const OPENCODE_TOOLS = new Set([
  'bash', 'read', 'write', 'edit', 'list',
  'glob', 'grep', 'webfetch', 'task', 'todowrite', 'todoread',
]);
