/**
 * Message processing: runs the agent for a workspace and handles output streaming.
 */
import { ChildProcess } from 'child_process';
import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  MAIN_WORKSPACE_FOLDER,
  TRIGGER_PATTERN,
} from './config.js';
import {
  ContainerOutput,
  runContainerAgent,
  shouldUseDirectMode,
  writeWorkspacesSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import { runDirectAgent } from './direct-runner.js';
import {
  getAllTasks,
  getMessagesSince,
  getMessagesSinceLinked,
  storeMessageDirect,
} from './db.js';
import { WorkspaceQueue } from './workspace-queue.js';
import {
  findChannel,
  formatMessages,
  sendDeduped,
  isDuplicate,
} from './router.js';
import {
  getRegisteredWorkspaces,
  getSessions,
  getLastAgentTimestampForJid,
  setLastAgentTimestampForJid,
  setWorkspaceSession,
  saveState,
} from './state.js';
import { getAvailableWorkspaces } from './workspace-manager.js';
import { RegisteredWorkspace, Channel } from './types.js';
import { logger } from './logger.js';
import { redactOutput } from './security/index.js';
import { ensureServerHealthy } from './opencode-server.js';
import { getMonitoring } from './monitoring.js';
import { broadcastToToken, broadcastStatus } from './api-server.js';

/**
 * Process all pending messages for a workspace.
 * Called by the WorkspaceQueue when it's this workspace's turn.
 */
export async function processWorkspaceMessages(
  chatJid: string,
  queue: WorkspaceQueue,
  channels: Channel[],
): Promise<boolean> {
  const registeredWorkspaces = getRegisteredWorkspaces();
  const workspace = registeredWorkspaces[chatJid];
  if (!workspace) return true;

  const isMainWorkspace = workspace.folder === MAIN_WORKSPACE_FOLDER;
  const sessions = getSessions();
  const sessionId = sessions[workspace.folder];

  const sinceTimestamp = getLastAgentTimestampForJid(chatJid);

  // Always use linked query so messages from ALL channels (Telegram, Web UI, etc.)
  // sharing the same workspace folder are collected together.
  // Previously, non-web JIDs used getMessagesSince (single JID) which missed
  // messages sent via the Web UI, causing cursor desync and message replay.
  const missedMessages = getMessagesSinceLinked(chatJid, sinceTimestamp, ASSISTANT_NAME);

  if (missedMessages.length === 0) return true;

  // For non-main workspaces, check if trigger is required and present
  if (!isMainWorkspace && workspace.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  // Get model/agent preferences from queue (set by web UI)
  const preferences = queue.getMessagePreferences(chatJid);
  
  // Advance cursor
  setLastAgentTimestampForJid(
    chatJid,
    missedMessages[missedMessages.length - 1].timestamp,
  );
  saveState();

  logger.info(
    { workspace: workspace.name, messageCount: missedMessages.length, model: preferences?.model, agent: preferences?.agent },
    'Processing messages',
  );

  // Broadcast status to web UI
  broadcastStatus(chatJid, 'processing', `Processing ${missedMessages.length} message(s)…`);

  const monitoring = getMonitoring();
  const executionId = monitoring.startExecution({
    workspaceName: workspace.name,
    workspaceFolder: workspace.folder,
    chatJid,
    agentType: preferences?.agent || 'orchestrator',
    messageCount: missedMessages.length,
    sessionId: sessionId,
  });

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { workspace: workspace.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  // Separate UI status timer: emit 'done' shortly after last output
  // so the green dots disappear quickly, even though the container
  // stays alive for follow-up messages (IDLE_TIMEOUT).
  // Also marks the execution as completed in monitoring so the Activity
  // timeline updates immediately instead of waiting for IDLE_TIMEOUT.
  let uiDoneTimer: ReturnType<typeof setTimeout> | null = null;
  let uiDoneEmitted = false;
  let executionCompleted = false;
  const UI_DONE_DELAY = 3000; // 3 seconds after last output
  const scheduleUiDone = () => {
    if (uiDoneTimer) clearTimeout(uiDoneTimer);
    uiDoneEmitted = false;
    uiDoneTimer = setTimeout(() => {
      broadcastStatus(chatJid, 'done');
      uiDoneEmitted = true;
      // Mark execution completed now — don't wait for IDLE_TIMEOUT / process exit
      if (!executionCompleted && !hadError) {
        executionCompleted = true;
        monitoring.addStep(executionId, 'done', actualModel ? `Completed with ${actualModel}` : 'Completed');
        monitoring.updateExecution(executionId, { status: 'completed', model: actualModel });
      }
    }, UI_DONE_DELAY);
  };

  const channel = findChannel(channels, chatJid);
  if (!channel) return true;

  monitoring.addStep(executionId, 'init', 'Starting agent…', { model: preferences?.model, agent: preferences?.agent });

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let lastErrorMessage = '';
  let actualModel: string | undefined;

  let output = await runAgent(
    workspace,
    prompt,
    chatJid,
    queue,
    executionId,
    preferences,
    async (result) => {
      if (result.result) {
        broadcastStatus(chatJid, 'responding');
        uiDoneEmitted = false;
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);

        // Security: redact credentials/PII from agent output
        const { redacted: redactedRaw } = redactOutput(raw, chatJid, isMainWorkspace);

        const text = redactedRaw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info(
          { workspace: workspace.name, model: result.metadata?.modelID, provider: result.metadata?.providerID, agent: result.metadata?.agent },
          `Agent output: ${raw.slice(0, 200)}`,
        );
        // Track actual model used for monitoring
        if (result.metadata?.modelID && !actualModel) {
          actualModel = `${result.metadata.providerID || 'unknown'}/${result.metadata.modelID}`;
          monitoring.addStep(executionId, 'response', `Response from ${actualModel}`, {
            agent: result.metadata.agent,
            tokens: result.metadata.tokens,
            cost: result.metadata.cost,
          });
        }
        if (text) {
          const msgMetadata = result.metadata
            ? {
                modelID: result.metadata.modelID,
                providerID: result.metadata.providerID,
                mode: result.metadata.mode,
                agent: result.metadata.agent,
                tokens: result.metadata.tokens,
                cost: result.metadata.cost,
              }
            : undefined;

          // For web: JIDs, bypass sendDeduped (which uses WebUIChannel.sendMessage
          // and loses metadata). Instead, check dedup directly and broadcast with
          // metadata via broadcastToToken.
          const isWebJid = chatJid.startsWith('web:');
          if (isWebJid) {
            if (isDuplicate(chatJid, text)) return; // Duplicate — skip
          } else {
            const wasSent = await sendDeduped(channel, chatJid, text);
            if (!wasSent) return; // Duplicate — skip store & broadcast
          }
          monitoring.markOutputSent(executionId);

          const msgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const msgTimestamp = new Date().toISOString();

          storeMessageDirect({
            id: msgId,
            chat_jid: chatJid,
            sender: 'bot',
            sender_name: ASSISTANT_NAME,
            content: text,
            timestamp: msgTimestamp,
            is_from_me: true,
            is_bot_message: true,
            metadata: msgMetadata,
          });

          // Broadcast to web UI SSE clients — always include metadata.
          // For web: JIDs we broadcast directly here (not via WebUIChannel)
          // so metadata is preserved. For non-web JIDs this provides
          // cross-channel sync to any connected web clients.
          broadcastToToken(chatJid, {
            id: msgId,
            content: text,
            sender_name: ASSISTANT_NAME,
            timestamp: msgTimestamp,
            is_from_me: true,
            is_bot_message: true,
            metadata: msgMetadata,
          });
        }
        resetIdleTimer();
        scheduleUiDone();
      }

      if (result.status === 'error') {
        hadError = true;
        lastErrorMessage = result.error || 'Unknown error';
        monitoring.addStep(executionId, 'error', lastErrorMessage);
        monitoring.updateExecution(executionId, {
          status: 'error',
          error: result.error,
        });
      }
    },
  );

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);
  if (uiDoneTimer) clearTimeout(uiDoneTimer);
  // Always emit final 'done' to guarantee cleanup (no-op if already emitted)
  broadcastStatus(chatJid, 'done');

  if (output === 'error' || hadError) {
    // Send a user-visible error message in the conversation so the user knows what happened
    const errorDetail = lastErrorMessage || 'Agent execution failed';
    const userErrorText = formatErrorForUser(errorDetail);
    const errMsgId = `err_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const errTimestamp = new Date().toISOString();

    storeMessageDirect({
      id: errMsgId,
      chat_jid: chatJid,
      sender: 'bot',
      sender_name: ASSISTANT_NAME,
      content: userErrorText,
      timestamp: errTimestamp,
      is_from_me: true,
      is_bot_message: true,
    });

    broadcastToToken(chatJid, {
      id: errMsgId,
      content: userErrorText,
      sender_name: ASSISTANT_NAME,
      timestamp: errTimestamp,
      is_from_me: true,
      is_bot_message: true,
    });

    // Always keep the cursor advanced after showing the error to the user.
    // Rolling back causes infinite retry loops where the same messages keep
    // failing and the workspace appears "dead". The user sees the error message
    // and can simply send a new message to retry.
    logger.warn(
      { workspace: workspace.name, error: errorDetail },
      'Agent error — cursor kept advanced, user notified',
    );
    if (!executionCompleted) {
      monitoring.updateExecution(executionId, {
        status: 'error',
        error: errorDetail,
      });
    }
    return true; // Return true so the queue doesn't retry automatically
  }

  // Final completion — only if not already marked by scheduleUiDone timer
  if (!executionCompleted) {
    monitoring.addStep(executionId, 'done', actualModel ? `Completed with ${actualModel}` : 'Completed');
    monitoring.updateExecution(executionId, { status: 'completed', model: actualModel });
  }
  return true;
}

/**
 * Classify and format an error message for display in the conversation UI.
 * Turns raw technical errors into actionable, user-readable messages.
 */
function formatErrorForUser(rawError: string): string {
  const lower = rawError.toLowerCase();

  // Rate limit / quota exceeded
  if (
    lower.includes('429') ||
    lower.includes('rate') ||
    lower.includes('quota') ||
    lower.includes('limit exceeded') ||
    lower.includes('too many requests')
  ) {
    return `⚠️ Rate limit reached — the AI provider is throttling requests.\n\nYou can:\n• Wait a minute and send your message again\n• Use \`/model\` to switch to a different model`;
  }

  // Network / connectivity — "fetch failed" from the agent-runner usually means
  // the model provider timed out or is unreachable, not a local network issue.
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('apiconnectionerror')
  ) {
    return `⚠️ The AI model didn't respond — the provider may be slow or unreachable.\n\nYou can:\n• Send your message again to retry\n• Use \`/model\` to switch to a different model\n• Use \`/models\` to see available models`;
  }

  // General network
  if (
    lower.includes('network') ||
    lower.includes('dns') ||
    lower.includes('connectivity')
  ) {
    return `⚠️ Network error — check your internet connection.\n\n\`Details: ${rawError}\``;
  }

  // OpenCode server unreachable
  if (
    lower.includes('opencode server') ||
    lower.includes('unreachable') ||
    lower.includes('localhost:4096')
  ) {
    return `⚠️ OpenCode server is not responding. Make sure the OpenCode process is running.\n\n\`Details: ${rawError}\``;
  }

  // Timeout
  if (
    lower.includes('timeout') ||
    lower.includes('abort') ||
    lower.includes('timed out')
  ) {
    return `⚠️ The AI took too long to respond.\n\nYou can:\n• Send your message again to retry\n• Use \`/model\` to switch to a faster model`;
  }

  // Context overflow
  if (
    lower.includes('contextoverflow') ||
    lower.includes('context_length') ||
    lower.includes('context window') ||
    lower.includes('token limit') ||
    lower.includes('maximum context length')
  ) {
    return `⚠️ Context window full — the conversation is too long. A new session will be created automatically on the next message.\n\n\`Details: ${rawError}\``;
  }

  // Auth / API key
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('api key') ||
    lower.includes('invalid key')
  ) {
    return `⚠️ Authentication error — the API key may be invalid or expired. Check your provider credentials.\n\n\`Details: ${rawError}\``;
  }

  // Server error (500, 502, 503)
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('internal server error') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded')
  ) {
    return `⚠️ The AI provider is experiencing issues (server error).\n\nYou can:\n• Wait a moment and send your message again\n• Use \`/model\` to switch to a different provider`;
  }

  // Agent process errors (spawn/exit) — don't say "container" since we may be in direct mode
  if (lower.includes('session was interrupted') || lower.includes('previous session closed')) {
    return `🔄 Previous session was interrupted — this is normal after /new or a session reset.`;
  }

  if (
    lower.includes('spawn error') ||
    lower.includes('exited with code')
  ) {
    return `⚠️ Agent process error — the execution failed.\n\n\`Details: ${rawError}\``;
  }

  // Session management
  if (
    lower.includes('session') &&
    (lower.includes('failed') || lower.includes('not found'))
  ) {
    return `⚠️ Session error — could not create or resume the conversation session.\n\n\`Details: ${rawError}\``;
  }

  // Generic fallback
  return `⚠️ An error occurred while processing your message.\n\n\`Details: ${rawError}\``;
}

/**
 * Run the agent (container or direct mode) for a workspace.
 */
async function runAgent(
  workspace: RegisteredWorkspace,
  prompt: string,
  chatJid: string,
  queue: WorkspaceQueue,
  executionId: string,
  preferences?: { model?: string; agent?: string },
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = workspace.folder === MAIN_WORKSPACE_FOLDER;
  const sessions = getSessions();
  const sessionId = sessions[workspace.folder];
  const registeredWorkspaces = getRegisteredWorkspaces();

  const serverOk = await ensureServerHealthy();
  if (!serverOk) {
    logger.error(
      { workspace: workspace.name },
      'OpenCode server unreachable, skipping agent run',
    );
    broadcastStatus(chatJid, 'error', 'OpenCode server unreachable');
    if (onOutput) {
      await onOutput({
        status: 'error',
        result: null,
        error:
          'OpenCode server is unreachable. Check that the OpenCode process is running.',
      });
    }
    return 'error';
  }

  // Update tasks snapshot
  const tasks = getAllTasks();
  writeTasksSnapshot(
    workspace.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      workspaceFolder: t.workspace_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available workspaces snapshot
  const availableWorkspaces = getAvailableWorkspaces();
  writeWorkspacesSnapshot(
    workspace.folder,
    isMain,
    availableWorkspaces,
    new Set(Object.keys(registeredWorkspaces)),
  );

  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          // Only update session if it wasn't changed externally (e.g. by /new).
          const currentInState = getSessions()[workspace.folder];
          if (
            !currentInState ||
            currentInState === sessionId ||
            currentInState === output.newSessionId
          ) {
            setWorkspaceSession(workspace.folder, output.newSessionId);
          }
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const useDirectMode = shouldUseDirectMode();

    broadcastStatus(chatJid, 'connecting', 'Starting agent…');

    // Status callback for real-time agent progress (direct mode only)
    const onStatusUpdate = (detail: string) => {
      broadcastStatus(chatJid, 'waiting', detail);
    };

    const onProcessCb = (proc: ChildProcess, containerName: string) => {
      queue.registerProcess(chatJid, proc, containerName, workspace.folder);
      broadcastStatus(chatJid, 'waiting', 'Waiting for model response…');
    };

    const agentInput = {
      prompt,
      sessionId,
      workspaceFolder: workspace.folder,
      chatJid,
      isMain,
      forceNewSession: !sessionId || sessionId === '',
      model: preferences?.model,
      agent: preferences?.agent,
    };

    // Step callback: forward agent-runner log steps to monitoring
    const monitoring = getMonitoring();
    const onStepUpdate = (step: import('./direct-runner.js').AgentStepEvent) => {
      monitoring.addStep(executionId, step.phase, step.message, step.metadata);
    };

    const output = useDirectMode
      ? await runDirectAgent(workspace, agentInput, onProcessCb, wrappedOnOutput, onStatusUpdate, onStepUpdate)
      : await runContainerAgent(workspace, agentInput, onProcessCb, wrappedOnOutput);
    
    // Clear preferences after use
    queue.clearMessagePreferences(chatJid);

    if (output.newSessionId) {
      const currentInState = getSessions()[workspace.folder];
      if (
        !currentInState ||
        currentInState === sessionId ||
        currentInState === output.newSessionId
      ) {
        setWorkspaceSession(workspace.folder, output.newSessionId);
      }
    }

    if (output.status === 'error') {
      logger.error(
        { workspace: workspace.name, error: output.error },
        'Container agent error',
      );
      if (onOutput && output.error) {
        await onOutput({ status: 'error', result: null, error: output.error });
      }
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ workspace: workspace.name, err }, 'Agent error');
    broadcastStatus(chatJid, 'error', err instanceof Error ? err.message : String(err));
    if (onOutput) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await onOutput({ status: 'error', result: null, error: errMsg });
    }
    return 'error';
  }
}
