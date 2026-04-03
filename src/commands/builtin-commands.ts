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
import { undo, redo } from './undo-manager.js';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';
import { discoveredAgents } from './agent-commands.js';
import { getSessions, getRegisteredWorkspaces, setWorkspaceSession } from '../state.js';
import { getOpenCodeHost, getOpenCodePort } from '../opencode-server.js';
import { getMonitoring } from '../monitoring.js';
import { getModelInfo } from '../opencode-config.js';
import { getMessagesPage } from '../db.js';
import { getOpenCodeStatus, formatOpenCodeStatusText } from '../api-opencode-status.js';

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
 * /shutdown - Stop EureClaw completely (no auto-restart)
 * Use for emergencies, security issues, or when you need the server fully stopped.
 */
registerCommand('shutdown', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  logger.warn(
    { chatJid: ctx.chatJid, user: ctx.senderName },
    'Shutdown command received — stopping server permanently',
  );

  return {
    reply: '🛑 Shutting down EureClaw. Server will NOT auto-restart. Use start-eureclaw to start again.',
    action: 'shutdown',
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
 * /status - Check bot status with detailed session info
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

  // Gather rich status info
  const monitoring = getMonitoring();
  const modelInfo = getModelInfo();
  const sessions = getSessions();
  const workspaces = getRegisteredWorkspaces();
  const stats = monitoring.getStats();
  const uptime = monitoring.getUptime();
  const activeExecs = monitoring.getActiveExecutions();

  // Format uptime
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const uptimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Session info for current chat
  const folder = ctx.group?.folder;
  const sessionId = folder ? sessions[folder] : undefined;

  // Token stats from recent bot messages in this chat
  let tokenStats = { totalOutput: 0, totalReasoning: 0, totalCost: 0, responses: 0, lastInput: 0, lastModelID: '' };
  if (ctx.chatJid) {
    try {
      const { messages } = getMessagesPage(ctx.chatJid, 100);
      const botMsgs = messages.filter(m => m.is_bot_message && m.metadata?.tokens);
      for (const m of botMsgs) {
        const t = m.metadata!.tokens!;
        tokenStats.totalOutput += t.output;
        tokenStats.totalReasoning += t.reasoning || 0;
        tokenStats.totalCost += m.metadata!.cost ?? 0;
        tokenStats.responses++;
      }
      // Last context size = input + cacheRead (cached tokens are still part of the context window)
      if (botMsgs.length > 0) {
        const lastMeta = botMsgs[botMsgs.length - 1].metadata!;
        const t = lastMeta.tokens!;
        const cacheRead = t.cacheRead ?? 0;
        tokenStats.lastInput = t.input + cacheRead;
        tokenStats.lastModelID = lastMeta.modelID || '';
      }
    } catch { /* ignore */ }
  }

  // Try to get context window limit from OpenCode server
  let contextLimit = 0;
  let contextPercent = 0;
  let providerDebug = '';
  try {
    const host = getOpenCodeHost();
    const port = getOpenCodePort();
    const resp = await fetch(`http://${host}:${port}/config/providers`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json() as any;
      const candidates = [tokenStats.lastModelID, modelInfo.primary].filter(Boolean);
      const providers = data?.providers || data || [];
      const allModelIds: string[] = [];
      for (const provider of (Array.isArray(providers) ? providers : [])) {
        const models = provider.models || {};
        for (const model of Object.values(models) as any[]) {
          const mid = model.id || '';
          allModelIds.push(mid);
          for (const candidate of candidates) {
            const candidateShort = candidate.split('/').pop() || '';
            const midShort = mid.split('/').pop() || '';
            if (mid === candidate || candidate.includes(mid) || mid.includes(candidate) ||
                (candidateShort && midShort && candidateShort === midShort)) {
              if (model.limit?.context) {
                contextLimit = model.limit.context;
                break;
              }
            }
          }
          if (contextLimit > 0) break;
        }
        if (contextLimit > 0) break;
      }
      providerDebug = `providers=${(Array.isArray(providers) ? providers : []).length}, models=[${allModelIds.join(', ')}]`;
    } else {
      providerDebug = `fetch failed: ${resp.status}`;
    }
  } catch (err) {
    providerDebug = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (contextLimit > 0 && tokenStats.lastInput > 0) {
    contextPercent = Math.round((tokenStats.lastInput / contextLimit) * 100);
  }

  logger.info({
    lastInput: tokenStats.lastInput,
    lastModelID: tokenStats.lastModelID,
    configuredModel: modelInfo.primary,
    contextLimit,
    contextPercent,
    responses: tokenStats.responses,
    providerDebug,
  }, '/status context debug');

  // Build status text
  let s = `✅ ${ASSISTANT_NAME} is awake\n\n`;
  s += `⏱ Uptime: ${uptimeStr}\n`;
  s += `🧠 Model: ${modelInfo.primary}\n`;
  if (modelInfo.small !== modelInfo.primary) {
    s += `🔹 Small: ${modelInfo.small}\n`;
  }
  // Show current workspace and its connected channels
  if (folder) {
    const channelJids = Object.entries(workspaces)
      .filter(([, ws]) => ws.folder === folder)
      .map(([jid]) => jid);
    s += `📡 Workspace: ${folder} (${channelJids.length} channel${channelJids.length !== 1 ? 's' : ''})\n`;
    for (const jid of channelJids) {
      s += `├ ${formatJidLabel(jid)}\n`;
    }
  } else {
    s += `📡 Workspaces: ${Object.keys(workspaces).length} registered\n`;
  }

  if (activeExecs.length > 0) {
    s += `⚡ Active: ${activeExecs.length} execution(s)\n`;
  }

  s += `\n📊 Session Stats (${stats.totalExecutions} total)\n`;
  s += `├ Success: ${stats.successRate.toFixed(0)}%\n`;
  s += `└ Avg duration: ${(stats.averageDuration / 1000).toFixed(1)}s\n`;

  if (sessionId) {
    // Try to fetch session title from OpenCode API
    let sessionTitle = '';
    try {
      const host = getOpenCodeHost();
      const port = getOpenCodePort();
      const resp = await fetch(`http://${host}:${port}/session`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const sessions = await resp.json() as any[];
        const current = (Array.isArray(sessions) ? sessions : []).find(
          (s: any) => (s.id || s.data?.id) === sessionId,
        );
        if (current?.title) sessionTitle = current.title;
      }
    } catch { /* ignore - title is optional */ }

    s += `\n💬 Current Session\n`;
    if (sessionTitle) {
      s += `├ Title: ${sessionTitle}\n`;
    }
    s += `├ ID: ${sessionId.slice(0, 12)}…\n`;
    s += `├ Responses: ${tokenStats.responses}\n`;
    s += `├ Output: ${tokenStats.totalOutput.toLocaleString()} tokens\n`;
    if (tokenStats.totalReasoning > 0) {
      s += `├ Reasoning: ${tokenStats.totalReasoning.toLocaleString()} tokens\n`;
    }
    if (tokenStats.totalCost > 0) {
      s += `├ Cost: $${tokenStats.totalCost.toFixed(4)}\n`;
    }
    if (contextPercent > 0) {
      const bar = buildContextBar(contextPercent);
      s += `├ Context: ${bar} ${contextPercent}%`;
      if (contextLimit > 0) {
        s += ` (${(tokenStats.lastInput / 1000).toFixed(0)}k/${(contextLimit / 1000).toFixed(0)}k)`;
      }
      s += '\n';
    } else if (tokenStats.lastInput > 0) {
      // We have input tokens but couldn't determine the limit
      s += `├ Last context: ${(tokenStats.lastInput / 1000).toFixed(1)}k tokens\n`;
    }
    s += `└ Model: ${tokenStats.lastModelID || 'unknown'}\n`;
  } else {
    s += `\n💬 No active session\n`;
  }

  // OpenCode ecosystem info
  try {
    const ocStatus = getOpenCodeStatus();
    s += formatOpenCodeStatusText(ocStatus);
  } catch { /* ignore */ }

  return { reply: s };
});

/** Format a JID into a human-readable channel label */
function formatJidLabel(jid: string): string {
  if (jid.startsWith('web:')) return `🌐 Web UI (${jid})`;
  if (jid.startsWith('tg:')) {
    const id = jid.slice(3);
    return id.startsWith('-') ? `📢 Telegram group (${jid})` : `💬 Telegram (${jid})`;
  }
  if (jid.endsWith('@g.us')) return `👥 WhatsApp group (${jid.split('@')[0]})`;
  if (jid.endsWith('@s.whatsapp.net')) return `💬 WhatsApp (${jid.split('@')[0]})`;
  return jid;
}

/** Build a text progress bar for context usage */
function buildContextBar(percent: number): string {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  const empty = total - filled;
  const color = percent >= 80 ? '🔴' : percent >= 50 ? '🟡' : '🟢';
  return color + '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * /undo [steps] - Undo conversation steps
 */
registerCommand('undo', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  const sessions = getSessions();
  const sessionId = sessions[ctx.group.folder];

  if (!sessionId) {
    return {
      reply: '❌ No active session found. Start a conversation first.',
    };
  }

  const steps = ctx.args.length > 0 ? parseInt(ctx.args[0], 10) : 1;

  if (isNaN(steps) || steps < 1) {
    return {
      reply: '❌ Invalid number of steps. Usage: /undo [steps]\nExample: /undo 2',
    };
  }

  const result = await undo(sessionId, steps);

  logger.info(
    { chatJid: ctx.chatJid, user: ctx.senderName, steps, sessionId },
    'Undo command executed',
  );

  return { reply: result };
});

/**
 * /redo [steps] - Redo conversation steps
 */
registerCommand('redo', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  const sessions = getSessions();
  const sessionId = sessions[ctx.group.folder];

  if (!sessionId) {
    return {
      reply: '❌ No active session found. Start a conversation first.',
    };
  }

  const steps = ctx.args.length > 0 ? parseInt(ctx.args[0], 10) : 1;

  if (isNaN(steps) || steps < 1) {
    return {
      reply: '❌ Invalid number of steps. Usage: /redo [steps]\nExample: /redo 2',
    };
  }

  const result = await redo(sessionId, steps);

  logger.info(
    { chatJid: ctx.chatJid, user: ctx.senderName, steps, sessionId },
    'Redo command executed',
  );

  return { reply: result };
});

/**
 * /stop - Abort the current OpenCode session (stops ongoing generation)
 */
registerCommand('stop', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return { reply: '⛔ This command is only available in registered chats.' };
  }

  const sessions = getSessions();
  const sessionId = sessions[ctx.group.folder];

  if (!sessionId) {
    return { reply: '❌ No active session to stop.' };
  }

  try {
    const baseUrl = `http://${getOpenCodeHost()}:${getOpenCodePort()}`;
    const client = createOpencodeClient({ baseUrl });
    await client.session.abort({ path: { id: sessionId } });

    logger.info({ chatJid: ctx.chatJid, sessionId, user: ctx.senderName }, '/stop: Session aborted');
    return { reply: `🛑 Session aborted (${sessionId.slice(0, 12)}…).\nThe agent has stopped processing.` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId, err: errMsg }, '/stop: Abort failed');
    return { reply: `❌ Failed to stop session: ${errMsg}` };
  }
});

/**
 * /clear - Delete the current OpenCode session entirely
 */
registerCommand('clear', async (ctx: CommandContext): Promise<CommandResponse> => {
  if (!ctx.group) {
    return { reply: '⛔ This command is only available in registered chats.' };
  }

  const sessions = getSessions();
  const sessionId = sessions[ctx.group.folder];

  if (!sessionId) {
    return { reply: '❌ No active session to clear.' };
  }

  try {
    const baseUrl = `http://${getOpenCodeHost()}:${getOpenCodePort()}`;
    const client = createOpencodeClient({ baseUrl });
    await client.session.delete({ path: { id: sessionId } });

    // Clear the session from state so next message creates a fresh one
    setWorkspaceSession(ctx.group.folder, '');

    logger.info({ chatJid: ctx.chatJid, sessionId, user: ctx.senderName }, '/clear: Session deleted');
    return { reply: `🗑️ Session deleted (${sessionId.slice(0, 12)}…).\nNext message will start a fresh session.` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId, err: errMsg }, '/clear: Delete failed');
    return { reply: `❌ Failed to clear session: ${errMsg}` };
  }
});

/**
 * /help - Show available commands
 */
registerCommand('help', async (ctx: CommandContext): Promise<CommandResponse> => {
  // Build agent list dynamically from discovered agents
  const agentLines = discoveredAgents
    .map(a => `/${a.name} [message] - ${a.description}`)
    .join('\n');

  const helpText =
    `🤖 ${ASSISTANT_NAME} Commands\n\n` +
    '**Agent Modes:**\n' +
    agentLines + '\n' +
    '/model <model-id> [message] - Override model\n' +
    '/agent <name> [message] - Switch to any agent\n\n' +
    '**System Control:**\n' +
    '/restart - Restart the bot\n' +
    '/shutdown - Stop the server completely (no auto-restart)\n' +
    '/status - Check bot status\n\n' +
    '**Sleep Mode:**\n' +
    '/sleep [duration] - Pause all activity\n' +
    '  Examples: /sleep 4h, /sleep 30m, /sleep 2d\n' +
    '/awake - Wake from sleep mode\n\n' +
    '**Session:**\n' +
    '/new - Start a new conversation session\n' +
    '/stop - Stop the current agent execution\n' +
    '/clear - Delete the current session entirely\n' +
    '/undo [steps] - Undo conversation steps (default: 1)\n' +
    '/redo [steps] - Redo conversation steps (default: 1)\n\n' +
    '**Info:**\n' +
    '/help - Show this help message\n' +
    '/chatid - Get chat registration ID (Telegram only)';

  return { reply: helpText };
});

logger.info('Built-in commands registered');
