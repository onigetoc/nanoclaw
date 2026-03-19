/**
 * Global state management for EureClaw.
 * Centralizes sessions, registered workspaces, timestamps, and persistence.
 */
import {
  getAllRegisteredWorkspaces,
  getAllSessions,
  getRouterState,
  setRegisteredWorkspace,
  setRouterState,
  setSession,
} from './db.js';
import { RegisteredWorkspace } from './types.js';
import { logger } from './logger.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredWorkspaces: Record<string, RegisteredWorkspace> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

// --- Getters ---

export function getLastTimestamp(): string {
  return lastTimestamp;
}

export function getSessions(): Record<string, string> {
  return sessions;
}

export function getRegisteredWorkspaces(): Record<string, RegisteredWorkspace> {
  return registeredWorkspaces;
}

export function getLastAgentTimestamp(): Record<string, string> {
  return lastAgentTimestamp;
}

export function isMessageLoopRunning(): boolean {
  return messageLoopRunning;
}

// --- Setters ---

export function setLastTimestamp(ts: string): void {
  lastTimestamp = ts;
}

export function setMessageLoopRunning(running: boolean): void {
  messageLoopRunning = running;
}

export function setWorkspaceSession(folder: string, sessionId: string): void {
  sessions[folder] = sessionId;
  setSession(folder, sessionId);
}

export function setLastAgentTimestampForJid(jid: string, ts: string): void {
  lastAgentTimestamp[jid] = ts;
}

export function getLastAgentTimestampForJid(jid: string): string {
  return lastAgentTimestamp[jid] || '';
}

/** Replace registeredWorkspaces entirely (used by auto-registration reload). */
export function reloadRegisteredWorkspaces(): void {
  registeredWorkspaces = getAllRegisteredWorkspaces();
}

/** @internal - exported for testing */
export function _setRegisteredWorkspaces(workspaces: Record<string, RegisteredWorkspace>): void {
  registeredWorkspaces = workspaces;
}

// --- Persistence ---

export function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredWorkspaces = getAllRegisteredWorkspaces();
  logger.info(
    { workspaceCount: Object.keys(registeredWorkspaces).length, workspaces: registeredWorkspaces },
    'State loaded',
  );
}

export function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}
