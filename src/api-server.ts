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
import { getAllChats, getMessagesSince, getAllMessagesSinceLinked, getMessagesPage, getLinkedChatJids, storeMessageDirect, storeChatMetadata, setRegisteredGroup, insertApiToken, getAllApiTokens, updateApiTokenLastUsed, deactivateApiToken, getApiTokenChatMappings, addApiTokenChat, deleteApiTokenChats } from './db.js';
import { getRegisteredGroups, reloadRegisteredGroups, getSessions } from './state.js';
import { ASSISTANT_NAME, GROUPS_DIR, TRIGGER_PATTERN } from './config.js';
import { NewMessage, RegisteredGroup } from './types.js';
import { registerGroup } from './group-manager.js';
import { executeCommand } from './commands/index.js';

const API_PORT = parseInt(process.env.API_PORT || '4300', 10);

interface ApiToken {
  id: string;
  token: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
  active: boolean;
}

const sseConnections: Map<string, Set<(data: string) => void>> = new Map();

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

fastify.get(
  '/events',
  { preHandler: authenticate },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const tokenId = request.tokenId;
    if (!tokenId) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const sendEvent = (data: string) => {
      reply.raw.write(`data: ${data}\n\n`);
    };

    const connections = sseConnections.get(tokenId) || new Set();
    connections.add(sendEvent);
    sseConnections.set(tokenId, connections);

    request.raw.on('close', () => {
      connections.delete(sendEvent);
    });
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
    const groups = getRegisteredGroups();

    const chatsWithGroups = chatJids.map((chatJid) => {
      const chat = allChats.find((c) => c.jid === chatJid);
      return {
        jid: chatJid,
        name: chat?.name || chatJid,
        last_message_time: chat?.last_message_time || '',
        isRegistered: !!groups[chatJid],
        groupInfo: groups[chatJid] || null,
      };
    });

    return { chats: chatsWithGroups };
  },
);

fastify.get('/chats', { preHandler: authenticate }, async () => {
  // Auto-discover and register web groups for existing group folders
  ensureWebGroupsRegistered();

  const groups = getRegisteredGroups();
  const knownChats = getAllChats();

  // Return web: groups, but with last activity derived from all JIDs sharing the same folder
  const webChats = Object.entries(groups)
    .filter(([jid]) => jid.startsWith('web:'))
    .map(([jid, group]) => {
      const linkedJids = Object.entries(groups)
        .filter(([, g]) => g.folder === group.folder)
        .map(([linkedJid]) => linkedJid);

      const linkedActivity = knownChats
        .filter((c) => linkedJids.includes(c.jid))
        .map((c) => c.last_message_time)
        .filter(Boolean)
        .sort()
        .pop();

      return {
        jid,
        name: group.name,
        last_message_time: linkedActivity || new Date(0).toISOString(),
        isRegistered: true,
        groupInfo: group,
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

    if (!content) {
      reply.code(400).send({ error: 'content is required' });
      return;
    }

    // Check for slash commands before storing/processing the message
    const registeredGroups = getRegisteredGroups();
    const group = registeredGroups[jid];
    const commandResult = await executeCommand(content, {
      chatJid: jid,
      senderName: 'Web User',
      senderId: request.tokenId || 'web',
      group,
    });

    if (commandResult) {
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

    if (processApiMessage) {
      processApiMessage(jid);
    }

    reply
      .code(201)
      .send({ success: true, messageId, timestamp: message.timestamp });
  },
);

let processApiMessage: ((jid: string) => void) | null = null;

export function setProcessApiMessageFn(fn: (jid: string) => void): void {
  processApiMessage = fn;
}

/**
 * Scan the groups/ directory and auto-register web: JIDs for existing group folders.
 * This ensures the web UI works standalone without any other channel.
 * Safe: uses ON CONFLICT(jid) in setRegisteredGroup, never deletes other channel JIDs.
 */
function ensureWebGroupsRegistered(): void {
  const registeredGroups = getRegisteredGroups();
  const SKIP_FOLDERS = new Set(['templates', 'global']);

  try {
    const entries = fs.readdirSync(GROUPS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_FOLDERS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const webJid = `web:${entry.name}`;

      // Skip if already registered as a web group
      if (registeredGroups[webJid]) continue;

      // Find existing group config for this folder (from any channel)
      const existingGroup = Object.values(registeredGroups).find(
        (g) => g.folder === entry.name,
      );

      const groupConfig: RegisteredGroup = {
        name: existingGroup?.name || entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
        folder: entry.name,
        trigger: existingGroup?.trigger || `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger: false, // Web UI messages don't need trigger prefix
      };

      try {
        setRegisteredGroup(webJid, groupConfig);
        storeChatMetadata(webJid, new Date().toISOString(), groupConfig.name);
        logger.info({ webJid, folder: entry.name }, 'Auto-registered web group');
      } catch (err) {
        // If folder UNIQUE constraint still exists, log and skip gracefully
        logger.warn({ webJid, folder: entry.name, err }, 'Could not register web group (folder may conflict)');
      }
    }

    // Reload the in-memory cache so the message loop and processor see the new groups
    reloadRegisteredGroups();
  } catch (err) {
    logger.error({ err }, 'Failed to scan groups directory for web registration');
  }
}

fastify.get('/groups', { preHandler: authenticate }, async () => {
  ensureWebGroupsRegistered();
  const groups = getRegisteredGroups();
  return { groups };
});

/**
 * Create a new group from the web UI.
 */
fastify.post(
  '/groups',
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
    const registeredGroups = getRegisteredGroups();

    // Check if already exists
    if (registeredGroups[webJid]) {
      reply.code(409).send({ error: 'Group already exists' });
      return;
    }

    const groupConfig: RegisteredGroup = {
      name,
      folder,
      trigger: `@${ASSISTANT_NAME}`,
      added_at: new Date().toISOString(),
      requiresTrigger: false,
    };

    // Register and create folder structure
    registerGroup(webJid, groupConfig);
    storeChatMetadata(webJid, new Date().toISOString(), name);
    reloadRegisteredGroups(); // Sync in-memory cache

    logger.info({ webJid, name, folder }, 'Created new web group');

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

let sendMessageFn: ((jid: string, text: string) => Promise<void>) | null = null;

export function setSendMessageFunction(
  fn: (jid: string, text: string) => Promise<void>,
): void {
  sendMessageFn = fn;
}

export function broadcastToToken(
  chatJid: string,
  message: {
    id: string;
    content: string;
    sender_name: string;
    timestamp: string;
    is_from_me: boolean;
    is_bot_message: boolean;
    metadata?: Record<string, unknown>;
  },
): void {
  // Resolve linked JIDs so web UI clients watching web:main also see
  // bot responses sent to tg:1382389542 (same folder).
  const linkedJids = getLinkedChatJids(chatJid);
  // If chatJid itself isn't in the linked list (non-web), include it
  if (!linkedJids.includes(chatJid)) linkedJids.push(chatJid);

  for (const [tokenId, connections] of sseConnections.entries()) {
    const mappings = getApiTokenChatMappings(tokenId);

    const hasChat = mappings.length === 0 || linkedJids.some((jid) => mappings.includes(jid));

    if (hasChat) {
      // Broadcast once per linked JID so the web UI can match on its own JID
      for (const targetJid of linkedJids) {
        const messageStr = JSON.stringify({ type: 'message', chatJid: targetJid, ...message });
        for (const sendEvent of connections) {
          try {
            sendEvent(messageStr);
          } catch (e) {
            connections.delete(sendEvent);
          }
        }
      }
    }
  }
}

export async function startApiServer(
  sendMessageFunction?: (jid: string, text: string) => Promise<void>,
): Promise<number> {
  if (sendMessageFunction) {
    sendMessageFn = sendMessageFunction;
  }

  try {
    await fastify.listen({ port: API_PORT, host: '127.0.0.1' });
    logger.info({ port: API_PORT }, 'API server started');
    console.log(`\n🌐 API Server: http://127.0.0.1:${API_PORT}\n`);
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
