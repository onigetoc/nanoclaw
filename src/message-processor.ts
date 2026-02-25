/**
 * Message processing: runs the agent for a group and handles output streaming.
 */
import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  TRIGGER_PATTERN,
} from './config.js';
import {
  ContainerOutput,
  runContainerAgent,
  shouldUseDirectMode,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import { runDirectAgent } from './direct-runner.js';
import { getAllTasks, getMessagesSince, storeMessageDirect } from './db.js';
import { GroupQueue } from './group-queue.js';
import { findChannel, formatMessages, sendDeduped } from './router.js';
import {
  getRegisteredGroups,
  getSessions,
  getLastAgentTimestampForJid,
  setLastAgentTimestampForJid,
  setGroupSession,
  saveState,
} from './state.js';
import { getAvailableGroups } from './group-manager.js';
import { RegisteredGroup, Channel } from './types.js';
import { logger } from './logger.js';
import { ensureServerHealthy } from './opencode-server.js';
import { getMonitoring } from './monitoring.js';

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
export async function processGroupMessages(
  chatJid: string,
  queue: GroupQueue,
  channels: Channel[],
): Promise<boolean> {
  const registeredGroups = getRegisteredGroups();
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
  const sinceTimestamp = getLastAgentTimestampForJid(chatJid);
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

  // Advance cursor; save old cursor for rollback on error
  const previousCursor = getLastAgentTimestampForJid(chatJid);
  setLastAgentTimestampForJid(chatJid, missedMessages[missedMessages.length - 1].timestamp);
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  const monitoring = getMonitoring();
  const sessions = getSessions();
  const executionId = monitoring.startExecution({
    groupName: group.name,
    groupFolder: group.folder,
    chatJid,
    messageCount: missedMessages.length,
    sessionId: sessions[group.folder],
  });

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ group: group.name }, 'Idle timeout, closing container stdin');
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  const channel = findChannel(channels, chatJid);
  if (!channel) return true;

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(group, prompt, chatJid, queue, async (result) => {
    if (result.result) {
      const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        await sendDeduped(channel, chatJid, text);
        outputSentToUser = true;
        monitoring.markOutputSent(executionId);

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
      resetIdleTimer();
    }

    if (result.status === 'error') {
      hadError = true;
      monitoring.updateExecution(executionId, { status: 'error', error: result.error });
    }
  });

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    if (outputSentToUser) {
      logger.warn({ group: group.name }, 'Agent error after output was sent, skipping cursor rollback to prevent duplicates');
      monitoring.updateExecution(executionId, { status: 'completed' });
      return true;
    }
    setLastAgentTimestampForJid(chatJid, previousCursor);
    saveState();
    logger.warn({ group: group.name }, 'Agent error, rolled back message cursor for retry');
    monitoring.updateExecution(executionId, { status: 'error', error: 'Agent execution failed' });
    return false;
  }

  monitoring.updateExecution(executionId, { status: 'completed' });
  return true;
}

/**
 * Run the agent (container or direct mode) for a group.
 */
async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  queue: GroupQueue,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessions = getSessions();
  const sessionId = sessions[group.folder];
  const registeredGroups = getRegisteredGroups();

  const serverOk = await ensureServerHealthy();
  if (!serverOk) {
    logger.error({ group: group.name }, 'OpenCode server unreachable, skipping agent run');
    return 'error';
  }

  // Update tasks snapshot
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

  // Update available groups snapshot
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          setGroupSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const runAgentFn = shouldUseDirectMode() ? runDirectAgent : runContainerAgent;
    const output = await runAgentFn(
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
      setGroupSession(group.folder, output.newSessionId);
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
