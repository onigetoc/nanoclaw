import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TELEGRAM_ONLY,
  TRIGGER_PATTERN,
} from './config.js';
import { readEnvFile } from './env.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { TelegramChannel } from './channels/telegram.js';
import {
  ContainerOutput,
  runContainerAgent,
  shouldUseDirectMode,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import { runDirectAgent } from './direct-runner.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
  storeMessageDirect,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startIpcWatcher } from './ipc.js';
import { formatMessages, formatOutbound, findChannel, sendDeduped } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, RegisteredGroup, Channel } from './types.js';
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
import './commands/builtin-commands.js'; // Register built-in commands
import { loadSleepState, isSleeping, setOnWakeCallback } from './commands/sleep-manager.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

let whatsapp: WhatsAppChannel;
const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
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

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(lastAgentTimestamp),
  );
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Copy templates if group folder has no .md files yet
  copyTemplatesToGroup(groupDir);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Copy template files from groups/templates/ into a new group folder.
 * Renames .tpl.md → .md and substitutes {{ASSISTANT_NAME}}.
 * Skips if the group already has .md files (not a fresh group).
 */
function copyTemplatesToGroup(groupDir: string): void {
  // Check if group already has .md files (skip if not fresh)
  const existingFiles = fs.readdirSync(groupDir);
  const hasMdFiles = existingFiles.some(
    (f) => f.endsWith('.md') && !f.endsWith('.tpl.md'),
  );
  if (hasMdFiles) return;

  const templatesDir = path.join(GROUPS_DIR, 'templates');
  if (!fs.existsSync(templatesDir)) {
    logger.warn({ templatesDir }, 'Templates directory not found, skipping template copy');
    return;
  }

  const templates = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.tpl.md'));
  if (templates.length === 0) return;

  const variables: Record<string, string> = {
    ASSISTANT_NAME,
  };

  for (const tplFile of templates) {
    let content = fs.readFileSync(path.join(templatesDir, tplFile), 'utf-8');

    // Substitute {{VARIABLE}} patterns
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    const outputName = tplFile.replace('.tpl.md', '.md');
    fs.writeFileSync(path.join(groupDir, outputName), content, 'utf-8');
  }

  logger.info(
    { groupDir, templateCount: templates.length },
    'Copied templates to new group',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && (c.jid.endsWith('@g.us') || c.jid.startsWith('tg:')))
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void {
  registeredGroups = groups;
}

/**
 * Determine if a JID represents a private/DM chat.
 * 
 * @param jid - The chat JID
 * @returns true if private chat, false if group chat
 */
function isPrivateChat(jid: string): boolean {
  // WhatsApp private: ends with @s.whatsapp.net
  if (jid.endsWith('@s.whatsapp.net')) return true;
  
  // WhatsApp group: ends with @g.us
  if (jid.endsWith('@g.us')) return false;
  
  // Telegram private: tg:positive_number
  // Telegram group: tg:negative_number (e.g., tg:-1001234567890)
  if (jid.startsWith('tg:')) {
    const numericId = jid.replace(/^tg:/, '');
    return !numericId.startsWith('-');
  }
  
  // Unknown format, assume group for safety
  return false;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ group: group.name }, 'Idle timeout, closing container stdin');
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  // Find the channel that owns this JID
  const channel = findChannel(channels, chatJid);
  if (!channel) return true;

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    // Streaming output callback — called for each agent result
    if (result.result) {
      const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
      // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        await sendDeduped(channel, chatJid, text);
        outputSentToUser = true;
        
        // Store bot response in SQLite for conversation history
        storeMessageDirect({
          id: `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          chat_jid: chatJid,
          sender: 'bot',
          sender_name: ASSISTANT_NAME,
          content: text,
          timestamp: new Date().toISOString(),
          is_from_me: true,
          is_bot_message: true,
        });
      }
      // Only reset idle timer on actual results, not session-update markers (result: null)
      resetIdleTimer();
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn({ group: group.name }, 'Agent error after output was sent, skipping cursor rollback to prevent duplicates');
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn({ group: group.name }, 'Agent error, rolled back message cursor for retry');
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Ensure OpenCode server is alive before spawning a container
  const serverOk = await ensureServerHealthy();
  if (!serverOk) {
    logger.error({ group: group.name }, 'OpenCode server unreachable, skipping agent run');
    return 'error';
  }

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const runAgent = shouldUseDirectMode() ? runDirectAgent : runContainerAgent;
    const output = await runAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
      },
      (proc, containerName) => queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`EureClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      // Skip processing if bot is sleeping
      if (isSleeping()) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(jids, lastTimestamp, ASSISTANT_NAME);

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            const channel = findChannel(channels, chatJid);
            if (channel) {
              channel.setTyping?.(chatJid, true);
            }
          } else {
            // No active container — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  // Skip container checks on non-macOS platforms
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

  // Kill and clean up orphaned EureClaw containers from previous runs
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

async function main(): Promise<void> {
  // Scan des clés API au démarrage
  const apiKeys = scanAndGetApiKeys();
  logApiKeysReport(apiKeys);

  ensureContainerSystemRunning();

  // Start and supervise the OpenCode server
  await startServer();
  startHealthChecks();

  initDatabase();
  logger.info('Database initialized');
  loadState();
  loadSleepState();
  logger.info({ isSleeping: isSleeping() }, 'Sleep state loaded');

  // Setup wake callback to send message when bot wakes up automatically
  setOnWakeCallback(async (chatJid: string, message: string) => {
    const channel = findChannel(channels, chatJid);
    if (channel) {
      await channel.sendMessage(chatJid, message);
      logger.info({ chatJid }, 'Auto-wake message sent');
    }
  });

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopServer();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: async (chatJid: string, msg: NewMessage) => {
      // Check if chat is registered
      let group = registeredGroups[chatJid];
      
      if (!group) {
        // Attempt auto-registration for unregistered chats
        const chatName = msg.sender_name || chatJid;
        // Use explicit is_private_chat field from channel, fallback to JID-based detection
        const isPrivate = msg.is_private_chat ?? isPrivateChat(chatJid);
        
        const result = attemptAutoRegistration(chatJid, chatName, isPrivate);
        
        if (result.registered) {
          // Reload registered groups from database
          registeredGroups = getAllRegisteredGroups();
          group = registeredGroups[chatJid];
          
          logger.info(
            { 
              jid: chatJid, 
              name: chatName, 
              isPrivate,
              folder: 'main' 
            },
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
      
      // Check for slash commands (universal across all channels)
      const commandResult = await executeCommand(msg.content, {
        chatJid,
        senderName: msg.sender_name,
        senderId: msg.sender,
        group,
      });

      if (commandResult) {
        // Command was executed - send reply if provided
        if (commandResult.reply) {
          const channel = findChannel(channels, chatJid);
          if (channel) {
            await channel.sendMessage(chatJid, commandResult.reply);
          }
        }

        // Handle special actions
        if (commandResult.action === 'restart') {
          // Give time for the message to be sent and connections to close
          setTimeout(() => {
            logger.info('Initiating restart via command');
            process.exit(0); // Exit cleanly - supervisor will restart
          }, 2000);
        }

        // Don't store command messages in DB or process them further
        return;
      }

      // If bot is sleeping, ignore all non-command messages
      if (isSleeping()) {
        logger.debug({ chatJid, sender: msg.sender_name }, 'Message ignored (bot sleeping)');
        return;
      }
      
      // Store message (existing logic)
      storeMessage(msg);
    },
    onChatMetadata: (chatJid: string, timestamp: string, name?: string) =>
      storeChatMetadata(chatJid, timestamp, name),
    registeredGroups: () => registeredGroups,
  };

  // Create and connect channels
  if (!TELEGRAM_ONLY) {
    whatsapp = new WhatsAppChannel(channelOpts);
    channels.push(whatsapp);
    await whatsapp.connect();
  }

  // Load Telegram token from .env (secret, not in process.env)
  const secrets = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const telegramToken = secrets.TELEGRAM_BOT_TOKEN || '';
  
  if (telegramToken) {
    const telegram = new TelegramChannel(telegramToken, channelOpts);
    channels.push(telegram);
    await telegram.connect();
  }

  // Start subsystems
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) return;
      const text = formatOutbound(rawText);
      if (text) {
        await channel.sendMessage(jid, text);
        
        // Store bot response in SQLite for conversation history
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
      
      // Store bot response in SQLite for conversation history
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
      
      // Check if channel supports sendMedia
      if (typeof channel.sendMedia === 'function') {
        await channel.sendMedia(jid, filePath, options);
        logger.info({ jid, filePath }, 'Image sent via channel');
      } else {
        // Fallback: send path as text if channel doesn't support media
        const fallbackText = `📎 Image: ${filePath}${options?.caption ? `\n${options.caption}` : ''}`;
        await sendDeduped(channel, jid, fallbackText);
        logger.warn({ jid, channel: channel.name }, 'Channel does not support sendMedia, sent path as text');
      }
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroupMetadata: (force) => whatsapp?.syncGroupMetadata(force) ?? Promise.resolve(),
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) => writeGroupsSnapshot(gf, im, ag, rj),
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop();
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start EureClaw');
    process.exit(1);
  });
}
