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
import { logger } from './logger.js';
import { getAllChats, getMessagesSince, storeMessageDirect } from './db.js';
import { getRegisteredGroups, getSessions } from './state.js';
import { ASSISTANT_NAME } from './config.js';
import { NewMessage } from './types.js';

const API_PORT = parseInt(process.env.API_PORT || '4300', 10);

interface ApiToken {
  id: string;
  token: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
  active: boolean;
}

interface ChatMapping {
  tokenId: string;
  chatJid: string;
}

const tokens: Map<string, ApiToken> = new Map();
const tokenToChatMappings: Map<string, ChatMapping[]> = new Map();
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

  const foundToken = Array.from(tokens.values()).find(
    (t) => t.token === tokenHash && t.active,
  );

  if (!foundToken) {
    reply.code(401).send({ error: 'Invalid or inactive token' });
    return;
  }

  foundToken.lastUsed = new Date().toISOString();
  request.tokenId = foundToken.id;

  const mappings = tokenToChatMappings.get(foundToken.id);
  if (mappings && mappings.length > 0) {
    request.chatJid = mappings[0].chatJid;
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

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
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

    const apiToken: ApiToken = {
      id,
      token: tokenHash,
      name: name || `Token ${id.slice(0, 6)}`,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      active: true,
    };

    tokens.set(id, apiToken);
    tokenToChatMappings.set(id, []);

    logger.info({ tokenId: id, name: apiToken.name }, 'Created new API token');

    reply.code(201).send({
      id: apiToken.id,
      name: apiToken.name,
      token: rawToken,
      createdAt: apiToken.createdAt,
    });
  },
);

fastify.get('/tokens', { preHandler: authenticate }, async () => {
  const allTokens = Array.from(tokens.values()).map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    lastUsed: t.lastUsed,
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
    const token = tokens.get(id);

    if (!token) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    token.active = false;
    tokenToChatMappings.delete(id);

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

    const token = tokens.get(id);
    if (!token) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    const mappings = tokenToChatMappings.get(id) || [];

    if (!mappings.find((m) => m.chatJid === chatJid)) {
      mappings.push({ tokenId: id, chatJid });
      tokenToChatMappings.set(id, mappings);
    }

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
    const mappings = tokenToChatMappings.get(id) || [];
    const allChats = getAllChats();
    const groups = getRegisteredGroups();

    const chatsWithGroups = mappings.map((m) => {
      const chat = allChats.find((c) => c.jid === m.chatJid);
      return {
        jid: m.chatJid,
        name: chat?.name || m.chatJid,
        last_message_time: chat?.last_message_time || '',
        isRegistered: !!groups[m.chatJid],
        groupInfo: groups[m.chatJid] || null,
      };
    });

    return { chats: chatsWithGroups };
  },
);

fastify.get('/chats', { preHandler: authenticate }, async () => {
  const chats = getAllChats();
  const groups = getRegisteredGroups();

  const chatsWithGroups = chats.map((chat) => ({
    jid: chat.jid,
    name: chat.name,
    last_message_time: chat.last_message_time,
    isRegistered: !!groups[chat.jid],
    groupInfo: groups[chat.jid] || null,
  }));

  return { chats: chatsWithGroups };
});

fastify.get(
  '/chats/:jid/messages',
  { preHandler: authenticate },
  async (request: FastifyRequest) => {
    const params = request.params as Record<string, string>;
    const jid = params.jid;
    const query = request.query as Record<string, string>;
    const since = query.since || '0';

    // Also check for web: prefixed JID (messages from WebUI)
    const webJid = `web:${jid}`;
    const messages = getMessagesSince(jid, since, ASSISTANT_NAME).concat(
      getMessagesSince(webJid, since, ASSISTANT_NAME),
    );

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

fastify.get('/groups', { preHandler: authenticate }, async () => {
  const groups = getRegisteredGroups();
  return { groups };
});

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
  },
): void {
  const messageStr = JSON.stringify({ type: 'message', chatJid, ...message });

  for (const [tokenId, connections] of sseConnections.entries()) {
    const mappings = tokenToChatMappings.get(tokenId) || [];
    const hasChat = mappings.some((m) => m.chatJid === chatJid);

    if (hasChat || mappings.length === 0) {
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
