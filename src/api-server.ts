/**
 * EureClaw API Server
 *
 * REST API with token-based authentication for web UI clients.
 * Provides:
 * - Token management (create, revoke, list)
 * - Chat listing and history
 * - Message sending
 * - Streaming responses for model thinking
 */
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { getAllChats, getMessagesSince, getAllMessagesSinceLinked, getMessagesPage, getLinkedChatJids, storeMessageDirect, storeChatMetadata, setRegisteredWorkspace, insertApiToken, getAllApiTokens, updateApiTokenLastUsed, deactivateApiToken, getApiTokenChatMappings, addApiTokenChat, deleteApiTokenChats, updateMessageReasoning } from './db.js';
import { getRegisteredWorkspaces, reloadRegisteredWorkspaces, getSessions, setLastAgentTimestampForJid, saveState } from './state.js';
import { ASSISTANT_NAME, WORKSPACES_DIR, TRIGGER_PATTERN } from './config.js';
import { NewMessage, RegisteredWorkspace } from './types.js';
import { registerWorkspace } from './workspace-manager.js';
import { executeCommand } from './commands/index.js';
import { handleCommandSideEffects } from './commands/command-effects.js';
import { getTranscriptionManager, isAudioTranscriptionAvailable } from './media/audio-manager.js';
import { analyzeImage, isVisionEnabled } from './vision.js';
import { getMonitoring } from './monitoring.js';
import { getOpenCodePort, getOpenCodeHost } from './opencode-server.js';
import { isSleeping } from './commands/sleep-manager.js';
import { registerAuthRoutes } from './api-auth-routes.js';
import { registerEnvVarRoutes } from './api-envvar-routes.js';
import { registerMarkdownRoutes } from './api-markdown-routes.js';
import { registerTaskRoutes } from './api-tasks-routes.js';
import { getProviders, getPopularProviders, clearCache as clearModelsCache } from './models-cache.js';
import { restartServer as restartOpenCodeServer } from './opencode-server.js';
import { extractFrontmatterBlock, getFrontmatterValue } from '../shared/frontmatter.js';

const API_PORT = parseInt(process.env.API_PORT || '4300', 10);

interface ApiToken {
  id: string;
  token: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
  active: boolean;
}

// WebSocket broadcast functions — re-exported from api-websocket.ts for backward compatibility
import { setupWebSocket, broadcastToToken, broadcastStatus, broadcastStep, broadcastExecutionUpdate, getWsConnectionCount } from './api-websocket.js';
export { broadcastToToken, broadcastStatus, broadcastStep, broadcastExecutionUpdate, getWsConnectionCount };

function generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateTokenId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const fastify = Fastify({
  logger: false,
});

await fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});

// Register multipart support for file uploads
import multipart from '@fastify/multipart';
await fastify.register(multipart, {
  limits: {
    fileSize: 26214400, // 25MB (Whisper limit)
  },
});

declare module 'fastify' {
  interface FastifyRequest {
    tokenId?: string;
    chatJid?: string;
  }
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  const allTokens = getAllApiTokens();
  const foundToken = allTokens.find(
    (t) => t.token_hash === tokenHash && t.active,
  );

  if (!foundToken) {
    reply.code(401).send({ error: 'Invalid or inactive token' });
    return;
  }

  updateApiTokenLastUsed(foundToken.id);
  request.tokenId = foundToken.id;

  const mappings = getApiTokenChatMappings(foundToken.id);
  if (mappings.length > 0) {
    request.chatJid = mappings[0];
  }
}

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

/**
 * SSE streaming route for web UI.
 * Connects to OpenCode's /event SSE endpoint and forwards text deltas to the browser.
 * The browser opens this when sending a message to get real-time token streaming.
 * Telegram/WhatsApp are NOT affected — they use the normal message flow.
 */
fastify.get(
  '/chat/stream',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const sessionId = query.sessionId || '';

    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const opencodePort = getOpenCodePort();
    const opencodeHost = getOpenCodeHost();
    const baseURL = `http://${opencodeHost}:${opencodePort}`;
    const abortController = new AbortController();

    request.raw.on('close', () => {
      abortController.abort();
    });

    try {
      const resp = await fetch(`${baseURL}/event`, {
        headers: { 'Accept': 'text/event-stream' },
        signal: abortController.signal,
      });

      if (!resp.ok || !resp.body) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to OpenCode event stream' })}\n\n`);
        reply.raw.end();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'message.part.delta') {
              const props = data.properties || {};
              if (props.field !== 'text') continue;
              if (sessionId && props.sessionID && props.sessionID !== sessionId) continue;
              const delta = props.delta || '';
              if (!delta) continue;

              // Send delta with partID — frontend separates thinking vs response
              reply.raw.write(`data: ${JSON.stringify({ type: 'delta', content: delta, partID: props.partID || '' })}\n\n`);
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        logger.warn({ err: err?.message }, 'Chat stream error');
        try {
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Stream error' })}\n\n`);
        } catch { /* connection already closed */ }
      }
    } finally {
      try { reply.raw.end(); } catch { /* already ended */ }
    }
  },
);

fastify.post(
  '/tokens',
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const name = (body?.name as string) || undefined;
    const id = generateTokenId();
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const tokenName = name || `Token ${id.slice(0, 6)}`;

    insertApiToken(id, tokenHash, tokenName);

    logger.info({ tokenId: id, name: tokenName }, 'Created new API token');

    reply.code(201).send({
      id,
      name: tokenName,
      token: rawToken,
      createdAt: new Date().toISOString(),
    });
  },
);

fastify.get('/tokens', { preHandler: authenticate }, async () => {
  const allTokens = getAllApiTokens().map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.created_at,
    lastUsed: t.last_used,
    active: t.active,
  }));
  return { tokens: allTokens };
});

fastify.delete(
  '/tokens/:id',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const id = params.id;
    const allTokens = getAllApiTokens();
    const foundToken = allTokens.find((t) => t.id === id);

    if (!foundToken) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    deactivateApiToken(id);
    deleteApiTokenChats(id);

    logger.info({ tokenId: id }, 'Revoked API token');

    return { success: true };
  },
);

fastify.post(
  '/tokens/:id/chats',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const id = params.id;
    const body = request.body as Record<string, unknown> | undefined;
    const chatJid = body?.chatJid as string;

    if (!chatJid) {
      reply.code(400).send({ error: 'chatJid is required' });
      return;
    }

    const allTokens = getAllApiTokens();
    const foundToken = allTokens.find((t) => t.id === id);
    if (!foundToken) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    addApiTokenChat(id, chatJid);

    logger.info({ tokenId: id, chatJid }, 'Added chat to token');

    return { success: true, chatJid };
  },
);

fastify.get(
  '/tokens/:id/chats',
  { preHandler: authenticate },
  async (request: FastifyRequest) => {
    const params = request.params as Record<string, string>;
    const id = params.id;
    const chatJids = getApiTokenChatMappings(id);
    const allChats = getAllChats();
    const workspaces = getRegisteredWorkspaces();

    const chatsWithWorkspaces = chatJids.map((chatJid) => {
      const chat = allChats.find((c) => c.jid === chatJid);
      return {
        jid: chatJid,
        name: chat?.name || chatJid,
        last_message_time: chat?.last_message_time || '',
        isRegistered: !!workspaces[chatJid],
        workspaceInfo: workspaces[chatJid] || null,
      };
    });

    return { chats: chatsWithWorkspaces };
  },
);

fastify.get('/chats', { preHandler: authenticate }, async () => {
  // Auto-discover and register web workspaces for existing workspace folders
  ensureWebWorkspacesRegistered();

  const workspaces = getRegisteredWorkspaces();
  const knownChats = getAllChats();

  // Return web: workspaces, but with last activity derived from all JIDs sharing the same folder
  const webChats = Object.entries(workspaces)
    .filter(([jid]) => jid.startsWith('web:'))
    .map(([jid, workspace]) => {
      const linkedJids = Object.entries(workspaces)
        .filter(([, g]) => g.folder === workspace.folder)
        .map(([linkedJid]) => linkedJid);

      const linkedActivity = knownChats
        .filter((c) => linkedJids.includes(c.jid))
        .map((c) => c.last_message_time)
        .filter(Boolean)
        .sort()
        .pop();

      return {
        jid,
        name: workspace.name,
        last_message_time: linkedActivity || new Date(0).toISOString(),
        isRegistered: true,
        workspaceInfo: workspace,
      };
    })
    .sort((a, b) => b.last_message_time.localeCompare(a.last_message_time));

  return { chats: webChats };
});

fastify.get(
  '/chats/:jid/messages',
  { preHandler: authenticate },
  async (request: FastifyRequest) => {
    const params = request.params as Record<string, string>;
    const jid = params.jid;
    const query = request.query as Record<string, string>;
    const since = query.since;
    const before = query.before;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;

    // If limit is specified, use cursor-based pagination
    if (limit && limit > 0) {
      const { messages, hasMore } = getMessagesPage(jid, limit, before || undefined);
      return { messages, hasMore };
    }

    // Legacy: return all messages since timestamp
    const messages = getAllMessagesSinceLinked(jid, since || '0');
    messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { messages };
  },
);

// Persist reasoning/thinking into message metadata (called by web-ui after streaming)
fastify.patch(
  '/messages/:id/reasoning',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reasoning?: string } | undefined;
    const reasoning = body?.reasoning;
    if (!reasoning || typeof reasoning !== 'string') {
      return reply.code(400).send({ error: 'reasoning is required' });
    }
    updateMessageReasoning(id, reasoning);
    return { ok: true };
  },
);

fastify.post(
  '/chats/:jid/messages',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const rawJid = params.jid;
    const body = request.body as Record<string, unknown> | undefined;
    const content = body?.content as string;
    const useWebChannel =
      (body?.channel as string) === 'web' || rawJid.startsWith('web:');
    const jid = useWebChannel ? rawJid : `web:${rawJid}`;
    
    // Extract model and agent (mode) from request
    const requestedModel = body?.model as string | undefined;
    const requestedAgent = body?.agent as string | undefined;

    logger.info({ jid, model: requestedModel, agent: requestedAgent }, 'API message received with model/agent');

    if (!content) {
      reply.code(400).send({ error: 'content is required' });
      return;
    }

    // Check for slash commands before storing/processing the message
    const registeredWorkspaces = getRegisteredWorkspaces();
    const workspace = registeredWorkspaces[jid];
    const commandResult = await executeCommand(content, {
      chatJid: jid,
      senderName: 'Web User',
      senderId: request.tokenId || 'web',
      group: workspace,
    });

    if (commandResult) {
      // Check if this is an agent-switching command (has data.agent or data.model with data.prompt)
      const isAgentCommand = commandResult.data?.agent || commandResult.data?.model;
      const hasPrompt = commandResult.data?.prompt;
      
      if (isAgentCommand && hasPrompt) {
        // Agent command with inline prompt: rewrite and process as normal message
        // e.g. "/plan aide moi avec mon budget" → agent=plan, message="aide moi avec mon budget"
        const agentOverride = (commandResult.data.agent as string) || requestedAgent;
        const modelOverride = (commandResult.data.model as string) || requestedModel;
        
        logger.info(
          { jid, agent: agentOverride, model: modelOverride, promptLength: hasPrompt.length },
          'Agent command with inline prompt — rewriting message',
        );
        
        // Store the original command message in history
        const cmdMsgId = `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const cmdTimestamp = new Date().toISOString();
        storeMessageDirect({
          id: cmdMsgId,
          chat_jid: jid,
          sender: request.tokenId || 'web',
          sender_name: 'Web User',
          content: hasPrompt, // Store the cleaned prompt, not the /command
          timestamp: cmdTimestamp,
          is_from_me: false,
          is_bot_message: false,
          metadata: { agent: agentOverride, modelID: modelOverride },
        });
        
        // Trigger processing with agent/model preferences
        if (processApiMessage) {
          processApiMessage(jid, modelOverride, agentOverride);
        }
        
        reply.code(201).send({
          success: true,
          messageId: cmdMsgId,
          timestamp: cmdTimestamp,
        });
        return;
      }
      
      if (isAgentCommand && !hasPrompt) {
        // Agent command without prompt: acknowledge and set preference for next message
        const agentOverride = commandResult.data.agent as string | undefined;
        const modelOverride = commandResult.data.model as string | undefined;
        
        // Store the command message
        const cmdMsgId = `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const cmdTimestamp = new Date().toISOString();
        storeMessageDirect({
          id: cmdMsgId,
          chat_jid: jid,
          sender: request.tokenId || 'web',
          sender_name: 'Web User',
          content,
          timestamp: cmdTimestamp,
          is_from_me: false,
          is_bot_message: false,
        });
        
        // Advance the per-JID agent cursor past this command message so the
        // message-loop doesn't pick it up and forward it to the agent.
        setLastAgentTimestampForJid(jid, cmdTimestamp);
        saveState();
        
        // Send the acknowledgment reply
        if (commandResult.reply) {
          const replyMsgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const replyTimestamp = new Date().toISOString();
          storeMessageDirect({
            id: replyMsgId,
            chat_jid: jid,
            sender: 'bot',
            sender_name: ASSISTANT_NAME,
            content: commandResult.reply,
            timestamp: replyTimestamp,
            is_from_me: true,
            is_bot_message: true,
          });
          broadcastToToken(jid, {
            id: replyMsgId,
            content: commandResult.reply,
            sender_name: ASSISTANT_NAME,
            timestamp: replyTimestamp,
            is_from_me: true,
            is_bot_message: true,
          });
        }
        
        reply.code(200).send({
          success: true,
          messageId: cmdMsgId,
          timestamp: cmdTimestamp,
          command: true,
          reply: commandResult.reply,
          agentSet: agentOverride,
          modelSet: modelOverride,
        });
        return;
      }
      
      // Regular command (not agent-switching): handle normally
      // Handle side effects (e.g. /new session creation) — shared across all channels
      await handleCommandSideEffects(commandResult, jid, workspace, queueRef ?? undefined);

      // Store the command message itself so it appears in chat history
      const cmdMsgId = `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const cmdTimestamp = new Date().toISOString();
      storeMessageDirect({
        id: cmdMsgId,
        chat_jid: jid,
        sender: request.tokenId || 'web',
        sender_name: 'Web User',
        content,
        timestamp: cmdTimestamp,
        is_from_me: false,
        is_bot_message: false,
      });

      // Advance the per-JID agent cursor past this command message so the
      // message-loop doesn't pick it up and forward it to the agent.
      setLastAgentTimestampForJid(jid, cmdTimestamp);
      saveState();

      // Send the command reply via SSE so the web UI sees it
      if (commandResult.reply) {
        const replyMsgId = `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const replyTimestamp = new Date().toISOString();
        storeMessageDirect({
          id: replyMsgId,
          chat_jid: jid,
          sender: 'bot',
          sender_name: ASSISTANT_NAME,
          content: commandResult.reply,
          timestamp: replyTimestamp,
          is_from_me: true,
          is_bot_message: true,
        });
        broadcastToToken(jid, {
          id: replyMsgId,
          content: commandResult.reply,
          sender_name: ASSISTANT_NAME,
          timestamp: replyTimestamp,
          is_from_me: true,
          is_bot_message: true,
        });
      }

      // Handle special actions
      if (commandResult.action === 'restart') {
        reply.code(200).send({
          success: true,
          messageId: cmdMsgId,
          timestamp: cmdTimestamp,
          command: true,
          reply: commandResult.reply,
        });
        setTimeout(() => {
          logger.info('Initiating restart via web UI command');
          process.exit(0);
        }, 2000);
        return;
      }

      reply.code(200).send({
        success: true,
        messageId: cmdMsgId,
        timestamp: cmdTimestamp,
        command: true,
        reply: commandResult.reply,
      });
      return;
    }

    const messageId = `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const message: NewMessage = {
      id: messageId,
      chat_jid: jid,
      sender: request.tokenId || 'web',
      sender_name: 'Web User',
      content,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
      metadata: {
        modelID: requestedModel,
        agent: requestedAgent,
      },
    };

    storeMessageDirect({
      id: message.id,
      chat_jid: message.chat_jid,
      sender: message.sender,
      sender_name: message.sender_name,
      content: message.content,
      timestamp: message.timestamp,
      is_from_me: message.is_from_me ?? false,
      is_bot_message: message.is_bot_message ?? false,
      metadata: message.metadata,
    });

    if (processApiMessage) {
      processApiMessage(jid, requestedModel, requestedAgent);
    }

    reply
      .code(201)
      .send({ success: true, messageId, timestamp: message.timestamp });
  },
);

/**
 * Image/media analysis endpoint — same pipeline as Telegram photos.
 * Runs vision (Gemini/OpenAI) on uploaded images and returns the description.
 * For audio files, runs transcription (same as Telegram voice messages).
 */
fastify.post(
  '/chats/:jid/analyze',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const rawJid = params.jid;
    const useWebChannel = rawJid.startsWith('web:');
    const jid = useWebChannel ? rawJid : `web:${rawJid}`;

    try {
      const data = await request.file();
      if (!data) {
        reply.code(400).send({ error: 'No file provided' });
        return;
      }

      const buffer = await data.toBuffer();
      const mimeType = data.mimetype || 'application/octet-stream';
      const fileName = data.filename || 'file';

      // Image → vision analysis (same as Telegram message:photo handler)
      if (mimeType.startsWith('image/')) {
        if (!isVisionEnabled()) {
          reply.code(200).send({ success: true, type: 'image', description: '[Photo - vision unavailable]' });
          return;
        }
        const description = await analyzeImage(buffer, mimeType);
        const result = description ? description.trim() : 'Image received but analysis failed';
        logger.info({ jid, fileName, descLength: result.length }, 'Web UI image analyzed via vision');
        reply.code(200).send({ success: true, type: 'image', description: result });
        return;
      }

      // Audio → transcription (same as Telegram voice handler)
      if (mimeType.startsWith('audio/')) {
        if (!isAudioTranscriptionAvailable()) {
          reply.code(200).send({ success: true, type: 'audio', description: '[Audio - transcription unavailable]' });
          return;
        }
        const manager = getTranscriptionManager();
        const transcription = await manager!.transcribe(buffer, fileName, undefined);
        const text = transcription?.text?.trim() || 'Audio received but transcription failed';
        logger.info({ jid, fileName, textLength: text.length }, 'Web UI audio transcribed');
        reply.code(200).send({ success: true, type: 'audio', description: text });
        return;
      }

      // Other file types — no analysis available
      reply.code(200).send({ success: true, type: 'file', description: `[File: ${fileName}]` });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errMsg, stack: err instanceof Error ? err.stack : undefined }, 'Media analysis failed');
      reply.code(500).send({ error: `Media analysis failed: ${errMsg}` });
    }
  },
);

/**
 * File transfer endpoint — saves files to workspaces/{folder}/uploads/
 * Returns relative paths. Does NOT analyze content.
 */
fastify.post(
  '/chats/:jid/upload',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const rawJid = params.jid;
    const useWebChannel = rawJid.startsWith('web:');
    const jid = useWebChannel ? rawJid : `web:${rawJid}`;

    const registeredWorkspaces = getRegisteredWorkspaces();
    const workspace = registeredWorkspaces[jid];
    if (!workspace?.folder) {
      reply.code(404).send({ error: 'Workspace not found for this chat' });
      return;
    }

    try {
      const parts = request.parts();
      const savedFiles: Array<{ name: string; path: string }> = [];

      for await (const part of parts) {
        if (part.type !== 'file') continue;
        const uploadsDir = path.join(WORKSPACES_DIR, workspace.folder, 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        const safeName = `${Date.now()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(uploadsDir, safeName);
        const fileBuffer = await part.toBuffer();
        fs.writeFileSync(filePath, fileBuffer);
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        savedFiles.push({ name: part.filename, path: relativePath });
        logger.info({ filePath: relativePath, originalName: part.filename, size: fileBuffer.length }, 'File transferred to workspace');
      }

      if (savedFiles.length === 0) {
        reply.code(400).send({ error: 'No files provided' });
        return;
      }

      reply.code(200).send({ success: true, files: savedFiles });
    } catch (err) {
      logger.error({ err }, 'File transfer failed');
      reply.code(500).send({ error: 'File transfer failed' });
    }
  },
);

// Audio transcription endpoint
fastify.post(
  '/chats/:jid/audio',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const rawJid = params.jid;
    const useWebChannel = rawJid.startsWith('web:');
    const jid = useWebChannel ? rawJid : `web:${rawJid}`;

    if (!isAudioTranscriptionAvailable()) {
      reply.code(503).send({ error: 'Audio transcription not available' });
      return;
    }

    try {
      const data = await request.file();
      if (!data) {
        reply.code(400).send({ error: 'No audio file provided' });
        return;
      }

      const buffer = await data.toBuffer();
      const fileName = data.filename || 'audio.webm';

      logger.info({ jid, fileName, size: buffer.length }, 'Transcribing audio from web UI');

      const manager = getTranscriptionManager();
      if (!manager) {
        reply.code(503).send({ error: 'Transcription manager not initialized' });
        return;
      }

      const result = await manager.transcribe(buffer, fileName, undefined);

      if (!result || !result.text) {
        reply.code(500).send({ error: 'Transcription failed' });
        return;
      }

      const transcribedText = result.text.trim();
      logger.info(
        { jid, textLength: transcribedText.length, provider: result.provider },
        'Audio transcribed successfully',
      );

      // Store the transcribed message
      const messageId = `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const timestamp = new Date().toISOString();

      const message: NewMessage = {
        id: messageId,
        chat_jid: jid,
        sender: request.tokenId || 'web',
        sender_name: 'Web User',
        content: transcribedText,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
      };

      storeMessageDirect({
        id: message.id,
        chat_jid: message.chat_jid,
        sender: message.sender,
        sender_name: message.sender_name,
        content: message.content,
        timestamp: message.timestamp,
        is_from_me: message.is_from_me ?? false,
        is_bot_message: message.is_bot_message ?? false,
      });

      // Trigger message processing
      if (processApiMessage) {
        processApiMessage(jid);
      }

      reply.code(201).send({
        success: true,
        messageId,
        timestamp,
        transcribedText,
      });
    } catch (err: any) {
      logger.error({ jid, err }, 'Audio transcription failed');
      reply.code(500).send({
        error: 'Transcription failed',
        details: err.message,
      });
    }
  },
);

import { WorkspaceQueue } from './workspace-queue.js';

let processApiMessage: ((jid: string, model?: string, agent?: string) => void) | null = null;
let queueRef: WorkspaceQueue | null = null;

export function setProcessApiMessageFn(fn: (jid: string, model?: string, agent?: string) => void): void {
  processApiMessage = fn;
}

export function setQueueRef(queue: WorkspaceQueue): void {
  queueRef = queue;
}

/**
 * Scan the workspaces/ directory and auto-register web: JIDs for existing workspace folders.
 * This ensures the web UI works standalone without any other channel.
 * Safe: uses ON CONFLICT(jid) in setRegisteredWorkspace, never deletes other channel JIDs.
 */
function ensureWebWorkspacesRegistered(): void {
  const registeredWorkspaces = getRegisteredWorkspaces();
  const SKIP_FOLDERS = new Set(['templates', 'global']);

  try {
    const entries = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_FOLDERS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const webJid = `web:${entry.name}`;

      // Skip if already registered as a web workspace
      if (registeredWorkspaces[webJid]) continue;

      // Find existing workspace config for this folder (from any channel)
      const existingWorkspace = Object.values(registeredWorkspaces).find(
        (g) => g.folder === entry.name,
      );

      const workspaceConfig: RegisteredWorkspace = {
        name: existingWorkspace?.name || entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
        folder: entry.name,
        trigger: existingWorkspace?.trigger || `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger: false, // Web UI messages don't need trigger prefix
      };

      try {
        setRegisteredWorkspace(webJid, workspaceConfig);
        storeChatMetadata(webJid, new Date().toISOString(), workspaceConfig.name);
        logger.info({ webJid, folder: entry.name }, 'Auto-registered web workspace');
      } catch (err) {
        // If folder UNIQUE constraint still exists, log and skip gracefully
        logger.warn({ webJid, folder: entry.name, err }, 'Could not register web workspace (folder may conflict)');
      }
    }

    // Reload the in-memory cache so the message loop and processor see the new workspaces
    reloadRegisteredWorkspaces();
  } catch (err) {
    logger.error({ err }, 'Failed to scan workspaces directory for web registration');
  }
}

fastify.get('/workspaces', { preHandler: authenticate }, async () => {
  ensureWebWorkspacesRegistered();
  const workspaces = getRegisteredWorkspaces();
  return { workspaces };
});

/**
 * Create a new workspace from the web UI.
 */
fastify.post(
  '/workspaces',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const name = body?.name as string;
    const folder = body?.folder as string;

    if (!name || !folder) {
      reply.code(400).send({ error: 'name and folder are required' });
      return;
    }

    // Validate folder name (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(folder)) {
      reply.code(400).send({ error: 'folder must be alphanumeric with hyphens/underscores only' });
      return;
    }

    const webJid = `web:${folder}`;
    const registeredWorkspaces = getRegisteredWorkspaces();

    // Check if already exists
    if (registeredWorkspaces[webJid]) {
      reply.code(409).send({ error: 'Workspace already exists' });
      return;
    }

    const workspaceConfig: RegisteredWorkspace = {
      name,
      folder,
      trigger: `@${ASSISTANT_NAME}`,
      added_at: new Date().toISOString(),
      requiresTrigger: false,
    };

    // Register and create folder structure
    registerWorkspace(webJid, workspaceConfig);
    storeChatMetadata(webJid, new Date().toISOString(), name);
    reloadRegisteredWorkspaces(); // Sync in-memory cache

    logger.info({ webJid, name, folder }, 'Created new web workspace');

    reply.code(201).send({
      success: true,
      jid: webJid,
      name,
      folder,
    });
  },
);

fastify.get('/sessions', { preHandler: authenticate }, async () => {
  const sessions = getSessions();
  return { sessions };
});

fastify.get('/config', { preHandler: authenticate }, async () => {
  return {
    assistantName: ASSISTANT_NAME,
    apiPort: API_PORT,
  };
});

/**
 * Get available primary agents from all sources:
 * 1. Hardcoded defaults: build + plan (always present)
 * 2. opencode.json agents with mode: "primary"
 * 3. .opencode/agents/*.md files with mode: primary in frontmatter
 * Smart merge: both sources are read independently; for duplicates, file description
 * wins if meaningful, otherwise config description is preserved. Source tracked as
 * 'config' | 'file' | 'merged' for debug visibility.
 */
fastify.get('/agents', { preHandler: authenticate }, async () => {
  try {
    const { loadOpenCodeConfig } = await import('./opencode-config.js');
    const config = loadOpenCodeConfig();

    type AgentEntry = { id: string; name: string; description: string; source: 'config' | 'file' | 'merged' };
    const agentMap = new Map<string, AgentEntry>();

    // 1. Hardcoded OpenCode defaults (always included)
    agentMap.set('build', { id: 'build', name: 'Build', description: 'Main development agent with full tool access', source: 'config' });
    agentMap.set('plan', { id: 'plan', name: 'Plan', description: 'Planning and task breakdown agent', source: 'config' });

    // 2. Primary agents from opencode.json
    if (config.agent) {
      for (const [agentId, agentConfig] of Object.entries(config.agent)) {
        if (typeof agentConfig === 'object' && agentConfig !== null) {
          const conf = agentConfig as { description?: string; mode?: string };
          if (conf.mode === 'primary') {
            agentMap.set(agentId.toLowerCase(), {
              id: agentId,
              name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
              description: conf.description || `${agentId} agent`,
              source: 'config',
            });
          }
        }
      }
    }

    // 3. Scan .opencode/agents/*.md — smart merge with config entries
    try {
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.join(process.cwd(), '.opencode', 'agents');
      if (fs.existsSync(agentsDir)) {
        const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith('.md'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
          const frontmatter = extractFrontmatterBlock(content);
          const mode = getFrontmatterValue(frontmatter, 'mode');
          if (mode !== 'primary') continue;
          const agentId = file.replace(/\.md$/, '');
          const key = agentId.toLowerCase();
          const fileDesc = getFrontmatterValue(frontmatter, 'description') || '';
          const existing = agentMap.get(key);
          if (!existing) {
            agentMap.set(key, {
              id: agentId,
              name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
              description: fileDesc || `${agentId} agent`,
              source: 'file',
            });
          } else {
            // File description wins if it's meaningful (not a generic placeholder)
            const mergedDesc = fileDesc && fileDesc !== `${agentId} agent` ? fileDesc : existing.description;
            agentMap.set(key, { ...existing, description: mergedDesc, source: 'merged' });
          }
        }
      }
    } catch (mdErr) {
      logger.warn({ err: mdErr }, 'Failed to scan .opencode/agents/ directory');
    }

    const agents = Array.from(agentMap.values()).map(({ id, name, description }) => ({ id, name, description }));
    logger.debug({ agentCount: agents.length, agents }, 'Loaded primary agents');
    return { agents };
  } catch (err) {
    logger.error({ err }, 'Failed to load agents');
    return {
      agents: [
        { id: 'build', name: 'Build', description: 'Main development agent with full tool access' },
        { id: 'plan', name: 'Plan', description: 'Planning and task breakdown agent' },
      ],
    };
  }
});

/**
 * Monitoring endpoint: recent executions, errors, and system stats.
 * Used by the web UI Settings/Logs page.
 */
fastify.get('/monitoring', { preHandler: authenticate }, async () => {
  try {
    const monitoring = getMonitoring();
    const recent = monitoring.getRecentExecutions(50);
    const active = monitoring.getActiveExecutions();
    const stats = monitoring.getStats();
    const workspaces = getRegisteredWorkspaces();
    const sessions = getSessions();

    const systemState = monitoring.getSystemState({
      openCodeServerStatus: 'running',
      openCodeServerPort: getOpenCodePort(),
      registeredGroups: Object.keys(workspaces).length,
      isSleeping: isSleeping(),
    });

    // Include system info directly — avoids a second round-trip from the frontend
    let systemInfo = undefined;
    try {
      const { getSystemInfo } = await import('./system-info.js');
      systemInfo = await getSystemInfo();
    } catch { /* system info endpoint might not be available */ }

    return {
      system: systemState,
      stats,
      active,
      recent,
      sessions,
      systemInfo,
    };
  } catch {
    return {
      system: { openCodeServerStatus: 'stopped', openCodeServerPort: 0, activeAgents: 0, registeredGroups: 0, isSleeping: false, uptime: 0 },
      stats: { totalExecutions: 0, successRate: 0, averageDuration: 0, byAgent: {}, byGroup: {} },
      active: [],
      recent: [],
      sessions: {},
    };
  }
});

/**
 * Execution detail endpoint: get a specific execution with its step trace.
 */
fastify.get('/monitoring/executions/:id', { preHandler: authenticate }, async (request) => {
  const { id } = request.params as { id: string };
  const monitoring = getMonitoring();
  const execution = monitoring.getExecution(id);
  if (!execution) {
    return { error: 'Execution not found' };
  }
  return execution;
});

/**
 * Models and providers endpoints
 */
fastify.get('/models/providers', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const providers = await getProviders();
    const popular = getPopularProviders();
    reply.code(200).send({ providers, popular });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch providers');
    reply.code(500).send({ error: 'Failed to fetch providers' });
  }
});

fastify.post('/models/cache/clear', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    clearModelsCache();
    reply.code(200).send({ success: true, message: 'Cache cleared' });
  } catch (err) {
    logger.error({ err }, 'Failed to clear cache');
    reply.code(500).send({ error: 'Failed to clear cache' });
  }
});

/**
 * Proxy to OpenCode server's /config/providers — returns the real configured
 * providers and models that the running OpenCode instance can actually use.
 * This is what the web UI needs for the model selector dropdown.
 */
fastify.get('/opencode/providers', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const host = getOpenCodeHost();
    const port = getOpenCodePort();
    const resp = await fetch(`http://${host}:${port}/config/providers`);
    if (!resp.ok) {
      reply.code(resp.status).send({ error: `OpenCode server returned ${resp.status}` });
      return;
    }
    const data = await resp.json();
    reply.code(200).send(data);
  } catch (err) {
    logger.error({ err }, 'Failed to proxy /config/providers from OpenCode server');
    reply.code(502).send({ error: 'OpenCode server unreachable' });
  }
});

/**
 * Get system information (platform, container mode, security level)
 */
fastify.get('/system/info', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { getSystemInfo } = await import('./system-info.js');
    const systemInfo = await getSystemInfo();
    reply.code(200).send(systemInfo);
  } catch (err) {
    logger.error({ err }, 'Failed to get system info');
    reply.code(500).send({ error: 'Failed to get system information' });
  }
});

/**
 * Restart OpenCode server (needed after API key changes)
 */
fastify.get('/system/restart-opencode', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
  logger.info('=== Restart OpenCode endpoint hit ===');
  try {
    logger.info('Restart OpenCode server requested via API');
    logger.info('About to call restartOpenCodeServer()');
    // Don't await - respond immediately and restart in background
    restartOpenCodeServer().catch((err) => {
      logger.error({ err }, 'Failed to restart OpenCode server');
    });
    logger.info('Sending success response');
    return reply.code(200).send({ success: true, message: 'EureClaw reload initiated' });
  } catch (err) {
    logger.error({ err }, 'Failed to initiate OpenCode server restart');
    return reply.code(500).send({ error: 'Failed to restart server' });
  }
});

// === File Download Routes ===

/**
 * List downloadable files for a workspace.
 * Files are stored in workspaces/{workspaceFolder}/workspace/downloads/ with format: {fileId}_{filename}
 */
fastify.get(
  '/files/:workspaceFolder',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const workspaceFolder = params.workspaceFolder;
    const query = request.query as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    const downloadsDir = path.join(WORKSPACES_DIR, workspaceFolder, 'workspace', 'downloads');

    if (!fs.existsSync(downloadsDir)) {
      return { files: [] };
    }

    try {
      const files = fs.readdirSync(downloadsDir)
        .filter(f => !f.endsWith('.tmp'))
        .map(f => {
          const filePath = path.join(downloadsDir, f);
          const stat = fs.statSync(filePath);
          // Parse fileId and original filename from stored filename
          const match = f.match(/^(\d+-[a-z0-9]+)_(.+)$/);
          const fileId = match ? match[1] : f;
          const originalName = match ? match[2] : f;

          return {
            fileId,
            filename: originalName,
            size: stat.size,
            created: stat.mtime.toISOString(),
            downloadUrl: `/files/${workspaceFolder}/${fileId}`,
          };
        })
        .sort((a, b) => b.created.localeCompare(a.created))
        .slice(0, limit);

      return { files };
    } catch (err) {
      logger.error({ err, workspaceFolder }, 'Failed to list downloadable files');
      reply.code(500).send({ error: 'Failed to list files' });
    }
  },
);

/**
 * Download a specific file by ID.
 * Supports both inline viewing and attachment download via ?download=true
 */
fastify.get(
  '/files/:workspaceFolder/:fileId',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const { workspaceFolder, fileId } = params;
    const query = request.query as Record<string, string>;
    const forceDownload = query.download === 'true';

    const downloadsDir = path.join(WORKSPACES_DIR, workspaceFolder, 'workspace', 'downloads');

    if (!fs.existsSync(downloadsDir)) {
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    // Find file matching the fileId prefix
    const files = fs.readdirSync(downloadsDir);
    const matchingFile = files.find(f => f.startsWith(`${fileId}_`));

    if (!matchingFile) {
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    const filePath = path.join(downloadsDir, matchingFile);
    const originalName = matchingFile.replace(/^\d+-[a-z0-9]+_/, '');
    const ext = path.extname(originalName).toLowerCase();

    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Set headers
    const disposition = forceDownload ? 'attachment' : 'inline';
    reply.header('Content-Type', mimeType);
    reply.header('Content-Disposition', `${disposition}; filename="${originalName}"`);

    // Stream the file
    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  },
);

/**
 * Download multiple files as a ZIP archive.
 * POST body: { fileIds: string[] }
 */
fastify.post(
  '/files/:workspaceFolder/zip',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const { workspaceFolder } = params;
    const body = request.body as { fileIds?: string[]; filename?: string } | undefined;
    const fileIds = body?.fileIds || [];
    const zipFilename = body?.filename || `${workspaceFolder}-files.zip`;

    if (fileIds.length === 0) {
      reply.code(400).send({ error: 'No file IDs provided' });
      return;
    }

    const downloadsDir = path.join(WORKSPACES_DIR, workspaceFolder, 'workspace', 'downloads');

    if (!fs.existsSync(downloadsDir)) {
      reply.code(404).send({ error: 'No files found' });
      return;
    }

    try {
      const archiver = (await import('archiver')).default;
      const archive = archiver('zip', { zlib: { level: 9 } });

      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${zipFilename}"`);

      archive.pipe(reply.raw);

      const allFiles = fs.readdirSync(downloadsDir);
      for (const fileId of fileIds) {
        const matchingFile = allFiles.find(f => f.startsWith(`${fileId}_`));
        if (matchingFile) {
          const filePath = path.join(downloadsDir, matchingFile);
          const originalName = matchingFile.replace(/^\d+-[a-z0-9]+_/, '');
          archive.file(filePath, { name: originalName });
        }
      }

      await archive.finalize();
    } catch (err) {
      logger.error({ err, workspaceFolder, fileIds }, 'Failed to create ZIP archive');
      reply.code(500).send({ error: 'Failed to create ZIP' });
    }
  },
);

// Register auth routes (API key management)
registerAuthRoutes(fastify, authenticate);

// Register environment variable routes
registerEnvVarRoutes(fastify, authenticate);

// Register markdown file browser routes
registerMarkdownRoutes(fastify, authenticate);

// Register task/cron routes
registerTaskRoutes(fastify, authenticate);

let sendMessageFn: ((jid: string, text: string) => Promise<void>) | null = null;

export function setSendMessageFunction(
  fn: (jid: string, text: string) => Promise<void>,
): void {
  sendMessageFn = fn;
}

export async function startApiServer(
  sendMessageFunction?: (jid: string, text: string) => Promise<void>,
): Promise<number> {
  if (sendMessageFunction) {
    sendMessageFn = sendMessageFunction;
  }

  try {
    // Register WebSocket upgrade handler before listening
    setupWebSocket(fastify);

    await fastify.listen({ port: API_PORT, host: '127.0.0.1' });
    logger.info({ port: API_PORT }, 'API server started');

    // Pre-warm system info cache in background so first Overview load is instant
    import('./system-info.js').then(({ getSystemInfo }) => getSystemInfo()).catch(() => {});

    return API_PORT;
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    throw err;
  }
}

export async function stopApiServer(): Promise<void> {
  await fastify.close();
  logger.info('API server stopped');
}

export function getApiPort(): number {
  return API_PORT;
}

export { fastify };
