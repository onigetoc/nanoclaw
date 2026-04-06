/**
 * Feedback DB functions — stores thumbs up/down per message with model/provider info.
 * Used to track LLM quality stats in the control panel.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { STORE_DIR } from './config.js';
import { logger } from './logger.js';

let feedbackDb: Database.Database;

export interface FeedbackEntry {
  id: number;
  message_id: string;
  chat_jid: string;
  model_id: string;
  provider_id: string;
  rating: 'up' | 'down';
  created_at: string;
}

export interface ModelStats {
  model_id: string;
  provider_id: string;
  thumbs_up: number;
  thumbs_down: number;
  total: number;
  score: number; // percentage of thumbs up
}

export function initFeedbackDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'feedback.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  feedbackDb = new Database(dbPath);
  feedbackDb.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      model_id TEXT NOT NULL DEFAULT 'unknown',
      provider_id TEXT NOT NULL DEFAULT 'unknown',
      rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(message_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_model ON feedback(model_id);
  `);
  logger.info('Feedback database initialized');
}

/** Upsert feedback — one rating per message (re-voting flips it) */
export function upsertFeedback(
  messageId: string,
  chatJid: string,
  modelId: string,
  providerId: string,
  rating: 'up' | 'down',
): FeedbackEntry {
  const existing = feedbackDb
    .prepare('SELECT * FROM feedback WHERE message_id = ?')
    .get(messageId) as FeedbackEntry | undefined;

  if (existing) {
    if (existing.rating === rating) {
      // Same vote → remove it (toggle off)
      feedbackDb.prepare('DELETE FROM feedback WHERE id = ?').run(existing.id);
      return { ...existing, rating, id: -1 }; // id -1 signals removal
    }
    // Different vote → update
    feedbackDb
      .prepare('UPDATE feedback SET rating = ? WHERE id = ?')
      .run(rating, existing.id);
    return { ...existing, rating };
  }

  // New vote
  const now = new Date().toISOString();
  const result = feedbackDb
    .prepare(
      'INSERT INTO feedback (message_id, chat_jid, model_id, provider_id, rating, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(messageId, chatJid, modelId, providerId, rating, now);

  return {
    id: result.lastInsertRowid as number,
    message_id: messageId,
    chat_jid: chatJid,
    model_id: modelId,
    provider_id: providerId,
    rating,
    created_at: now,
  };
}

/** Get the current feedback for a specific message */
export function getFeedbackForMessage(messageId: string): FeedbackEntry | null {
  return (
    (feedbackDb
      .prepare('SELECT * FROM feedback WHERE message_id = ?')
      .get(messageId) as FeedbackEntry | undefined) ?? null
  );
}

/** Get aggregated model stats */
export function getModelStats(): ModelStats[] {
  const rows = feedbackDb
    .prepare(
      `SELECT
        model_id,
        provider_id,
        SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as thumbs_up,
        SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as thumbs_down,
        COUNT(*) as total
      FROM feedback
      GROUP BY model_id, provider_id
      ORDER BY total DESC`,
    )
    .all() as Array<{
    model_id: string;
    provider_id: string;
    thumbs_up: number;
    thumbs_down: number;
    total: number;
  }>;

  return rows.map((r) => ({
    ...r,
    score: r.total > 0 ? Math.round((r.thumbs_up / r.total) * 100) : 0,
  }));
}

/** Get all feedback entries (for export/debug) */
export function getAllFeedback(): FeedbackEntry[] {
  return feedbackDb.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all() as FeedbackEntry[];
}

/** Get feedback entries for a specific chat */
export function getFeedbackForChat(chatJid: string): Record<string, 'up' | 'down'> {
  const rows = feedbackDb
    .prepare('SELECT message_id, rating FROM feedback WHERE chat_jid = ?')
    .all(chatJid) as Array<{ message_id: string; rating: 'up' | 'down' }>;

  const map: Record<string, 'up' | 'down'> = {};
  for (const row of rows) {
    map[row.message_id] = row.rating;
  }
  return map;
}
