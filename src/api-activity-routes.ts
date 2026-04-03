/**
 * Activity API Routes — Event Activity Panel
 *
 * Provides REST endpoints for historical JSONL event files and an SSE
 * endpoint for real-time activity streaming from OpenCode.
 *
 * Registered via registerActivityRoutes(fastify, authenticate).
 */

import fs from 'fs';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRegisteredWorkspaces, getSessions } from './state.js';
import { getOpenCodePort, getOpenCodeHost } from './opencode-server.js';
import { WORKSPACES_DIR } from './config.js';
import { parseJsonlContent, normalizeEvent, isAllowedEvent } from './activity-utils.js';
import type { ActivityFile } from './activity-types.js';
import { logger } from './logger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a JID to its workspace folder, or null if not registered. */
function resolveWorkspaceFolder(jid: string): string | null {
  const workspaces = getRegisteredWorkspaces();
  const ws = workspaces[jid];
  return ws?.folder ?? null;
}

/** Get the events directory path for a workspace folder. */
function eventsDir(folder: string): string {
  return path.join(WORKSPACES_DIR, folder, 'logs', 'events');
}

// ─── Route Registration ──────────────────────────────────────────────────────

export function registerActivityRoutes(
  fastify: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
): void {

  // ── 3.1  GET /chats/:jid/activity — List JSONL files ─────────────────────
  fastify.get(
    '/chats/:jid/activity',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { jid } = request.params as { jid: string };
      const folder = resolveWorkspaceFolder(jid);

      if (!folder) {
        reply.code(404).send({ error: 'Workspace not found for this chat' });
        return;
      }

      const dir = eventsDir(folder);

      if (!fs.existsSync(dir)) {
        return { files: [] };
      }

      try {
        const entries = await fs.promises.readdir(dir);
        const files: ActivityFile[] = [];

        for (const name of entries) {
          if (!name.endsWith('.jsonl')) continue;
          const filePath = path.join(dir, name);
          const stat = await fs.promises.stat(filePath);
          files.push({
            filename: name,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }

        // Sort by modified descending (newest first)
        files.sort((a, b) => b.modified.localeCompare(a.modified));

        return { files };
      } catch (err) {
        logger.error({ err, folder }, 'Failed to list activity files');
        reply.code(500).send({ error: 'Failed to read event files' });
      }
    },
  );

  // ── 3.3  GET /chats/:jid/activity/stream — SSE real-time ─────────────────
  // IMPORTANT: registered BEFORE :filename to avoid Fastify treating "stream" as a filename
  fastify.get(
    '/chats/:jid/activity/stream',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { jid } = request.params as { jid: string };
      const folder = resolveWorkspaceFolder(jid);

      if (!folder) {
        reply.code(404).send({ error: 'Workspace not found for this chat' });
        return;
      }

      // Resolve the sessionID for this workspace so we can filter events
      const sessions = getSessions();
      const sessionId = sessions[folder] || '';

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
          headers: { Accept: 'text/event-stream' },
          signal: abortController.signal,
        });

        if (!resp.ok || !resp.body) {
          reply.raw.write(
            `data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to OpenCode event stream' })}\n\n`,
          );
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
              const eventType: string = data.type || '';

              // Filter: only allowed event types
              if (!isAllowedEvent(eventType)) continue;

              // Filter by session: skip events from other workspaces
              const props = data.properties || {};
              const eventSessionId =
                props.sessionID ||
                (props.info as Record<string, unknown>)?.sessionID ||
                '';
              if (sessionId && eventSessionId && eventSessionId !== sessionId) continue;

              // For message.part.updated, only forward tool events
              if (eventType === 'message.part.updated') {
                const part = props.part as Record<string, unknown> | undefined;
                if (!part || (part.type !== 'tool-invocation' && part.type !== 'tool')) continue;
              }

              // Normalize the event
              const normalized = normalizeEvent({
                ts: data.ts ?? Date.now(),
                type: eventType,
                properties: props,
              });

              // Enrich with workspace context
              const enriched = {
                ...normalized,
                chatJid: jid,
                folder,
              };

              reply.raw.write(`data: ${JSON.stringify(enriched)}\n\n`);
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          logger.warn({ err: err?.message }, 'Activity stream error');
          try {
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'error', message: err?.message || 'Stream error' })}\n\n`,
            );
          } catch {
            /* connection already closed */
          }
        }
      } finally {
        try {
          reply.raw.end();
        } catch {
          /* already ended */
        }
      }
    },
  );

  // ── 3.2  GET /chats/:jid/activity/:filename — Read specific JSONL file ───
  fastify.get(
    '/chats/:jid/activity/:filename',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { jid, filename } = request.params as { jid: string; filename: string };
      const query = request.query as Record<string, string>;
      const limit = query.limit ? parseInt(query.limit, 10) : 500;
      const since = query.since ? parseFloat(query.since) : undefined;

      const folder = resolveWorkspaceFolder(jid);

      if (!folder) {
        reply.code(404).send({ error: 'Workspace not found for this chat' });
        return;
      }

      // Sanitize filename to prevent path traversal
      const safeName = path.basename(filename);
      const filePath = path.join(eventsDir(folder), safeName);

      if (!fs.existsSync(filePath)) {
        reply.code(404).send({ error: 'Event file not found' });
        return;
      }

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        let events = parseJsonlContent(content);

        // Filter by timestamp if since is provided
        if (since !== undefined) {
          events = events.filter((e) => e.ts > since);
        }

        // Cap results to limit
        if (events.length > limit) {
          events = events.slice(-limit);
        }

        return { events };
      } catch (err) {
        logger.error({ err, filePath }, 'Failed to read activity file');
        reply.code(500).send({ error: 'Failed to read event file' });
      }
    },
  );
}
