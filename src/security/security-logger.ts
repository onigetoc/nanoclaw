/**
 * Security Middleware — Structured Event Logger
 * Writes security events to data/security/security-events.log in JSON Lines format.
 * Falls back to pino application logger if file write fails.
 */

import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import type { SecurityEvent } from './types.js';

const LOG_DIR = path.resolve(process.cwd(), 'data', 'security');
const LOG_FILE = path.join(LOG_DIR, 'security-events.log');
const MAX_CONTENT_LENGTH = 500;

let dirEnsured = false;
let onCriticalEvent: ((event: SecurityEvent) => void) | undefined;

/** Register a callback for critical security events (e.g. notify main group). */
export function setOnCriticalEvent(cb: (event: SecurityEvent) => void): void {
  onCriticalEvent = cb;
}

/** Truncate originalContent to 500 chars as required. */
function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content;
  return content.slice(0, MAX_CONTENT_LENGTH);
}

/** Ensure the log directory exists (once). */
function ensureDir(): void {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    logger.warn({ err, dir: LOG_DIR }, 'Failed to create security log directory');
  }
}

/** Log a security event to the dedicated log file. */
export function logSecurityEvent(event: SecurityEvent): void {
  // Enforce truncation
  const normalized: SecurityEvent = {
    ...event,
    originalContent: truncateContent(event.originalContent),
  };

  // Write to file
  ensureDir();
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(normalized) + '\n', 'utf-8');
  } catch (err) {
    // Fallback to application logger
    logger.warn({ err, event: normalized }, 'Failed to write security event to file, using pino fallback');
  }

  // Also log via pino for visibility
  const pinoLevel = normalized.severity === 'critical' ? 'error'
    : normalized.severity === 'warning' ? 'warn' : 'info';
  logger[pinoLevel](
    { securityEvent: normalized.eventType, jid: normalized.sourceJid, group: normalized.sourceGroup },
    `[SECURITY] ${normalized.description}`,
  );

  // Notify main group on critical events
  if (normalized.severity === 'critical' && onCriticalEvent) {
    try {
      onCriticalEvent(normalized);
    } catch (err) {
      logger.warn({ err }, 'Failed to send critical security event notification');
    }
  }
}

/** Get recent security events (for the MCP security_report tool). */
export function getRecentEvents(limit = 20): SecurityEvent[] {
  ensureDir();
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events: SecurityEvent[] = [];
    // Read from end for most recent
    const start = Math.max(0, lines.length - limit);
    for (let i = start; i < lines.length; i++) {
      try {
        events.push(JSON.parse(lines[i]) as SecurityEvent);
      } catch {
        // Skip malformed lines
      }
    }
    return events;
  } catch (err) {
    logger.warn({ err }, 'Failed to read security events log');
    return [];
  }
}
