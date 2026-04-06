/**
 * Feedback API routes — thumbs up/down on bot messages.
 * Stores model/provider info for LLM quality tracking.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  upsertFeedback,
  getModelStats,
  getFeedbackForChat,
} from './db-feedback.js';

export function registerFeedbackRoutes(
  fastify: FastifyInstance,
  authenticate: any,
): void {
  /** Submit or toggle feedback for a message */
  fastify.post(
    '/feedback',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        messageId?: string;
        chatJid?: string;
        modelId?: string;
        providerId?: string;
        rating?: string;
      };

      if (!body?.messageId || !body?.rating) {
        reply.code(400).send({ error: 'messageId and rating are required' });
        return;
      }
      if (body.rating !== 'up' && body.rating !== 'down') {
        reply.code(400).send({ error: 'rating must be "up" or "down"' });
        return;
      }

      const entry = upsertFeedback(
        body.messageId,
        body.chatJid || '',
        body.modelId || 'unknown',
        body.providerId || 'unknown',
        body.rating,
      );

      return { success: true, feedback: entry };
    },
  );

  /** Get feedback map for a chat (messageId → rating) */
  fastify.get(
    '/feedback/chat/:jid',
    { preHandler: authenticate },
    async (request: FastifyRequest) => {
      const { jid } = request.params as { jid: string };
      return { feedback: getFeedbackForChat(jid) };
    },
  );

  /** Get aggregated model stats for charts */
  fastify.get(
    '/feedback/stats',
    { preHandler: authenticate },
    async () => {
      return { stats: getModelStats() };
    },
  );
}
