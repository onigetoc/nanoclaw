/**
 * Security Middleware — Command Guard
 * Detects dangerous system commands before execution.
 * Fail-closed: if guard throws, command is blocked.
 */

import { DANGEROUS_COMMAND_PATTERNS } from './patterns.js';
import { logSecurityEvent } from './security-logger.js';
import type { CommandCheckResult } from './types.js';

/**
 * Check if a command string matches any dangerous pattern.
 * Returns { safe: false, pattern, description } on match.
 * Fail-closed: if an error occurs, the command is blocked.
 */
export function checkCommand(command: string): CommandCheckResult {
  try {
    for (const entry of DANGEROUS_COMMAND_PATTERNS) {
      if (entry.pattern.test(command)) {
        return {
          safe: false,
          pattern: entry.category,
          description: entry.description,
        };
      }
    }
    return { safe: true };
  } catch (err) {
    // Fail-closed: block the command on error
    const event = {
      timestamp: new Date().toISOString(),
      eventType: 'command_guard_error',
      sourceJid: 'system',
      sourceGroup: 'system',
      severity: 'critical' as const,
      description: `Command guard error (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
      originalContent: command.slice(0, 500),
    };
    logSecurityEvent(event);
    return {
      safe: false,
      pattern: 'internal_error',
      description: 'Command blocked due to guard internal error (fail-closed)',
    };
  }
}
