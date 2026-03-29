/**
 * EureClaw WebSocket Module
 *
 * Manages WebSocket connections for real-time control panel events.
 * Replaces SSE /events transport with bidirectional WebSocket on /ws.
 * The SSE /chat/stream endpoint remains unchanged.
 */
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'http';
import { logger } from './logger.js';
import { getAllApiTokens, getApiTokenChatMappings, getLinkedChatJids } from './db.js';
import type { AgentExecution } from './monitoring.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsClient {
  ws: WebSocket;
  tokenId: string;
  authenticated: boolean;
  lastPong: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Active WebSocket connections indexed by tokenId */
export const wsConnections: Map<string, Set<WsClient>> = new Map();

const MAX_CONNECTIONS_PER_TOKEN = 50;
const AUTH_TIMEOUT_MS = 10_000; // 10s to authenticate before being kicked
const HEARTBEAT_INTERVAL_MS = 30_000; // Ping every 30s
const PONG_TIMEOUT_MS = 10_000; // Close if no pong within 10s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Authenticate a raw bearer token against the database.
 * Returns the tokenId if valid, or null if invalid/inactive.
 */
function authenticateToken(token: string): string | null {
  const tokenHash = hashToken(token);
  const allTokens = getAllApiTokens();
  const found = allTokens.find((t) => t.token_hash === tokenHash && t.active);
  return found ? found.id : null;
}

/**
 * Remove a client from the wsConnections map and clean up.
 */
function removeClient(client: WsClient): void {
  const set = wsConnections.get(client.tokenId);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      wsConnections.delete(client.tokenId);
    }
  }
}

/**
 * Send a JSON payload to a single client. If the send fails,
 * close the connection and remove the client.
 */
function safeSend(client: WsClient, payload: string): boolean {
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      return true;
    }
  } catch (e) {
    logger.warn({ tokenId: client.tokenId, err: e }, 'WS send failed, removing client');
    try { client.ws.close(); } catch { /* ignore */ }
    removeClient(client);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

function handleConnection(ws: WebSocket, _req: IncomingMessage): void {
  const client: WsClient = {
    ws,
    tokenId: '',
    authenticated: false,
    lastPong: Date.now(),
  };

  // Auth timeout — close if client doesn't authenticate within 10s
  const authTimer = setTimeout(() => {
    if (!client.authenticated) {
      logger.warn('WS client did not authenticate in time, closing');
      ws.close(4401, 'Unauthorized');
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (raw: Buffer | string) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');

    // --- Unauthenticated: expect auth message ---
    if (!client.authenticated) {
      handleAuthMessage(client, data, authTimer);
      return;
    }

    // --- Authenticated: handle application messages ---
    handleAppMessage(client, data);
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (client.authenticated) {
      removeClient(client);
      logger.debug({ tokenId: client.tokenId }, 'WS client disconnected');
    }
  });

  ws.on('error', (err) => {
    logger.warn({ err, tokenId: client.tokenId }, 'WS client error');
    clearTimeout(authTimer);
    try { ws.close(); } catch { /* ignore */ }
    if (client.authenticated) {
      removeClient(client);
    }
  });

  // Native pong handler (response to server-level ping)
  ws.on('pong', () => {
    client.lastPong = Date.now();
  });
}

// ---------------------------------------------------------------------------
// Auth message handler
// ---------------------------------------------------------------------------

function handleAuthMessage(client: WsClient, data: string, authTimer: ReturnType<typeof setTimeout>): void {
  let parsed: any;
  try {
    parsed = JSON.parse(data);
  } catch {
    // Malformed JSON before auth — just close
    client.ws.close(4401, 'Unauthorized');
    clearTimeout(authTimer);
    return;
  }

  if (parsed?.type !== 'auth' || typeof parsed?.token !== 'string') {
    client.ws.close(4401, 'Unauthorized');
    clearTimeout(authTimer);
    return;
  }

  const tokenId = authenticateToken(parsed.token);
  if (!tokenId) {
    client.ws.close(4401, 'Unauthorized');
    clearTimeout(authTimer);
    return;
  }

  // Check connection limit per token
  const existing = wsConnections.get(tokenId);
  if (existing && existing.size >= MAX_CONNECTIONS_PER_TOKEN) {
    client.ws.close(4429, 'Too many connections');
    clearTimeout(authTimer);
    return;
  }

  // Auth successful
  clearTimeout(authTimer);
  client.tokenId = tokenId;
  client.authenticated = true;
  client.lastPong = Date.now();

  // Add to connections map
  if (!wsConnections.has(tokenId)) {
    wsConnections.set(tokenId, new Set());
  }
  wsConnections.get(tokenId)!.add(client);

  safeSend(client, JSON.stringify({ type: 'auth_ok' }));
  logger.info({ tokenId, connections: wsConnections.get(tokenId)!.size }, 'WS client authenticated');
}

// ---------------------------------------------------------------------------
// Application message handler (post-auth)
// ---------------------------------------------------------------------------

function handleAppMessage(client: WsClient, data: string): void {
  let parsed: any;
  try {
    parsed = JSON.parse(data);
  } catch {
    logger.warn({ tokenId: client.tokenId }, 'WS received malformed JSON, ignoring');
    return;
  }

  if (!parsed || typeof parsed.type !== 'string') {
    logger.warn({ tokenId: client.tokenId }, 'WS received message without type, ignoring');
    return;
  }

  switch (parsed.type) {
    case 'ping':
      safeSend(client, JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;
    default:
      // Unknown type — ignore silently per spec (req 6.2)
      logger.debug({ tokenId: client.tokenId, type: parsed.type }, 'WS unknown message type, ignoring');
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API — Setup
// ---------------------------------------------------------------------------

let wss: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Heartbeat — ping all clients every 30s, close dead ones (no pong >10s)
// ---------------------------------------------------------------------------

function startHeartbeat(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    const now = Date.now();

    for (const [_tokenId, clients] of wsConnections.entries()) {
      for (const client of clients) {
        // Check if client missed the pong deadline
        if (now - client.lastPong > PONG_TIMEOUT_MS) {
          logger.warn({ tokenId: client.tokenId }, 'WS client pong timeout, closing');
          try { client.ws.close(); } catch { /* ignore */ }
          removeClient(client);
          continue;
        }

        // Send native WebSocket ping
        try {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        } catch (e) {
          logger.warn({ tokenId: client.tokenId, err: e }, 'WS ping failed, removing client');
          try { client.ws.close(); } catch { /* ignore */ }
          removeClient(client);
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Setup
// ---------------------------------------------------------------------------

/**
 * Register the WebSocket upgrade handler on the Fastify server.
 * Must be called BEFORE fastify.listen().
 */
export function setupWebSocket(fastify: FastifyInstance): void {
  try {
    wss = new WebSocketServer({ noServer: true });

    wss.on('connection', handleConnection);

    // Handle HTTP upgrade requests for /ws path
    fastify.server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

      if (url.pathname !== '/ws') {
        // Not our path — let other handlers deal with it or destroy
        socket.destroy();
        return;
      }

      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
      });
    });

    // Start heartbeat to detect dead connections
    startHeartbeat();

    // Clean up heartbeat on server close
    fastify.server.on('close', () => {
      stopHeartbeat();
    });

    logger.info('WebSocket server registered on /ws');
  } catch (err) {
    logger.error({ err }, 'Failed to setup WebSocket server, continuing without WS');
  }
}

// ---------------------------------------------------------------------------
// Public API — Broadcast functions
// ---------------------------------------------------------------------------

/**
 * Broadcast a message event to authorized WebSocket clients.
 * Replicates the SSE broadcastToToken logic with linked JID resolution.
 */
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
  const linkedJids = getLinkedChatJids(chatJid);
  if (!linkedJids.includes(chatJid)) linkedJids.push(chatJid);

  for (const [tokenId, clients] of wsConnections.entries()) {
    const mappings = getApiTokenChatMappings(tokenId);
    const hasChat = mappings.length === 0 || linkedJids.some((jid) => mappings.includes(jid));

    if (hasChat) {
      const sentClients = new Set<WsClient>();
      for (const targetJid of linkedJids) {
        const payload = JSON.stringify({ type: 'message', chatJid: targetJid, ...message });
        for (const client of clients) {
          if (sentClients.has(client)) continue;
          if (safeSend(client, payload)) {
            sentClients.add(client);
          }
        }
      }
    }
  }
}

/**
 * Broadcast a processing status event to authorized WebSocket clients.
 */
export function broadcastStatus(
  chatJid: string,
  status: 'processing' | 'connecting' | 'waiting' | 'responding' | 'error' | 'done' | 'queued',
  detail?: string,
): void {
  const linkedJids = getLinkedChatJids(chatJid);
  if (!linkedJids.includes(chatJid)) linkedJids.push(chatJid);

  for (const [tokenId, clients] of wsConnections.entries()) {
    const mappings = getApiTokenChatMappings(tokenId);
    const hasChat = mappings.length === 0 || linkedJids.some((jid) => mappings.includes(jid));

    if (hasChat) {
      const sentClients = new Set<WsClient>();
      for (const targetJid of linkedJids) {
        const payload = JSON.stringify({
          type: 'status',
          chatJid: targetJid,
          status,
          detail,
          timestamp: new Date().toISOString(),
        });
        for (const client of clients) {
          if (sentClients.has(client)) continue;
          if (safeSend(client, payload)) {
            sentClients.add(client);
          }
        }
      }
    }
  }
}

/**
 * Broadcast an execution step event to authorized WebSocket clients.
 */
export function broadcastStep(
  chatJid: string,
  executionId: string,
  step: { timestamp: string; phase: string; message: string; metadata?: Record<string, unknown> },
): void {
  const linkedJids = getLinkedChatJids(chatJid);
  if (!linkedJids.includes(chatJid)) linkedJids.push(chatJid);

  for (const [tokenId, clients] of wsConnections.entries()) {
    const mappings = getApiTokenChatMappings(tokenId);
    const hasChat = mappings.length === 0 || linkedJids.some((jid) => mappings.includes(jid));

    if (hasChat) {
      const sentClients = new Set<WsClient>();
      const payload = JSON.stringify({
        type: 'step',
        chatJid,
        executionId,
        step,
        timestamp: new Date().toISOString(),
      });
      for (const client of clients) {
        if (sentClients.has(client)) continue;
        if (safeSend(client, payload)) {
          sentClients.add(client);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — Utilities
// ---------------------------------------------------------------------------

/**
 * Broadcast an execution update event to all authenticated WebSocket clients.
 * Sent when an execution starts, completes, or errors — so the control panel
 * can update its activity view in real time without HTTP polling.
 */
export function broadcastExecutionUpdate(execution: AgentExecution): void {
  const payload = JSON.stringify({
    type: 'execution_update',
    execution: {
      id: execution.id,
      timestamp: execution.timestamp,
      workspaceName: execution.workspaceName,
      workspaceFolder: execution.workspaceFolder,
      chatJid: execution.chatJid,
      agentType: execution.agentType,
      status: execution.status,
      model: execution.model,
      sessionId: execution.sessionId,
      messageCount: execution.messageCount,
      duration: execution.duration,
      error: execution.error,
      outputSent: execution.outputSent,
      steps: execution.steps,
    },
  });

  for (const [_tokenId, clients] of wsConnections.entries()) {
    for (const client of clients) {
      safeSend(client, payload);
    }
  }
}

/** Get total number of active WebSocket connections across all tokens. */
export function getWsConnectionCount(): number {
  let count = 0;
  for (const clients of wsConnections.values()) {
    count += clients.size;
  }
  return count;
}
