/**
 * Main message polling loop and startup recovery.
 */
import {
  ASSISTANT_NAME,
  MAIN_WORKSPACE_FOLDER,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { getMessagesSince, getMessagesSinceLinked, getNewMessages } from './db.js';
import { WorkspaceQueue } from './workspace-queue.js';
import { findChannel, formatMessages } from './router.js';
import {
  getRegisteredWorkspaces,
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

function resolveWorkspaceJid(
  chatJid: string,
  registeredWorkspaces: Record<string, unknown>,
): string | null {
  // Direct lookup first
  if (registeredWorkspaces[chatJid]) {
    return chatJid;
  }

  // If starts with web: prefix, try without prefix (WebUI channel)
  if (chatJid.startsWith('web:')) {
    const originalJid = chatJid.slice(4);
    if (registeredWorkspaces[originalJid]) {
      return originalJid;
    }
  }

  return null;
}

/**
 * Start the main message polling loop.
 * Polls for new messages and dispatches them to the queue.
 */
export async function startMessageLoop(
  queue: WorkspaceQueue,
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

      const registeredWorkspaces = getRegisteredWorkspaces();
      const jids = Object.keys(registeredWorkspaces);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        getLastTimestamp(),
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        setLastTimestamp(newTimestamp);
        saveState();

        // Deduplicate by workspace
        const messagesByWorkspace = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByWorkspace.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByWorkspace.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, workspaceMessages] of messagesByWorkspace) {
          const resolvedJid = resolveWorkspaceJid(chatJid, registeredWorkspaces);
          if (!resolvedJid) continue;

          const workspace = registeredWorkspaces[resolvedJid];

          const isMainWorkspace = workspace.folder === MAIN_WORKSPACE_FOLDER;
          const needsTrigger = !isMainWorkspace && workspace.requiresTrigger !== false;

          if (needsTrigger) {
            const hasTrigger = workspaceMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          const allPending = getMessagesSinceLinked(
            resolvedJid,
            getLastAgentTimestampForJid(resolvedJid),
            ASSISTANT_NAME,
          );
          // If allPending is empty, the per-JID cursor already covers these
          // messages (they were consumed by processWorkspaceMessages triggered
          // via processApiMessage or a prior loop iteration).  Falling back
          // to workspaceMessages would re-pipe already-processed messages to the
          // active container, causing the agent to respond multiple times.
          if (allPending.length === 0) continue;
          const messagesToSend = allPending;
          const formatted = formatMessages(messagesToSend);

          // Use chatJid (may have web: prefix) for channel routing, not resolvedJid
          if (queue.sendMessage(resolvedJid, formatted)) {
            logger.debug(
              { chatJid: resolvedJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            setLastAgentTimestampForJid(
              resolvedJid,
              messagesToSend[messagesToSend.length - 1].timestamp,
            );
            saveState();
            const channel = findChannel(channels, chatJid);
            if (channel) {
              channel.setTyping?.(chatJid, true);
            }
          } else {
            queue.enqueueMessageCheck(resolvedJid);
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
 * Startup recovery: check for unprocessed messages in registered workspaces.
 * Only recovers messages from the last 5 minutes to avoid replaying
 * stale conversations from before a restart.
 */
export function recoverPendingMessages(queue: WorkspaceQueue): void {
  const registeredWorkspaces = getRegisteredWorkspaces();
  const MAX_RECOVERY_AGE_MS = 5 * 60 * 1000; // 5 minutes
  const cutoff = new Date(Date.now() - MAX_RECOVERY_AGE_MS).toISOString();

  for (const [chatJid, workspace] of Object.entries(registeredWorkspaces)) {
    const sinceTimestamp = getLastAgentTimestampForJid(chatJid);
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      // Only recover messages that are recent (within the last 5 minutes).
      // Older messages are stale — replaying them would cause the agent to
      // resume old conversations or re-execute tool calls unprompted.
      const recentPending = pending.filter((m) => m.timestamp >= cutoff);
      if (recentPending.length > 0) {
        logger.info(
          { workspace: workspace.name, pendingCount: recentPending.length, skipped: pending.length - recentPending.length },
          'Recovery: found recent unprocessed messages',
        );
        queue.enqueueMessageCheck(chatJid);
      } else {
        // Advance the cursor past stale messages so they're never replayed
        const lastStale = pending[pending.length - 1];
        setLastAgentTimestampForJid(chatJid, lastStale.timestamp);
        saveState();
        logger.info(
          { workspace: workspace.name, staleCount: pending.length, oldestAge: lastStale.timestamp },
          'Recovery: skipped stale messages (older than 5 min), advanced cursor',
        );
      }
    }
  }
}
