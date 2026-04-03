/**
 * Query runner for the EureClaw Agent Runner.
 * Handles the core prompt/response cycle: session management, context loading,
 * agent routing, model fallback, and response extraction.
 */

import fs from 'fs';
import path from 'path';
import { sanitizeContextFile } from './context-security.js';
import {
  parseModel,
  isModelError,
  isResponseFailure,
  buildModelChain,
  formatFallbackLog,
  type EureClawConfig,
} from './model-fallback.js';
import type { ContainerInput, ContainerOutput, QueryResult } from './types.js';
import { IPC_POLL_MS } from './types.js';
import { log, debugLog, writeOutput, shouldClose, parseModelOverride } from './io.js';
import { createOpencodeClient } from './session-utils.js';
import { applyPathHints, discoverAndRouteAgents } from './agent-routing.js';
import { EventLogger } from './event-logger.js';

// ─── Context Loading ─────────────────────────────────────────────────────────

interface LoadedContext {
  globalAgentsMd?: string;
  globalSecurityMd?: string;
  workspaceContext?: string;
  memoryContext?: string;
  conversationContext?: string;
  envContext: string;
}

function loadSystemContext(
  containerInput: ContainerInput,
  workspaceDir: string,
  globalDir: string | undefined,
  ipcBaseDir: string,
): LoadedContext {
  const isDirectMode = !!containerInput.directMode;
  const platform = process.platform;

  // Global AGENTS.md
  const globalMemoryDir = globalDir ? path.join(globalDir, 'memory') : '/workspace/global/memory';
  const globalAgentsMdPath = fs.existsSync(path.join(globalMemoryDir, 'AGENTS.md'))
    ? path.join(globalMemoryDir, 'AGENTS.md')
    : globalDir ? path.join(globalDir, 'AGENTS.md') : '/workspace/global/AGENTS.md';
  let globalAgentsMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalAgentsMdPath)) {
    globalAgentsMd = sanitizeContextFile(fs.readFileSync(globalAgentsMdPath, 'utf-8'), 'global/AGENTS.md');
    log(`Loaded global AGENTS.md (${globalAgentsMd.length} chars)`);
  }

  // Global SECURITY.md
  const globalSecurityPath = fs.existsSync(path.join(globalMemoryDir, 'SECURITY.md'))
    ? path.join(globalMemoryDir, 'SECURITY.md')
    : globalDir ? path.join(globalDir, 'SECURITY.md') : '/workspace/global/SECURITY.md';
  let globalSecurityMd: string | undefined;
  if (fs.existsSync(globalSecurityPath)) {
    globalSecurityMd = fs.readFileSync(globalSecurityPath, 'utf-8');
    log(`Loaded global SECURITY.md (${globalSecurityMd.length} chars)`);
  }

  // Workspace-specific context files
  const memoryDir = path.join(workspaceDir, 'memory');
  const contextFiles = ['AGENTS.md', 'GUIDELINES.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md', 'SECURITY.md'];
  const workspaceContexts: string[] = [];

  for (const filename of contextFiles) {
    const memoryPath = path.join(memoryDir, filename);
    const legacyPath = path.join(workspaceDir, filename);
    const filePath = fs.existsSync(memoryPath) ? memoryPath : legacyPath;

    if (fs.existsSync(filePath)) {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const content = sanitizeContextFile(rawContent, filename);
      workspaceContexts.push(`\n## ${filename}\n\n${content}`);
      log(`Loaded ${filename} from ${filePath.includes('/memory/') ? 'memory/' : 'root'} (${content.length} chars)`);
    } else {
      log(`${filename} not found - skipping`);
    }
  }
  const workspaceContext = workspaceContexts.length > 0 ? workspaceContexts.join('\n\n') : undefined;

  // MEMORY.md (main workspace only)
  let memoryContext: string | undefined;
  if (containerInput.isMain) {
    const memoryDirMemoryPath = path.join(memoryDir, 'MEMORY.md');
    const legacyMemoryPath = path.join(workspaceDir, 'MEMORY.md');
    const memoryPath = fs.existsSync(memoryDirMemoryPath) ? memoryDirMemoryPath : legacyMemoryPath;
    if (fs.existsSync(memoryPath)) {
      memoryContext = sanitizeContextFile(fs.readFileSync(memoryPath, 'utf-8'), 'MEMORY.md');
      log(`Loaded MEMORY.md (${memoryContext.length} chars)`);
    }
  }

  // Environment context
  const dbPath = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, 'store', 'messages.db')
    : '/workspace/project/store/messages.db';
  const shell = platform === 'win32' ? 'PowerShell/cmd' : 'bash';
  const workspacesBasePath = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, 'workspaces')
    : '/workspace/project/workspaces';
  const globalMemoryPath = globalDir
    ? path.join(globalDir, 'AGENTS.md')
    : '/workspace/global/AGENTS.md';

  // Current date/time context (like Claude Code does)
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const envContext = [
    `\n## Runtime Environment`,
    `- Current date: ${dateStr}`,
    `- Current time: ${timeStr}`,
    `- Platform: ${platform} (${isDirectMode ? 'direct mode' : 'container mode'})`,
    `- Shell: ${shell}`,
    `- Current workspace folder: ${containerInput.workspaceFolder}`,
    `- Current workspace path: workspaces/${containerInput.workspaceFolder}/`,
    `- Is main workspace: ${containerInput.isMain ? 'yes' : 'no'}`,
    `- Working directory: ${workspaceDir}`,
    `- SQLite database: ${dbPath}`,
    `- Workspaces base directory: ${workspacesBasePath}`,
    `- Global memory: ${globalMemoryPath}`,
    `- IPC directory: ${ipcBaseDir}`,
    ``,
    `Use these paths for file operations and database queries.`,
    `IMPORTANT: When delegating to subagents (Task tool), ALWAYS include the current workspace folder in the prompt.`,
    `Example: Task(agent="task-planner", prompt="[WORKSPACE: ${containerInput.workspaceFolder}] Create a plan to ...")`,
    `This ensures subagents write files to the correct workspace (workspaces/${containerInput.workspaceFolder}/).`,
    ``,
    `For workspace management, prefer MCP tools (mcp__eureclaw__register_workspace, etc.).`,
    `IMPORTANT: mcp__eureclaw__list_tasks shows SCHEDULED tasks (alarms/cron), not markdown task files under workspace/tasks.`,
    `If the user mentions /tasks/... path or a .md task file, treat it as filesystem task file lookup in workspace/tasks.`,
  ].join('\n');

  return { globalAgentsMd, globalSecurityMd, workspaceContext, memoryContext, envContext };
}

async function loadConversationHistory(
  containerInput: ContainerInput,
  dbPath: string,
): Promise<string | undefined> {
  if (containerInput.forceNewSession) {
    log('Skipping conversation history (forceNewSession=true)');
    return undefined;
  }

  try {
    const Database = (await import('better-sqlite3')).default;
    const dbInstance = new Database(dbPath, { readonly: true });

    const recentMessages = dbInstance.prepare(`
      SELECT sender_name, content, timestamp
      FROM messages
      WHERE chat_jid = ?
        AND is_bot_message = 0
        AND content NOT LIKE 'Andy:%'
      ORDER BY timestamp DESC
      LIMIT 1
    `).all(containerInput.chatJid) as Array<{
      sender_name: string; content: string; timestamp: string;
    }>;

    dbInstance.close();

    if (recentMessages.length > 0) {
      recentMessages.reverse();
      const formattedMessages = recentMessages.map(msg => {
        const date = new Date(msg.timestamp);
        const timeStr = date.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
        });
        return `[${timeStr}] ${msg.sender_name}: ${msg.content}`;
      }).join('\n');

      log(`Loaded ${recentMessages.length} recent messages from SQLite`);
      return `## Recent Conversation History\n\n${formattedMessages}`;
    }
  } catch (err) {
    log(`Failed to load conversation history: ${err instanceof Error ? err.message : String(err)}`);
  }
  return undefined;
}

// ─── Tool Call Guard ─────────────────────────────────────────────────────────

const TOOL_CALL_GUARD = `## CRITICAL - Response Format Rules

NEVER write tool/function calls as text in your response. Do NOT output patterns like:
- [tool_call: ...]
- [function_call: ...]
- tool_call: tool_name(...)
- \`\`\`tool_call ... \`\`\`

If you need to use a tool, use the structured tool/function calling mechanism.
Your text responses must contain ONLY the final answer for the user.`;

// ─── Main Query Function ─────────────────────────────────────────────────────

export async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  _mcpServerPath: string,
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
  workspaceDir: string,
  ipcBaseDir: string,
  globalDir: string | undefined,
  eureClawConfig: EureClawConfig | null,
  resumeAt?: string,
  existingClient?: any,
  contextAlreadyInjected?: boolean,
  eventLogger?: EventLogger,
): Promise<QueryResult> {
  const effectivePrompt = applyPathHints(prompt, workspaceDir);
  const isDirectMode = !!containerInput.directMode;

  // Reuse existing OpenCode client or create a new one
  let client: any = existingClient || await createOpencodeClient(sdkEnv);
  if (existingClient) log('Reusing existing OpenCode client');

  // ─── Session Management ──────────────────────────────────────────────────
  let currentSessionId: string;

  try {
    if (!sessionId || !sessionId.startsWith('ses_')) {
      if (sessionId && !sessionId.startsWith('ses_')) {
        log(`⚠ Discarding legacy session ID: ${sessionId}`);
      }
      log('Creating new OpenCode session...');
      const sessionResult = await client.session.create();
      currentSessionId = sessionResult.data?.id ?? sessionResult.id;
      log(`✓ Created new session: ${currentSessionId}`);
      if (eventLogger) eventLogger.setSessionId(currentSessionId);
    } else {
      currentSessionId = sessionId;
      log(`Verifying session exists: ${currentSessionId}`);
      try {
        const listResp = await client.session.list();
        const sessions = listResp.data ?? listResp;
        const exists = Array.isArray(sessions) && sessions.some((s: any) => (s.id || s.data?.id) === currentSessionId);
        if (!exists) {
          log(`⚠ Session ${currentSessionId} not found — creating fresh session`);
          const sessionResult = await client.session.create();
          currentSessionId = sessionResult.data?.id ?? sessionResult.id;
          log(`✓ Created replacement session: ${currentSessionId}`);
        } else {
          log(`✓ Session verified, resuming: ${currentSessionId}`);
        }
        if (eventLogger) eventLogger.setSessionId(currentSessionId);
      } catch (verifyErr: any) {
        log(`⚠ Could not verify session (${verifyErr?.message}), proceeding anyway`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`ERROR: Failed to create/resume session: ${errorMessage}`);
    writeOutput({ status: 'error', result: null, error: `Session management failed: ${errorMessage}`, newSessionId: sessionId });
    return { newSessionId: sessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected: contextAlreadyInjected || false, hadError: true };
  }

  let newSessionId: string = currentSessionId;
  let lastAssistantUuid: string | undefined;
  let resultCount = 0;
  let closedDuringQuery = false;

  // ─── Load Context ────────────────────────────────────────────────────────
  const ctx = loadSystemContext(containerInput, workspaceDir, globalDir, ipcBaseDir);

  const dbPath = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, 'store', 'messages.db')
    : '/workspace/project/store/messages.db';
  const conversationContext = await loadConversationHistory(containerInput, dbPath);

  // ─── Agent Routing ───────────────────────────────────────────────────────
  const projectDir = isDirectMode ? containerInput.directMode!.projectDir! : '/workspace/project';
  const routing = discoverAndRouteAgents({
    isDirectMode, projectDir, containerInput, prompt: effectivePrompt, eureClawConfig,
  });
  const { agentName, allKnownAgents } = routing;

  // Build agents context for system prompt
  const agentsList = allKnownAgents
    .map(a => `- **@${a.name}**: ${a.description} [mode=${a.mode}, model=${a.resolvedModel}, temp=${a.resolvedTemperature}]`)
    .join('\n');
  const agentsAndSkillsContext = allKnownAgents.length > 0
    ? `\n## Available Subagents\n\nYou can delegate tasks to these specialized agents:\n\n${agentsList}\n\nUse the Task tool to invoke agents when appropriate.\n`
    : '';
  log(`✅ Discovered ${allKnownAgents.length} agents`);

  // ─── Build System Prompt ─────────────────────────────────────────────────
  const systemAppend = [
    ctx.globalAgentsMd, ctx.globalSecurityMd, ctx.workspaceContext,
    ctx.memoryContext, conversationContext, ctx.envContext,
    agentsAndSkillsContext, TOOL_CALL_GUARD,
  ].filter(Boolean).join('\n\n');

  // ─── Context Injection ───────────────────────────────────────────────────
  const CONTEXT_TIMEOUT_MS = 30_000;
  const injectContext = async (sid: string, text: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
    try {
      return await client.session.prompt({
        path: { id: sid },
        body: { noReply: true, parts: [{ type: 'text', text }] },
        signal: controller.signal as any,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let contextInjected = contextAlreadyInjected || false;
  if (!contextInjected) {
    try {
      log(`Injecting system context (${systemAppend.length} chars)...`);
      await injectContext(currentSessionId, systemAppend);
      log(`Session ${currentSessionId} context injected successfully`);
      contextInjected = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`ERROR: Failed to inject system context: ${errorMessage}`);
      writeOutput({ status: 'error', result: null, error: `Context injection failed: ${errorMessage}`, newSessionId: currentSessionId });
      return { newSessionId: currentSessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected: false, hadError: true };
    }
  } else {
    log(`Skipping context injection (already injected)`);
  }

  // ─── Send Prompt ─────────────────────────────────────────────────────────
  log(`Sending message to session ${currentSessionId} with agent: ${agentName}...`);

  let closedDuringPrompt = false;
  const pollInterval = setInterval(() => {
    if (shouldClose()) {
      log('✓ Close sentinel detected during prompt');
      closedDuringPrompt = true;
      clearInterval(pollInterval);
    }
  }, IPC_POLL_MS);

  const PROMPT_TIMEOUT_MS = Number(process.env.PROMPT_TIMEOUT_MS || 5 * 60 * 1000);
  const modelOverride = parseModelOverride(containerInput.model);
  let currentModelOverride = modelOverride;

  const modelsConfig = eureClawConfig?.models;
  const modelChain = modelsConfig
    ? buildModelChain(modelsConfig, containerInput.model)
    : containerInput.model ? [containerInput.model] : [];

  const promptWithTimeout = async (sid: string, text: string, agent?: string, modelOvr?: { providerID: string; modelID: string }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);
    try {
      return await client.session.prompt({
        path: { id: sid },
        body: { agent, model: modelOvr || currentModelOverride, parts: [{ type: 'text', text }] },
        signal: controller.signal as any,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const attemptPrompt = async (modelOvr?: { providerID: string; modelID: string }) => {
    try {
      return await promptWithTimeout(currentSessionId, effectivePrompt, agentName, modelOvr);
    } catch (promptErr: any) {
      const msg = promptErr?.message || String(promptErr);
      const isSessionError = msg.includes('fetch failed') || msg.includes('abort') || msg.includes('timeout') || msg.includes('404') || msg.includes('not found') || msg.includes('ContextOverflow') || msg.includes('context_length') || msg.includes('context window') || msg.includes('maximum context length');
      if (isSessionError && sessionId) {
        log(`⚠ Prompt failed (${msg}), recreating client and retrying...`);
        client = await createOpencodeClient(sdkEnv);
        const freshSession = await client.session.create();
        currentSessionId = freshSession.data?.id ?? freshSession.id;
        newSessionId = currentSessionId;
        await injectContext(currentSessionId, systemAppend);
        return await promptWithTimeout(currentSessionId, effectivePrompt, agentName, modelOvr);
      }
      throw promptErr;
    }
  };

  try {
    // ─── Model Fallback Loop ─────────────────────────────────────────────
    let response: any;
    let usedFallback = false;
    let lastError: any = null;

    if (modelChain.length <= 1) {
      response = await attemptPrompt();
    } else {
      log(`🔄 Model fallback chain: ${modelChain.join(' → ')}`);
      for (let i = 0; i < modelChain.length; i++) {
        const modelStr = modelChain[i];
        const modelOvr = parseModel(modelStr);
        if (!modelOvr) continue;

        try {
          log(`🎯 Trying model ${i + 1}/${modelChain.length}: ${modelStr}`);
          response = await attemptPrompt(modelOvr);

          const respData = response?.data ?? response;
          const failure = isResponseFailure(respData);
          if (failure.failed) {
            log(formatFallbackLog(i + 1, modelChain.length, modelStr, failure.reason));
            response = null;
            if (i < modelChain.length - 1) {
              try {
                client = await createOpencodeClient(sdkEnv);
                const freshSession = await client.session.create();
                currentSessionId = freshSession.data?.id ?? freshSession.id;
                newSessionId = currentSessionId;
                await injectContext(currentSessionId, systemAppend);
                contextInjected = true;
              } catch (refreshErr) {
                log(`❌ Failed to refresh session: ${refreshErr}`);
              }
            }
            continue;
          }

          if (i > 0) { usedFallback = true; log(`✅ Fallback model succeeded: ${modelStr}`); }
          break;
        } catch (err: any) {
          lastError = err;
          log(formatFallbackLog(i + 1, modelChain.length, modelStr, err?.message || String(err)));
          response = null;
          if (!isModelError(err)) { log(`❌ Non-model error, stopping fallback chain`); break; }
          if (i < modelChain.length - 1) {
            try {
              client = await createOpencodeClient(sdkEnv);
              const freshSession = await client.session.create();
              currentSessionId = freshSession.data?.id ?? freshSession.id;
              newSessionId = currentSessionId;
              await injectContext(currentSessionId, systemAppend);
              contextInjected = true;
            } catch (refreshErr) {
              log(`❌ Failed to refresh session for next fallback: ${refreshErr}`);
              break;
            }
          }
        }
      }

      if (!response) {
        throw new Error(`All models failed [${modelChain.join(', ')}]: ${lastError?.message || 'empty responses'}`);
      }
    }

    clearInterval(pollInterval);
    log(`✓ Response received from session ${currentSessionId}`);

    // ─── Extract Response ──────────────────────────────────────────────────
    let responseData = response.data ?? response;
    let parts = responseData.parts || [];

    // Detect ContextOverflowError
    const infoError = responseData.info?.error;
    const errorName = infoError?.name || infoError?.type || '';
    const errorMessage2 = infoError?.message || '';
    if (errorName.includes('ContextOverflow') || errorName.includes('context_length') ||
        errorMessage2.includes('context window') || errorMessage2.includes('token limit') ||
        errorMessage2.includes('maximum context length')) {
      log(`⚠ ContextOverflowError detected, creating fresh session...`);
      try {
        client = await createOpencodeClient(sdkEnv);
        const freshSession = await client.session.create();
        currentSessionId = freshSession.data?.id ?? freshSession.id;
        newSessionId = currentSessionId;
        await injectContext(currentSessionId, systemAppend);
        const retryResponse = await promptWithTimeout(currentSessionId, effectivePrompt, agentName);
        responseData = retryResponse.data ?? retryResponse;
        parts = responseData.parts || [];
      } catch (overflowRetryErr: any) {
        log(`ERROR: Retry after ContextOverflow failed: ${overflowRetryErr?.message}`);
        writeOutput({ status: 'error', result: null, error: `Context overflow retry failed: ${overflowRetryErr?.message}`, newSessionId: currentSessionId });
        throw overflowRetryErr;
      }
    }

    const textParts = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join('');

    // Build metadata
    const info = responseData.info || {};
    const outputMetadata: ContainerOutput['metadata'] = {
      modelID: info.modelID || undefined,
      providerID: info.providerID || undefined,
      mode: info.mode || undefined,
      agent: info.agent || info.mode || undefined,
      tokens: info.tokens ? {
        total: info.tokens.total || 0, input: info.tokens.input || 0,
        output: info.tokens.output || 0, reasoning: info.tokens.reasoning || 0,
        cacheRead: info.tokens.cache?.read || 0, cacheWrite: info.tokens.cache?.write || 0,
      } : undefined,
      cost: info.cost ?? undefined,
    };
    if (outputMetadata.modelID) {
      log(`📊 Model: ${outputMetadata.providerID}/${outputMetadata.modelID}, agent: ${outputMetadata.agent}, tokens: ${JSON.stringify(outputMetadata.tokens)}${usedFallback ? ' (fallback)' : ''}`);
    }

    if (textParts) {
      resultCount++;
      const fallbackNotice = usedFallback ? `⚡ _Answered by fallback model: ${outputMetadata.providerID}/${outputMetadata.modelID}_\n\n` : '';
      log(`✓ Assistant response #${resultCount}: ${textParts.slice(0, 200)}${textParts.length > 200 ? '...' : ''}`);
      writeOutput({ status: 'success', result: fallbackNotice + textParts, newSessionId: currentSessionId, metadata: outputMetadata });
    } else {
      // Fallback: fetch messages directly
      log(`⚠ No text parts, trying session.messages fallback...`);
      let fallbackText = '';
      try {
        const msgsResp = await client.session.messages({ path: { id: currentSessionId } });
        const msgs = (msgsResp as any).data || msgsResp;
        if (Array.isArray(msgs) && msgs.length > 0) {
          const lastAssistant = [...msgs].reverse().find((m: any) => m.info?.role === 'assistant');
          if (lastAssistant) {
            fallbackText = (lastAssistant.parts || []).filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join('');
          }
        }
      } catch (fetchErr) {
        log(`⚠ Fallback fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
      }

      if (fallbackText) {
        resultCount++;
        writeOutput({ status: 'success', result: fallbackText, newSessionId: currentSessionId, metadata: outputMetadata });
      } else {
        writeOutput({ status: 'success', result: '[No response]', newSessionId: currentSessionId, metadata: outputMetadata });
      }
    }

    if (responseData.info?.id) lastAssistantUuid = responseData.info.id;
    closedDuringQuery = closedDuringPrompt;

  } catch (error) {
    clearInterval(pollInterval);
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`ERROR: Failed to send message / get response: ${errorMessage}`);
    writeOutput({ status: 'error', result: null, error: `Failed to send message: ${errorMessage}`, newSessionId: currentSessionId });
    return { newSessionId: currentSessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected, hadError: true };
  }

  log(`Query completed successfully`);
  log(`Summary: results=${resultCount}, lastAssistantUuid=${lastAssistantUuid || 'none'}, closedDuringQuery=${closedDuringQuery}`);

  return { newSessionId, lastAssistantUuid, closedDuringQuery, client, contextInjected, hadError: false };
}
