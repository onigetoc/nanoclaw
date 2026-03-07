/**
 * Undo/Redo manager for EureClaw
 * Delegates to OpenCode's native /undo and /redo commands
 * This ensures file changes are properly reverted by OpenCode itself
 */

import { logger } from '../logger.js';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { getOpenCodeHost, getOpenCodePort } from '../opencode-server.js';

/**
 * Get OpenCode client instance
 */
function getClient() {
  const baseUrl = `http://${getOpenCodeHost()}:${getOpenCodePort()}`;
  return createOpencodeClient({ baseUrl });
}

/**
 * Undo: Send /undo command to OpenCode
 * OpenCode handles reverting both conversation AND file changes
 * @param sessionId - OpenCode session ID
 * @param steps - Number of steps to undo (default: 1)
 * @returns Result message
 */
export async function undo(sessionId: string, steps: number = 1): Promise<string> {
  try {
    const client = getClient();

    // Send /undo command(s) directly to OpenCode
    // OpenCode will handle reverting messages AND file changes
    for (let i = 0; i < steps; i++) {
      await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: '/undo' }] },
      });
    }

    logger.info({ sessionId, steps }, 'Undo command(s) sent to OpenCode');

    return `⏪ Undone ${steps} conversation${steps > 1 ? 's' : ''}`;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId, steps, err: errMsg }, 'Undo operation failed');
    return `❌ Undo failed: ${errMsg}`;
  }
}

/**
 * Redo: Send /redo command to OpenCode
 * OpenCode handles restoring both conversation AND file changes
 * @param sessionId - OpenCode session ID
 * @param steps - Number of steps to redo (default: 1)
 * @returns Result message
 */
export async function redo(sessionId: string, steps: number = 1): Promise<string> {
  try {
    const client = getClient();

    // Send /redo command(s) directly to OpenCode
    // OpenCode will handle restoring messages AND file changes
    for (let i = 0; i < steps; i++) {
      await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: '/redo' }] },
      });
    }

    logger.info({ sessionId, steps }, 'Redo command(s) sent to OpenCode');

    return `⏩ Restored ${steps} conversation${steps > 1 ? 's' : ''}`;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId, steps, err: errMsg }, 'Redo operation failed');
    return `❌ Redo failed: ${errMsg}`;
  }
}

/**
 * Clear undo state for a session (e.g., when starting a new session)
 * Note: With the new implementation, OpenCode manages its own undo/redo state
 * This function is kept for API compatibility but does nothing
 */
export function clearUndoState(sessionId: string): void {
  logger.debug({ sessionId }, 'clearUndoState called (no-op with OpenCode native commands)');
}

/**
 * Get current undo stack depth for a session
 * Note: With the new implementation, we can't query OpenCode's internal undo stack
 * This function is kept for API compatibility but always returns 0
 */
export function getUndoStackDepth(sessionId: string): number {
  logger.debug({ sessionId }, 'getUndoStackDepth called (not available with OpenCode native commands)');
  return 0;
}
