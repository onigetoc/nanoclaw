/**
 * Main message polling loop and startup recovery.
 */
import {
  ASSISTANT_NAME,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { getMessagesSince, getNewMessages } from './db.js';
import { GroupQueue } from './group-queue.js';
import { findChannel, formatMessages } from './router.js';
import {
  getRegisteredGroups,
  getLastTimestamp,
  setLastTimestamp,
  getLastAgentTimestampForJid,
  setLastAgentTimestampForJid,
  isMessageLoopRunning,
  setMessageLoopRunning,
  saveState,
} from './state.js';
import { Channel, NewMessage } from './types.js';
import { logger } from './logger.js';
import { isSleeping } from './commands/sleep-manager.js';

/**
 * Start the main message polling loop.
 * Polls for new messages and dispatches them to the queue.
 */
export async function startMessageLoop(
  queue: GroupQueue,
  channels: Channel[],
  assistantName: string,
): Promise<void> {
  if (isMessageLoopRunning()) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  setMessageLoopRunning(true);

  logger.info(`EureClaw running (trigger: @${assistantName})`);

  while (true) {
    try {
      if (isSleeping()) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      const registeredGroups = getRegisteredGroups();
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(jids, getLastTimestamp(), ASSISTANT_NAME);

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        setLastTimestamp(newTimestamp);
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

          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          const allPending = getMessagesSince(
            chatJid,
            getLastAgentTimestampForJid(chatJid),
            ASSISTANT_NAME,
          );
          const messagesToSend = allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            setLastAgentTimestampForJid(
              chatJid,
              messagesToSend[messagesToSend.length - 1].timestamp,
            );
            saveState();
            const channel = findChannel(channels, chatJid);
            if (channel) {
              channel.setTyping?.(chatJid, true);
            }
          } else {
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
 */
export function recoverPendingMessages(queue: GroupQueue): void {
  const registeredGroups = getRegisteredGroups();
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = getLastAgentTimestampForJid(chatJid);
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
