/**
 * Application startup: container system checks, channel init, and main() entry point.
 */
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

import { ASSISTANT_NAME, DATA_DIR, TELEGRAM_ONLY, MAIN_WORKSPACE_FOLDER } from './config.js';
import { readEnvFile } from './env.js';
import './channels/index.js'; // Triggers self-registration of all channels
import { getRegisteredChannelNames, getChannelFactory } from './channels/registry.js';
import { writeWorkspacesSnapshot } from './container-runner.js';
import {
  initDatabase,
  storeMessage,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import { WorkspaceQueue } from './workspace-queue.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatOutbound, sendDeduped } from './router.js';
import { startSchedulerLoop, triggerTaskNow } from './task-scheduler.js';
import { NewMessage, Channel } from './types.js';
import { logger } from './logger.js';
import { attemptAutoRegistration } from './auto-registration.js';
import { scanInput, checkRateLimit, isSecurityEnabled } from './security/index.js';
import {
  ensureServerHealthy,
  getOpenCodePort,
  getOpenCodeHost,
  startServer,
  startHealthChecks,
  stopServer,
} from './opencode-server.js';
import { scanAndGetApiKeys, logApiKeysReport } from './api-key-scanner.js';
import { executeCommand } from './commands/index.js';
import { handleCommandSideEffects } from './commands/command-effects.js';
import './commands/agent-commands.js';
import './commands/builtin-commands.js';
import './commands/opencode-commands.js';
import {
  loadSleepState,
  isSleeping,
  setOnWakeCallback,
} from './commands/sleep-manager.js';
import { initMonitoring, getMonitoring } from './monitoring.js';
import {
  loadState,
  getRegisteredWorkspaces,
  getSessions,
  reloadRegisteredWorkspaces,
  setLastAgentTimestampForJid,
  saveState,
} from './state.js';
import {
  registerWorkspace,
  getAvailableWorkspaces,
  isPrivateChat,
} from './workspace-manager.js';
import {
  startApiServer,
  stopApiServer,
  setSendMessageFunction,
  setProcessApiMessageFn,
  setQueueRef,
  broadcastToToken,
  broadcastStatus,
  broadcastStep,
  broadcastExecutionUpdate,
} from './api-server.js';
import { setTriggerTaskFunction } from './api-tasks-routes.js';
import { processWorkspaceMessages } from './message-processor.js';
import { startMessageLoop, recoverPendingMessages } from './message-loop.js';

export function ensureContainerSystemRunning(): void {
  const platform = os.platform();
  
  // macOS: Use Apple Container (built-in)
  if (platform === 'darwin') {
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
    
    // Kill orphaned Apple Container instances
    try {
      const output = execSync('container ls --format json', {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      const containers: { status: string; configuration: { id: string } }[] =
        JSON.parse(output || '[]');
      const orphans = containers
        .filter(
          (c) =>
            c.status === 'running' && c.configuration.id.startsWith('eureclaw-'),
        )
        .map((c) => c.configuration.id);
      for (const name of orphans) {
        try {
          execSync(`container stop ${name}`, { stdio: 'pipe' });
        } catch {
          /* already stopped */
        }
      }
      if (orphans.length > 0) {
        logger.info(
          { count: orphans.length, names: orphans },
          'Stopped orphaned containers',
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to clean up orphaned containers');
    }
    
    return;
  }
  
  // Windows/Linux: Check for Docker
  try {
    execSync('docker --version', { stdio: 'pipe', timeout: 5000 });
    logger.info({ platform }, 'Docker detected - will use container isolation');
    console.log('\n✅ Docker detected - using container isolation for security\n');
    
    // Verify Docker daemon is running
    try {
      execSync('docker ps', { stdio: 'pipe', timeout: 5000 });
      logger.debug('Docker daemon is running');
    } catch {
      logger.warn('Docker is installed but daemon is not running');
      console.log('⚠️  Docker daemon is not running. Starting it...\n');
      // On Windows, Docker Desktop needs to be started manually
      // On Linux, we can try to start the service
      if (platform === 'linux') {
        try {
          execSync('sudo systemctl start docker', { stdio: 'pipe', timeout: 10000 });
          logger.info('Docker daemon started');
        } catch (err) {
          logger.warn({ err }, 'Could not start Docker daemon automatically');
          console.log('⚠️  Please start Docker manually and restart EureClaw\n');
        }
      } else {
        console.log('⚠️  Please start Docker Desktop and restart EureClaw\n');
      }
    }
    
    // Kill orphaned Docker containers
    try {
      const output = execSync('docker ps --format "{{json .}}"', {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      const containers: { Names: string; State: string }[] = output
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      const orphans = containers
        .filter((c) => c.State === 'running' && c.Names.startsWith('eureclaw-'))
        .map((c) => c.Names);
      for (const name of orphans) {
        try {
          execSync(`docker stop ${name}`, { stdio: 'pipe' });
        } catch {
          /* already stopped */
        }
      }
      if (orphans.length > 0) {
        logger.info(
          { count: orphans.length, names: orphans },
          'Stopped orphaned Docker containers',
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to clean up orphaned Docker containers');
    }
  } catch {
    // Docker not available - use direct mode
    logger.info(
      { platform },
      'Docker not found - running in direct mode (no container isolation)',
    );
    console.log('\n⚠️  Running in DIRECT MODE (no container isolation)');
    console.log('   Docker not detected. For better security, install Docker:');
    console.log('   - Windows: https://docs.docker.com/desktop/install/windows-install/');
    console.log('   - Linux: https://docs.docker.com/engine/install/\n');
  }
}

export async function main(): Promise<void> {
  const instanceLockPath = path.join(
    process.cwd(),
    '.runtime',
    'eureclaw.instance.lock',
  );
  const releaseInstanceLock = () => {
    try {
      if (fs.existsSync(instanceLockPath)) {
        const content = fs.readFileSync(instanceLockPath, 'utf-8');
        const lock = JSON.parse(content) as { pid?: number };
        if (lock?.pid === process.pid) {
          fs.unlinkSync(instanceLockPath);
        }
      }
    } catch {
      // Non-blocking diagnostics only
    }
  };

  const isPidAlive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Vérifie que le PID correspond bien à un processus EureClaw (Node/Bun)
   * pour éviter les faux positifs liés à la réutilisation de PID par l'OS.
   */
  const isEureClawProcess = (pid: number): boolean => {
    try {
      let cmdLine = '';
      if (os.platform() === 'win32') {
        cmdLine = execSync(
          `wmic process where "ProcessId=${pid}" get CommandLine /value`,
          { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] },
        );
      } else {
        cmdLine = execSync(`ps -p ${pid} -o args=`, {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
      return /src[/\\]index|start-with-opencode|run-with-restart/i.test(
        cmdLine,
      );
    } catch {
      return true; // Impossible de vérifier → on suppose que c'est EureClaw (prudence)
    }
  };

  /**
   * Tente de terminer un processus EureClaw résiduel.
   * Retourne true si le processus est mort dans le délai imparti.
   */
  const terminateStalePid = async (pid: number): Promise<boolean> => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return true; // Déjà mort
    }
    // Attendre jusqu'à 6 secondes
    const deadline = Date.now() + 6000;
    while (isPidAlive(pid) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        /* ignore */
      }
    }
    return !isPidAlive(pid);
  };

  // Single-instance guard: prevent duplicate bot responders and Telegram 409 conflicts.
  fs.mkdirSync(path.dirname(instanceLockPath), { recursive: true });
  if (fs.existsSync(instanceLockPath)) {
    try {
      const raw = fs.readFileSync(instanceLockPath, 'utf-8');
      const lock = JSON.parse(raw) as { pid?: number; startedAt?: string };
      if (lock?.pid && lock.pid !== process.pid && isPidAlive(lock.pid)) {
        if (isEureClawProcess(lock.pid)) {
          // Processus EureClaw résiduel : on tente de le terminer proprement
          logger.warn(
            { existingPid: lock.pid, startedAt: lock.startedAt },
            'Detected stale EureClaw instance — attempting auto-termination...',
          );
          const killed = await terminateStalePid(lock.pid);
          if (killed) {
            logger.info(
              { pid: lock.pid },
              'Stale EureClaw instance terminated — proceeding with startup',
            );
          } else {
            logger.error(
              { existingPid: lock.pid, startedAt: lock.startedAt },
              'Another EureClaw instance is already running and could not be terminated',
            );
            throw new Error(
              `Another EureClaw instance is already running (PID ${lock.pid}) and could not be stopped. Kill it manually.`,
            );
          }
        } else {
          // PID vivant mais appartient à un autre processus → verrou obsolète
          logger.warn(
            { stalePid: lock.pid },
            'Lock file refers to a non-EureClaw PID (OS reuse) — cleaning up stale lock',
          );
        }
      }
      // Nettoyer le verrou obsolète
      try {
        fs.unlinkSync(instanceLockPath);
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('could not be stopped')
      ) {
        throw err;
      }
      try {
        fs.unlinkSync(instanceLockPath);
      } catch {
        /* ignore */
      }
    }
  }
  fs.writeFileSync(
    instanceLockPath,
    JSON.stringify(
      { pid: process.pid, startedAt: new Date().toISOString() },
      null,
      2,
    ),
    'utf-8',
  );

  const heartbeatPath = path.join(process.cwd(), 'HEARTBEAT.md');
  const writeHeartbeat = (
    state: 'starting' | 'running' | 'stopping' | 'exited',
    details?: string,
  ) => {
    try {
      const now = new Date().toISOString();
      const lines = [
        '# EureClaw Heartbeat',
        '',
        `- Timestamp: ${now}`,
        `- State: ${state}`,
        `- PID: ${process.pid}`,
        `- UptimeSec: ${Math.floor(process.uptime())}`,
      ];
      if (details) {
        lines.push(`- Details: ${details}`);
      }
      fs.writeFileSync(heartbeatPath, `${lines.join('\n')}\n`, 'utf-8');
    } catch {
      // Non-blocking diagnostics only
    }
  };

  writeHeartbeat('starting');

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

  // Pre-warm system info cache so the first /monitoring call is instant
  import('./system-info.js').then(({ getSystemInfo }) => getSystemInfo()).catch(() => {});

  // Wire monitoring step events to SSE broadcast for real-time execution trace
  getMonitoring().onStep((executionId, chatJid, step) => {
    broadcastStep(chatJid, executionId, step);
  });

  // Wire execution updates to WebSocket for real-time activity view
  getMonitoring().onExecutionUpdate((execution) => {
    broadcastExecutionUpdate(execution);
  });

  loadState();
  loadSleepState();
  logger.info({ isSleeping: isSleeping() }, 'Sleep state loaded');

  let channels: Channel[] = [];
  const queue = new WorkspaceQueue();

  // Wire queue status broadcasts to web UI
  queue.setStatusCallback((chatJid, status, detail) => {
    if (status === 'queued') {
      broadcastStatus(chatJid, 'queued', detail);
    }
  });
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
    writeHeartbeat('stopping', `signal=${signal}`);
    logger.info({ signal }, 'Shutdown signal received');
    await stopServer();
    await stopApiServer();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    releaseInstanceLock();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('exit', (code) => {
    releaseInstanceLock();
    writeHeartbeat('exited', `exitCode=${code}`);
  });

  // Channel callbacks
  const channelOpts = {
    onMessage: async (chatJid: string, msg: NewMessage) => {
      let registeredWorkspaces = getRegisteredWorkspaces();
      let workspace = registeredWorkspaces[chatJid];

      if (!workspace) {
        const chatName = msg.sender_name || chatJid;
        const isPrivate = msg.is_private_chat ?? isPrivateChat(chatJid);
        const result = attemptAutoRegistration(chatJid, chatName, isPrivate);

        if (result.registered) {
          reloadRegisteredWorkspaces();
          registeredWorkspaces = getRegisteredWorkspaces();
          workspace = registeredWorkspaces[chatJid];
          logger.info(
            { jid: chatJid, name: chatName, isPrivate, folder: 'main' },
            'Auto-registered chat as main workspace',
          );
        } else if (result.reason === 'already_exists') {
          logger.debug(
            { jid: chatJid, reason: result.reason },
            'Auto-registration skipped: main workspace already exists',
          );
        } else if (result.reason === 'not_eligible') {
          logger.error(
            { jid: chatJid, name: chatName, reason: result.reason },
            'Auto-registration failed',
          );
        }
      }

      // --- Security Layer: Rate Limiting ---
      if (isSecurityEnabled() && workspace) {
        const isMain = workspace.folder === MAIN_WORKSPACE_FOLDER;
        const customThreshold = workspace.containerConfig?.timeout ? undefined : undefined; // future: per-workspace threshold
        const rateResult = checkRateLimit(chatJid, isMain, customThreshold);
        if (!rateResult.allowed) {
          const waitSec = Math.ceil(rateResult.retryAfterMs / 1000);
          const ch = findChannel(channels, chatJid);
          if (ch) await ch.sendMessage(chatJid, `⚠️ Rate limit reached. Please wait ${waitSec}s before sending another message.`);
          return;
        }
      }

      // --- Security Layer: Input Scanning ---
      if (isSecurityEnabled()) {
        const scanResult = scanInput(msg.content, chatJid, workspace?.folder ?? 'unknown');
        if (scanResult.action === 'blocked') {
          const ch = findChannel(channels, chatJid);
          if (ch) await ch.sendMessage(chatJid, '⚠️ Your message was blocked by the security filter.');
          return;
        }
        if (scanResult.action === 'sanitized') {
          msg.content = scanResult.sanitizedContent;
        }
      }

      // Check for slash commands
      const commandResult = await executeCommand(msg.content, {
        chatJid,
        senderName: msg.sender_name,
        senderId: msg.sender,
        group: workspace,
      });

      if (commandResult) {
        // Check if this is an agent-switching command (has data.agent or data.model with data.prompt)
        const isAgentCommand = commandResult.data?.agent || commandResult.data?.model;
        const hasPrompt = commandResult.data?.prompt;
        
        if (isAgentCommand && hasPrompt) {
          // Agent command with inline prompt: rewrite the message and process normally
          // e.g. "/plan aide moi avec mon budget" → agent=plan, message="aide moi avec mon budget"
          const agentOverride = commandResult.data.agent as string | undefined;
          const modelOverride = commandResult.data.model as string | undefined;
          
          logger.info(
            { chatJid, agent: agentOverride, model: modelOverride, promptLength: hasPrompt.length },
            'Agent command with inline prompt — rewriting message',
          );
          
          // Rewrite the message content to just the prompt (without the /command)
          msg.content = hasPrompt;
          
          // Store the original message (with /command) in history
          storeMessage(msg);
          broadcastToToken(chatJid, {
            id: msg.id,
            content: msg.content,
            sender_name: msg.sender_name,
            timestamp: msg.timestamp,
            is_from_me: false,
            is_bot_message: false,
          });
          
          // Set agent/model preferences for this message
          queue.setMessagePreferences(chatJid, {
            agent: agentOverride,
            model: modelOverride,
          });
          
          // Continue to normal message processing (don't return)
          if (!queue.sendMessage(chatJid, '')) {
            queue.enqueueMessageCheck(chatJid);
          }
          return;
        }
        
        if (isAgentCommand && !hasPrompt) {
          // Agent command without prompt: just acknowledge and set preference for next message
          storeMessage(msg);
          broadcastToToken(chatJid, {
            id: msg.id,
            content: msg.content,
            sender_name: msg.sender_name,
            timestamp: msg.timestamp,
            is_from_me: false,
            is_bot_message: false,
          });
          
          setLastAgentTimestampForJid(chatJid, msg.timestamp);
          saveState();
          
          // Set preferences for the NEXT message
          const agentOverride = commandResult.data.agent as string | undefined;
          const modelOverride = commandResult.data.model as string | undefined;
          queue.setMessagePreferences(chatJid, {
            agent: agentOverride,
            model: modelOverride,
          });
          
          // Send acknowledgment reply if any
          if (commandResult.reply) {
            const channel = findChannel(channels, chatJid);
            if (channel) {
              await channel.sendMessage(chatJid, commandResult.reply);
            }

            const replyMsgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const replyTimestamp = new Date().toISOString();
            storeMessageDirect({
              id: replyMsgId,
              chat_jid: chatJid,
              sender: 'bot',
              sender_name: ASSISTANT_NAME,
              content: commandResult.reply,
              timestamp: replyTimestamp,
              is_from_me: true,
              is_bot_message: true,
            });
            broadcastToToken(chatJid, {
              id: replyMsgId,
              content: commandResult.reply,
              sender_name: ASSISTANT_NAME,
              timestamp: replyTimestamp,
              is_from_me: true,
              is_bot_message: true,
            });
          }
          return;
        }
        
        // Regular command (not agent-switching): handle normally
        // Store the user's command message in history
        storeMessage(msg);
        broadcastToToken(chatJid, {
          id: msg.id,
          content: msg.content,
          sender_name: msg.sender_name,
          timestamp: msg.timestamp,
          is_from_me: false,
          is_bot_message: false,
        });

        // Advance the per-JID agent cursor past this command message so the
        // message-loop doesn't pick it up and forward it to the agent.
        setLastAgentTimestampForJid(chatJid, msg.timestamp);
        saveState();

        // Handle side effects (e.g. /new session creation) — shared across all channels
        await handleCommandSideEffects(commandResult, chatJid, workspace, queue);

        if (commandResult.reply) {
          const channel = findChannel(channels, chatJid);
          if (channel) {
            await channel.sendMessage(chatJid, commandResult.reply);
          }

          // Store and broadcast the bot's reply
          const replyMsgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const replyTimestamp = new Date().toISOString();
          storeMessageDirect({
            id: replyMsgId,
            chat_jid: chatJid,
            sender: 'bot',
            sender_name: ASSISTANT_NAME,
            content: commandResult.reply,
            timestamp: replyTimestamp,
            is_from_me: true,
            is_bot_message: true,
          });
          broadcastToToken(chatJid, {
            id: replyMsgId,
            content: commandResult.reply,
            sender_name: ASSISTANT_NAME,
            timestamp: replyTimestamp,
            is_from_me: true,
            is_bot_message: true,
          });
        }
        if (commandResult.action === 'restart') {
          setTimeout(() => {
            logger.info('Initiating restart via command');
            process.exit(0);
          }, 2000);
        }

        if (commandResult.action === 'shutdown') {
          setTimeout(() => {
            logger.warn('Initiating shutdown via command — will NOT auto-restart');
            process.exit(1);
          }, 2000);
        }

        // /new already killed the agent-runner and cleared the session.
        // The next real user message will spawn a fresh agent-runner.
        return;
      }

      if (isSleeping()) {
        logger.debug(
          { chatJid, sender: msg.sender_name },
          'Message ignored (bot sleeping)',
        );
        return;
      }

      storeMessage(msg);

      // Broadcast incoming messages to web UI so they appear live
      broadcastToToken(chatJid, {
        id: msg.id,
        content: msg.content,
        sender_name: msg.sender_name,
        timestamp: msg.timestamp,
        is_from_me: false,
        is_bot_message: false,
      });
    },
    onChatMetadata: (chatJid: string, timestamp: string, name?: string) =>
      storeChatMetadata(chatJid, timestamp, name),
    registeredWorkspaces: () => getRegisteredWorkspaces(),
  };

  // Load secrets and set API keys in env
  const secrets = readEnvFile([
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
  ]);

  if (secrets.GEMINI_API_KEY)
    process.env.GEMINI_API_KEY = secrets.GEMINI_API_KEY;
  if (secrets.GOOGLE_API_KEY)
    process.env.GOOGLE_API_KEY = secrets.GOOGLE_API_KEY;
  if (secrets.OPENAI_API_KEY)
    process.env.OPENAI_API_KEY = secrets.OPENAI_API_KEY;
  if (secrets.GROQ_API_KEY) process.env.GROQ_API_KEY = secrets.GROQ_API_KEY;

  // Create and connect channels via registry (self-registration pattern).
  // Each channel decides internally whether it can start (credentials, flags).
  // Factories return null when credentials are missing → channel skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel registered but credentials missing — skipping',
      );
      continue;
    }
    try {
      await Promise.race([
        channel.connect(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 30_000),
        ),
      ]);
      channels.push(channel);
    } catch {
      logger.warn(
        { channel: channelName },
        'Channel connection timed out or failed — continuing without it',
      );
      // Still add it so disconnect() is called on shutdown
      channels.push(channel);
    }
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Start API server for web UI
  setSendMessageFunction(async (jid: string, text: string) => {
    // Don't send to Telegram if message came from Web UI (web: prefix)
    if (!jid.startsWith('web:')) {
      const channel = findChannel(channels, jid);
      if (channel) {
        await sendDeduped(channel, jid, text);
      }
    }
  });

  // Trigger message processing when API receives a message
  // web: JIDs (e.g. web:main) are registered natively in registered_workspaces,
  // so the pipeline handles them like any other channel JID.
  setProcessApiMessageFn((jid: string, model?: string, agent?: string) => {
    // Store model/agent preferences for this JID temporarily
    if (model || agent) {
      queue.setMessagePreferences(jid, { model, agent });
    }
    if (!queue.sendMessage(jid, '')) {
      queue.enqueueMessageCheck(jid);
    }
  });

  // Give the API server access to the queue for /new reset
  setQueueRef(queue);

  const apiPort = await startApiServer();
  console.log(`\n🌐 API Server: http://127.0.0.1:${apiPort}\n`);

  // Start subsystems
  startSchedulerLoop({
    registeredWorkspaces: () => getRegisteredWorkspaces(),
    getSessions: () => getSessions(),
    queue,
    onProcess: (workspaceJid, proc, containerName, workspaceFolder) =>
      queue.registerProcess(workspaceJid, proc, containerName, workspaceFolder),
    sendMessage: async (jid, rawText) => {
      const text = formatOutbound(rawText, jid);
      if (!text) return;

      const isWebUI = jid.startsWith('web:');

      // Scheduled tasks should deliver to ALL connected channels for the workspace,
      // not just the channel that created the task. A cron job created from the web UI
      // should still notify the user on Telegram/WhatsApp.
      if (isWebUI) {
        // Send to web UI via SSE
        const webuiChannel = channels.find((c) => c.name === 'webui');
        if (webuiChannel) {
          await webuiChannel.sendMessage(jid, text);
        }

        // Also mirror to messaging channels (Telegram, WhatsApp) for the same workspace
        const workspaceFolder = jid.replace(/^web:/, '');
        const workspaces = getRegisteredWorkspaces();
        for (const [wsJid, ws] of Object.entries(workspaces)) {
          if (ws.folder === workspaceFolder && !wsJid.startsWith('web:')) {
            const ch = findChannel(channels, wsJid);
            if (ch && ch.isConnected()) {
              try {
                await ch.sendMessage(wsJid, text);
              } catch (err) {
                logger.warn({ jid: wsJid, err }, 'Failed to mirror scheduled task to messaging channel');
              }
            }
          }
        }
      } else {
        // Regular channel routing for non-WebUI messages
        const channel = findChannel(channels, jid);
        if (channel) {
          await channel.sendMessage(jid, text);
        }
      }

      const msgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const timestamp = new Date().toISOString();
      storeMessageDirect({
        id: msgId,
        chat_jid: jid,
        sender: 'bot',
        sender_name: ASSISTANT_NAME,
        content: text,
        timestamp,
        is_from_me: true,
        is_bot_message: true,
      });
      // Broadcast for non-web channels (web channel already broadcasts via sendMessage above)
      if (!isWebUI) {
        broadcastToToken(jid, {
          id: msgId,
          content: text,
          sender_name: ASSISTANT_NAME,
          timestamp,
          is_from_me: true,
          is_bot_message: true,
        });
      }
    },
  });

  // Wire up the trigger function so the web UI can trigger tasks immediately
  setTriggerTaskFunction(triggerTaskNow);

  startIpcWatcher({
    sendMessage: async (jid, rawText) => {
      const text = formatOutbound(rawText, jid);
      if (!text) return;
      const channel = findChannel(channels, jid);
      let wasSent = false;
      if (channel) {
        wasSent = await sendDeduped(channel, jid, text);
      }
      // If sendDeduped returned false the same message was already sent
      // (e.g. via the streaming callback in message-processor).  Skip
      // storing and broadcasting to avoid duplicate DB entries and SSE events.
      if (!wasSent) return;
      const msgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const timestamp = new Date().toISOString();
      storeMessageDirect({
        id: msgId,
        chat_jid: jid,
        sender: 'bot',
        sender_name: ASSISTANT_NAME,
        content: text,
        timestamp,
        is_from_me: true,
        is_bot_message: true,
      });
      // For web: JIDs, WebUIChannel.sendMessage() already called
      // broadcastToToken inside sendDeduped — broadcasting again would
      // produce a duplicate SSE event.  For non-web JIDs we still need
      // the explicit broadcast for cross-channel sync to the web UI.
      if (!jid.startsWith('web:')) {
        broadcastToToken(jid, {
          id: msgId,
          content: text,
          sender_name: ASSISTANT_NAME,
          timestamp,
          is_from_me: true,
          is_bot_message: true,
        });
      }
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
        logger.warn(
          { jid, channel: channel.name },
          'Channel does not support sendMedia, sent path as text',
        );
      }
    },
    registeredWorkspaces: () => getRegisteredWorkspaces(),
    registerWorkspace: registerWorkspace,
    syncWorkspaceMetadata: (force) => {
      const ch = channels.find((c) => typeof c.syncWorkspaces === 'function');
      return ch?.syncWorkspaces?.(force) ?? Promise.resolve();
    },
    getAvailableWorkspaces: getAvailableWorkspaces,
    writeWorkspacesSnapshot: (gf, im, ag, rj) =>
      writeWorkspacesSnapshot(gf, im, ag, rj),
  });

  queue.setProcessMessagesFn((chatJid) =>
    processWorkspaceMessages(chatJid, queue, channels),
  );
  recoverPendingMessages(queue);
  startMessageLoop(queue, channels, ASSISTANT_NAME);

  writeHeartbeat('running');
  const heartbeatInterval = setInterval(
    () => writeHeartbeat('running'),
    30_000,
  );
  heartbeatInterval.unref();
}
