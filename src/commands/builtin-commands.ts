/**
 * Built-in slash commands for EureClaw
 */

import { registerCommand, CommandContext, CommandResponse } from './index.js';
import {
  sleep,
  awake,
  isSleeping,
  getSleepState,
  parseDuration,
  formatDuration,
} from './sleep-manager.js';
import { ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';

/**
 * /restart - Restart EureClaw
 */
registerCommand('restart', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  logger.info(
    { chatJid: ctx.chatJid, user: ctx.senderName },
    'Restart command received',
  );

  return {
    reply: '🔄 Restarting EureClaw...',
    action: 'restart',
  };
});

/**
 * /sleep [duration] - Put bot to sleep
 * Examples:
 *   /sleep          - Sleep indefinitely (until /awake)
 *   /sleep 4h       - Sleep for 4 hours
 *   /sleep 30m      - Sleep for 30 minutes
 *   /sleep 2d       - Sleep for 2 days
 *   /sleep 1h30m    - Sleep for 1 hour 30 minutes
 */
registerCommand('sleep', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  if (isSleeping()) {
    const state = getSleepState();
    const until = state.sleepUntil
      ? `until ${new Date(state.sleepUntil).toLocaleString()}`
      : 'indefinitely';
    return {
      reply: `😴 ${ASSISTANT_NAME} is already sleeping ${until}.\nUse /awake to wake up.`,
    };
  }

  let duration: number | null = null;
  let durationText = 'indefinitely (use /awake to wake up)';

  if (ctx.args.length > 0) {
    const durationStr = ctx.args[0];
    duration = parseDuration(durationStr);

    if (duration === null) {
      return {
        reply:
          '❌ Invalid duration format.\n\n' +
          'Examples:\n' +
          '  /sleep 4h       - Sleep for 4 hours\n' +
          '  /sleep 30m      - Sleep for 30 minutes\n' +
          '  /sleep 2d       - Sleep for 2 days\n' +
          '  /sleep 1h30m    - Sleep for 1 hour 30 minutes\n' +
          '  /sleep          - Sleep indefinitely',
      };
    }

    durationText = `for ${formatDuration(duration)}`;
  }

  sleep(duration, ctx.senderName, ctx.chatJid);

  logger.info(
    { duration, chatJid: ctx.chatJid, user: ctx.senderName },
    'Sleep mode activated',
  );

  return {
    reply:
      `😴💤 ${ASSISTANT_NAME} is going to sleep ${durationText}.\n\n` +
      '• All messages will be ignored\n' +
      '• Scheduled tasks will be paused\n' +
      '• Use /awake to wake up early',
    action: 'sleep',
  };
});

/**
 * /awake - Wake bot from sleep
 */
registerCommand('awake', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  if (!isSleeping()) {
    return {
      reply: `✅ ${ASSISTANT_NAME} is already awake and ready!`,
    };
  }

  const state = getSleepState();
  const sleepDuration = state.sleepStartTime
    ? Date.now() - new Date(state.sleepStartTime).getTime()
    : 0;

  awake();

  logger.info(
    { chatJid: ctx.chatJid, user: ctx.senderName, sleepDuration },
    'Bot awakened from sleep',
  );

  return {
    reply:
      `☀️ ${ASSISTANT_NAME} is now awake!\n\n` +
      `Slept for: ${formatDuration(sleepDuration)}\n` +
      `Awakened by: ${ctx.senderName}`,
    action: 'awake',
  };
});

/**
 * /status - Check bot status
 */
registerCommand('status', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (isSleeping()) {
    const state = getSleepState();
    const sleepDuration = state.sleepStartTime
      ? Date.now() - new Date(state.sleepStartTime).getTime()
      : 0;

    let statusText = `😴💤 ${ASSISTANT_NAME} is sleeping\n\n`;
    statusText += `Started: ${state.sleepStartTime ? new Date(state.sleepStartTime).toLocaleString() : 'Unknown'}\n`;
    statusText += `Duration: ${formatDuration(sleepDuration)}\n`;

    if (state.sleepUntil) {
      const remaining = new Date(state.sleepUntil).getTime() - Date.now();
      statusText += `Wake time: ${new Date(state.sleepUntil).toLocaleString()}\n`;
      statusText += `Remaining: ${formatDuration(remaining)}\n`;
    } else {
      statusText += `Wake time: Manual (/awake required)\n`;
    }

    if (state.sleepRequestedBy) {
      statusText += `Requested by: ${state.sleepRequestedBy}`;
    }

    return { reply: statusText };
  }

  return {
    reply: `✅ ${ASSISTANT_NAME} is awake and ready!\n\nUse /sleep to pause the bot.`,
  };
});

/**
 * /help - Show available commands
 */
registerCommand('help', async (ctx: CommandContext): Promise<CommandResponse> => {
  const helpText =
    `🤖 ${ASSISTANT_NAME} Commands\n\n` +
    '**System Control:**\n' +
    '/restart - Restart the bot\n' +
    '/status - Check bot status\n\n' +
    '**Sleep Mode:**\n' +
    '/sleep [duration] - Pause all activity\n' +
    '  Examples: /sleep 4h, /sleep 30m, /sleep 2d\n' +
    '/awake - Wake from sleep mode\n\n' +
    '**Info:**\n' +
    '/help - Show this help message\n' +
    '/chatid - Get chat registration ID (Telegram only)';

  return { reply: helpText };
});

logger.info('Built-in commands registered');
