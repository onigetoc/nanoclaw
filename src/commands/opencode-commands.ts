/**
 * OpenCode SDK command handlers
 * Commands that interact with OpenCode sessions
 */

import { registerCommand, CommandContext, CommandResponse } from './index.js';
import { logger } from '../logger.js';

/**
 * List of EureClaw-specific commands that should NOT be forwarded to OpenCode
 * All other commands will be forwarded to OpenCode SDK
 */
export const EURECLAW_COMMANDS = new Set([
  'restart',
  'sleep',
  'awake',
  'status',
  'help',
  'chatid',
  'new',
  'undo',
  'redo',
]);

/**
 * /new - Create a new OpenCode session
 * This clears the conversation history and starts fresh
 */
registerCommand('new', async (ctx: CommandContext): Promise<CommandResponse> => {
  // Allow /new in all registered chats (including web:main)
  // The group check happens in startup.ts when clearing the session
  
  logger.info(
    { chatJid: ctx.chatJid, user: ctx.senderName, hasGroup: !!ctx.group },
    'New session command received',
  );

  return {
    reply: '🆕 Creating new session...',
    action: 'none',
    data: {
      opencodeCommand: 'new',
      forceNewSession: true,
    },
  };
});

/**
 * Check if a command should be handled by EureClaw or forwarded to OpenCode
 */
export function isEureClawCommand(command: string): boolean {
  return EURECLAW_COMMANDS.has(command.toLowerCase());
}

/**
 * Check if a message is an OpenCode command (starts with / but not a EureClaw command)
 */
export function isOpenCodeCommand(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return false;

  const command = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  return !isEureClawCommand(command);
}

logger.info('OpenCode commands registered');
