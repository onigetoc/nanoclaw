/**
 * Global state management for EureClaw.
 * Centralizes sessions, registered groups, timestamps, and persistence.
 */
import {
  getAllRegisteredGroups,
  getAllSessions,
  getRouterState,
  setRegisteredGroup,
  setRouterState,
  setSession,
} from './db.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;
let freshSessions: Set<string> = new Set(); // Track sessions just created by /new

// --- Getters ---

export function getLastTimestamp(): string {
  return lastTimestamp;
}

export function getSessions(): Record<string, string> {
  return sessions;
}

export function getRegisteredGroups(): Record<string, RegisteredGroup> {
  return registeredGroups;
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

export function setGroupSession(folder: string, sessionId: string): void {
  sessions[folder] = sessionId;
  setSession(folder, sessionId);
}

export function markSessionAsFresh(sessionId: string): void {
  freshSessions.add(sessionId);
}

export function isSessionFresh(sessionId: string): boolean {
  return freshSessions.has(sessionId);
}

export function clearFreshSessionFlag(sessionId: string): void {
  freshSessions.delete(sessionId);
}

export function setLastAgentTimestampForJid(jid: string, ts: string): void {
  lastAgentTimestamp[jid] = ts;
}

export function getLastAgentTimestampForJid(jid: string): string {
  return lastAgentTimestamp[jid] || '';
}

/** Replace registeredGroups entirely (used by auto-registration reload). */
export function reloadRegisteredGroups(): void {
  registeredGroups = getAllRegisteredGroups();
}

/** @internal - exported for testing */
export function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void {
  registeredGroups = groups;
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
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length, groups: registeredGroups },
    'State loaded',
  );
}

export function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}
