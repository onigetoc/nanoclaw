/**
 * Universal slash command system for EureClaw
 * Works across all channels (WhatsApp, Telegram, Web UI, etc.)
 */

import { logger } from '../logger.js';
import { RegisteredWorkspace } from '../types.js';

export interface CommandContext {
  chatJid: string;
  senderName: string;
  senderId: string;
  group?: RegisteredWorkspace;
  args: string[];
  rawMessage: string;
}

export interface CommandResponse {
  reply?: string;
  action?: 'restart' | 'shutdown' | 'sleep' | 'awake' | 'none';
  data?: any; // Can include OpenCode-specific data like { opencodeCommand: 'new', forceNewSession: true }
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResponse>;

const commands = new Map<string, CommandHandler>();

/**
 * Register a slash command handler
 */
export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name.toLowerCase(), handler);
  logger.debug({ command: name }, 'Command registered');
}

/**
 * Check if a message is a slash command and extract command + args
 */
export function parseCommand(message: string): { command: string; args: string[] } | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Execute a slash command
 */
export async function executeCommand(
  message: string,
  ctx: Omit<CommandContext, 'args' | 'rawMessage'>,
): Promise<CommandResponse | null> {
  const parsed = parseCommand(message);
  if (!parsed) return null;

  const handler = commands.get(parsed.command);
  if (!handler) {
    logger.debug({ command: parsed.command }, 'Unknown command');
    return null;
  }

  const fullContext: CommandContext = {
    ...ctx,
    args: parsed.args,
    rawMessage: message,
  };

  try {
    logger.info(
      { command: parsed.command, chatJid: ctx.chatJid, sender: ctx.senderName },
      'Executing command',
    );
    return await handler(fullContext);
  } catch (err) {
    logger.error({ command: parsed.command, err }, 'Command execution failed');
    return {
      reply: `❌ Command failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get list of all registered commands
 */
export function getRegisteredCommands(): string[] {
  return Array.from(commands.keys());
}
