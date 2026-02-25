/**
 * Application startup: container system checks, channel init, and main() entry point.
 */
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

import {
  ASSISTANT_NAME,
  TELEGRAM_ONLY,
} from './config.js';
import { readEnvFile } from './env.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { TelegramChannel } from './channels/telegram.js';
import {
  writeGroupsSnapshot,
} from './container-runner.js';
import {
  initDatabase,
  storeMessage,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatOutbound, sendDeduped } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, Channel } from './types.js';
import { logger } from './logger.js';
import { attemptAutoRegistration } from './auto-registration.js';
import {
  ensureServerHealthy,
  startServer,
  startHealthChecks,
  stopServer,
} from './opencode-server.js';
import { scanAndGetApiKeys, logApiKeysReport } from './api-key-scanner.js';
import { executeCommand } from './commands/index.js';
import './commands/builtin-commands.js';
import { loadSleepState, isSleeping, setOnWakeCallback } from './commands/sleep-manager.js';
import { initMonitoring } from './monitoring.js';
import {
  loadState,
  getRegisteredGroups,
  getSessions,
  reloadRegisteredGroups,
} from './state.js';
import { registerGroup, getAvailableGroups, isPrivateChat } from './group-manager.js';
import { processGroupMessages } from './message-processor.js';
import { startMessageLoop, recoverPendingMessages } from './message-loop.js';

export function ensureContainerSystemRunning(): void {
  if (os.platform() !== 'darwin') {
    logger.info({ platform: os.platform() }, 'Running in direct mode (no container isolation)');
    console.log('\n⚠️  Running in DIRECT MODE (no container isolation)');
    console.log('   This is less secure but works on Windows/Linux without Docker.\n');
    return;
  }

  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    try {
      execSync('container system start', { stdio: 'pipe', timeout: 30000 });
      logger.info('Apple Container system started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Apple Container system');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Apple Container system failed to start                 ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Apple Container. To fix:           ║',
      );
      console.error(
        '║  1. Install from: https://github.com/apple/container/releases ║',
      );
      console.error(
        '║  2. Run: container system start                               ║',
      );
      console.error(
        '║  3. Restart EureClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Apple Container system is required but failed to start');
    }
  }

  // Kill orphaned EureClaw containers from previous runs
  try {
    const output = execSync('container ls --format json', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const containers: { status: string; configuration: { id: string } }[] = JSON.parse(output || '[]');
    const orphans = containers
      .filter((c) => c.status === 'running' && c.configuration.id.startsWith('eureclaw-'))
      .map((c) => c.configuration.id);
    for (const name of orphans) {
      try {
        execSync(`container stop ${name}`, { stdio: 'pipe' });
      } catch { /* already stopped */ }
    }
    if (orphans.length > 0) {
      logger.info({ count: orphans.length, names: orphans }, 'Stopped orphaned containers');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}

export async function main(): Promise<void> {
  const apiKeys = scanAndGetApiKeys();
  logApiKeysReport(apiKeys);

  ensureContainerSystemRunning();

  await startServer();
  startHealthChecks();

  initDatabase();
  logger.info('Database initialized');

  const logsDir = path.join(process.cwd(), 'logs');
  initMonitoring(logsDir);
  logger.info('Monitoring service initialized');

  loadState();
  loadSleepState();
  logger.info({ isSleeping: isSleeping() }, 'Sleep state loaded');

  let whatsapp: WhatsAppChannel;
  const channels: Channel[] = [];
  const queue = new GroupQueue();

  // Setup wake callback
  setOnWakeCallback(async (chatJid: string, message: string) => {
    const channel = findChannel(channels, chatJid);
    if (channel) {
      await channel.sendMessage(chatJid, message);
      logger.info({ chatJid }, 'Auto-wake message sent');
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopServer();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks
  const channelOpts = {
    onMessage: async (chatJid: string, msg: NewMessage) => {
      let registeredGroups = getRegisteredGroups();
      let group = registeredGroups[chatJid];

      if (!group) {
        const chatName = msg.sender_name || chatJid;
        const isPrivate = msg.is_private_chat ?? isPrivateChat(chatJid);
        const result = attemptAutoRegistration(chatJid, chatName, isPrivate);

        if (result.registered) {
          reloadRegisteredGroups();
          registeredGroups = getRegisteredGroups();
          group = registeredGroups[chatJid];
          logger.info(
            { jid: chatJid, name: chatName, isPrivate, folder: 'main' },
            'Auto-registered chat as main group',
          );
        } else if (result.reason === 'already_exists') {
          logger.debug(
            { jid: chatJid, reason: result.reason },
            'Auto-registration skipped: main group already exists',
          );
        } else if (result.reason === 'not_eligible') {
          logger.error(
            { jid: chatJid, name: chatName, reason: result.reason },
            'Auto-registration failed',
          );
        }
      }

      // Check for slash commands
      const commandResult = await executeCommand(msg.content, {
        chatJid,
        senderName: msg.sender_name,
        senderId: msg.sender,
        group,
      });

      if (commandResult) {
        if (commandResult.reply) {
          const channel = findChannel(channels, chatJid);
          if (channel) {
            await channel.sendMessage(chatJid, commandResult.reply);
          }
        }
        if (commandResult.action === 'restart') {
          setTimeout(() => {
            logger.info('Initiating restart via command');
            process.exit(0);
          }, 2000);
        }
        return;
      }

      if (isSleeping()) {
        logger.debug({ chatJid, sender: msg.sender_name }, 'Message ignored (bot sleeping)');
        return;
      }

      storeMessage(msg);
    },
    onChatMetadata: (chatJid: string, timestamp: string, name?: string) =>
      storeChatMetadata(chatJid, timestamp, name),
    registeredGroups: () => getRegisteredGroups(),
  };

  // Load secrets
  const secrets = readEnvFile(['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY']);
  const telegramToken = secrets.TELEGRAM_BOT_TOKEN || '';

  if (secrets.GEMINI_API_KEY) process.env.GEMINI_API_KEY = secrets.GEMINI_API_KEY;
  if (secrets.GOOGLE_API_KEY) process.env.GOOGLE_API_KEY = secrets.GOOGLE_API_KEY;
  if (secrets.OPENAI_API_KEY) process.env.OPENAI_API_KEY = secrets.OPENAI_API_KEY;

  // Create and connect channels
  if (!TELEGRAM_ONLY) {
    whatsapp = new WhatsAppChannel(channelOpts);
    channels.push(whatsapp);
    await whatsapp.connect();
  }

  if (telegramToken) {
    const telegram = new TelegramChannel(telegramToken, channelOpts);
    channels.push(telegram);
    await telegram.connect();
  }

  // Start subsystems
  startSchedulerLoop({
    registeredGroups: () => getRegisteredGroups(),
    getSessions: () => getSessions(),
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) return;
      const text = formatOutbound(rawText);
      if (text) {
        await channel.sendMessage(jid, text);
        storeMessageDirect({
          id: `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          chat_jid: jid,
          sender: 'bot',
          sender_name: ASSISTANT_NAME,
          content: text,
          timestamp: new Date().toISOString(),
          is_from_me: true,
          is_bot_message: true,
        });
      }
    },
  });

  startIpcWatcher({
    sendMessage: async (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      await sendDeduped(channel, jid, text);
      storeMessageDirect({
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        chat_jid: jid,
        sender: 'bot',
        sender_name: ASSISTANT_NAME,
        content: text,
        timestamp: new Date().toISOString(),
        is_from_me: true,
        is_bot_message: true,
      });
    },
    sendImage: async (jid, filePath, options) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      if (typeof channel.sendMedia === 'function') {
        await channel.sendMedia(jid, filePath, options);
        logger.info({ jid, filePath }, 'Image sent via channel');
      } else {
        const fallbackText = `📎 Image: ${filePath}${options?.caption ? `\n${options.caption}` : ''}`;
        await sendDeduped(channel, jid, fallbackText);
        logger.warn({ jid, channel: channel.name }, 'Channel does not support sendMedia, sent path as text');
      }
    },
    registeredGroups: () => getRegisteredGroups(),
    registerGroup,
    syncGroupMetadata: (force) => whatsapp?.syncGroupMetadata(force) ?? Promise.resolve(),
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) => writeGroupsSnapshot(gf, im, ag, rj),
  });

  queue.setProcessMessagesFn((chatJid) => processGroupMessages(chatJid, queue, channels));
  recoverPendingMessages(queue);
  startMessageLoop(queue, channels, ASSISTANT_NAME);
}
