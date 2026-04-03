/**
 * EureClaw Agent Runner — Entry Point
 * 
 * Runs inside a container (or direct mode on Windows/Linux).
 * Receives config via stdin, outputs results to stdout.
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages as JSON files in /workspace/ipc/input/
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import type { ContainerInput } from './types.js';
import { setIpcPaths, IPC_INPUT_DIR, IPC_INPUT_CLOSE_SENTINEL } from './types.js';
import { readStdin, writeOutput, log, debugLog, verifySecretsNotInProcessEnv, drainIpcInput, waitForIpcMessage, parseModelOverride } from './io.js';
import { createOpencodeClient, archiveSessionConversation } from './session-utils.js';
import { runQuery } from './query-runner.js';
import { EventLogger } from './event-logger.js';
import { loadEureClawConfig, parseModel, type EureClawConfig } from './model-fallback.js';

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }

    log(`=== EureClaw Agent Runner Started ===`);
    log(`Workspace: ${containerInput.workspaceFolder}, ChatJID: ${containerInput.chatJid}, IsMain: ${containerInput.isMain}`);
    debugLog(`Container input: sessionId=${containerInput.sessionId || 'none'}, isScheduledTask=${containerInput.isScheduledTask || false}, directMode=${!!containerInput.directMode}`);
  } catch (err) {
    writeOutput({
      status: 'error', result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  // Build SDK env: merge secrets into a local object (never into process.env)
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    sdkEnv[key] = value;
  }
  debugLog(`SDK environment configured with ${Object.keys(containerInput.secrets || {}).length} secrets`);
  verifySecretsNotInProcessEnv();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  let preClient: any = null;
  let sessionId = containerInput.sessionId;

  // Direct mode: override hardcoded container paths with real host paths
  let ipcBaseDir = '/workspace/ipc';
  let workspaceDir = '/workspace/group';
  let globalDir: string | undefined = '/workspace/global';

  if (containerInput.directMode) {
    ipcBaseDir = containerInput.directMode.ipcDir;
    workspaceDir = containerInput.directMode.workspaceDir;
    globalDir = containerInput.directMode.globalDir;
    setIpcPaths(path.join(ipcBaseDir, 'input'));

    log(`Direct mode enabled`);
    log(`Paths: ipc=${ipcBaseDir}, workspace=${workspaceDir}, global=${globalDir || 'none'}`);

    if (process.platform === 'win32' && process.env.PATH) {
      const nodePath = 'C:\\Program Files\\nodejs';
      if (!process.env.PATH.includes(nodePath)) {
        process.env.PATH = `${nodePath};${process.env.PATH}`;
        log(`Added ${nodePath} to PATH for SDK subprocesses`);
      }
    }

    if (process.env.HEADED) log(`HEADED=${process.env.HEADED} will be passed to subprocesses`);
    if (process.env.WORKSPACE_FOLDER) log(`WORKSPACE_FOLDER=${process.env.WORKSPACE_FOLDER} will be passed to subprocesses`);
  } else {
    log(`Container mode enabled (paths: /workspace/*)`);
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Load EureClaw config for model fallback
  const ecProjectDir = containerInput.directMode?.projectDir || '/workspace/project';
  const eureClawConfig = loadEureClawConfig(ecProjectDir);
  log(`✓ EureClaw config loaded: primary=${eureClawConfig.models.primary}, small=${eureClawConfig.models.small}`);

  // Clean up stale _close sentinel
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or workspace.]\n\n${prompt}`;
    log(`Processing scheduled task`);
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.map(m => m.text).join('\n');
  }
  log(`Initial prompt prepared: ${prompt.length} chars`);

  // Register EureClaw MCP server
  try {
    preClient = await createOpencodeClient(sdkEnv);
    log('Registering EureClaw MCP server with OpenCode...');

    try { await preClient.mcp.disconnect({ path: { name: 'eureclaw' } }); } catch { /* may not exist */ }

    const isDirectMode = !!containerInput.directMode;
    const projectDir = containerInput.directMode?.projectDir || process.cwd();
    const mcpServerAbsPath = isDirectMode
      ? path.join(projectDir, 'container', 'agent-runner', 'dist', 'ipc-mcp-stdio.js')
      : mcpServerPath;

    const mcpEnv: Record<string, string> = {
      EURECLAW_CHAT_JID: containerInput.chatJid,
      EURECLAW_WORKSPACE_FOLDER: containerInput.workspaceFolder,
      EURECLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
      EURECLAW_IPC_DIR: ipcBaseDir,
      EURECLAW_WORKSPACE_DIR: workspaceDir,
      PROJECT_DIR: containerInput.directMode?.projectDir || '/workspace/project',
    };

    await preClient.mcp.add({
      body: {
        name: 'eureclaw',
        config: {
          type: 'local' as const,
          command: ['node', mcpServerAbsPath],
          environment: mcpEnv,
          enabled: true,
          timeout: 10000,
        },
      },
    });

    log('✓ EureClaw MCP server registered successfully');

    try {
      const status = await preClient.mcp.status();
      const statusData = (status as any).data ?? status;
      if (Array.isArray(statusData)) {
        const eureclaw = statusData.find((s: any) => s.name === 'eureclaw');
        if (eureclaw) log(`MCP server 'eureclaw' status: ${JSON.stringify(eureclaw).slice(0, 200)}`);
      }
    } catch { /* non-critical */ }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`⚠ Failed to register EureClaw MCP server: ${errorMessage}`);
    log('Agent will continue without MCP tools');
  }

  // ─── Query Loop ──────────────────────────────────────────────────────────
  let resumeAt: string | undefined;
  let clientInstance: any = preClient;
  let queryCount = 0;
  let contextInjected = false;
  const ARCHIVE_INTERVAL = 10;

  // Start event logger
  let eventLogger: EventLogger | null = null;
  if (clientInstance) {
    const eventsDir = path.join(workspaceDir, 'logs', 'events');
    eventLogger = new EventLogger({
      client: clientInstance, workspace: containerInput.workspaceFolder,
      eventsDir, verbose: process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace',
    });
    try { await eventLogger.start(); } catch (err) {
      log(`⚠ Event logger failed to start: ${err instanceof Error ? err.message : String(err)}`);
      eventLogger = null;
    }
  }

  log(`Starting query loop...`);

  try {
    while (true) {
      queryCount++;
      log(`--- Query #${queryCount} ---`);
      log(`Session: ${sessionId || 'new'}, ResumeAt: ${resumeAt || 'latest'}`);

      let queryResult;
      try {
        queryResult = await runQuery(
          prompt, sessionId, mcpServerPath, containerInput, sdkEnv,
          workspaceDir, ipcBaseDir, globalDir, eureClawConfig,
          resumeAt, clientInstance, contextInjected, eventLogger || undefined,
        );
      } catch (queryErr) {
        const errMsg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        log(`ERROR: Query #${queryCount} failed: ${errMsg}`);
        writeOutput({ status: 'error', result: null, newSessionId: sessionId, error: errMsg });
        break;
      }

      // Store client for reuse
      if (!clientInstance) {
        clientInstance = queryResult.client;
        log(`✓ OpenCode client initialized and will be reused`);

        if (!eventLogger && clientInstance) {
          const eventsDir = path.join(workspaceDir, 'logs', 'events');
          eventLogger = new EventLogger({
            client: clientInstance, workspace: containerInput.workspaceFolder,
            eventsDir, verbose: process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace',
          });
          try { await eventLogger.start(); } catch (err) {
            log(`⚠ Event logger failed to start: ${err instanceof Error ? err.message : String(err)}`);
            eventLogger = null;
          }
        }
      }

      if (queryResult.contextInjected) contextInjected = true;
      if (queryResult.newSessionId) sessionId = queryResult.newSessionId;
      if (queryResult.lastAssistantUuid) resumeAt = queryResult.lastAssistantUuid;

      if (queryResult.hadError) {
        log(`Query #${queryCount} had an error, exiting loop gracefully`);
        break;
      }

      // Periodic archive
      if (sessionId && queryCount % ARCHIVE_INTERVAL === 0 && clientInstance) {
        log(`Periodic archive triggered (query count: ${queryCount})`);
        await archiveSessionConversation(clientInstance, sessionId, workspaceDir);
      }

      if (queryResult.closedDuringQuery) {
        log('✓ Close sentinel consumed during query, exiting');
        break;
      }

      writeOutput({ status: 'success', result: null, newSessionId: sessionId });
      log(`Query #${queryCount} completed, waiting for next IPC message...`);

      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('✓ Close sentinel received, exiting');
        break;
      }

      if (nextMessage.model) {
        const newModel = parseModelOverride(nextMessage.model);
        if (newModel) {
          log(`🔧 Model override updated: ${newModel.providerID}/${newModel.modelID}`);
          containerInput.model = nextMessage.model;
        }
      }

      log(`Received new message (${nextMessage.text.length} chars), starting query #${queryCount + 1}`);
      prompt = nextMessage.text;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`ERROR: Agent execution failed: ${errorMessage}`);
    writeOutput({ status: 'error', result: null, newSessionId: sessionId, error: errorMessage });
  } finally {
    if (eventLogger) {
      try { await eventLogger.stop(); } catch { /* ignore */ }
    }
    log(`=== EureClaw Agent Runner Finished ===`);
  }
}

main();
