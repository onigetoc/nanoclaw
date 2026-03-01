import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { logger } from './logger.js';
import { NewMessage, RegisteredGroup, ScheduledTask, TaskRunLog } from './types.js';

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS api_token_chats (
      token_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      PRIMARY KEY (token_id, chat_jid),
      FOREIGN KEY (token_id) REFERENCES api_tokens(id)
    );
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database.prepare(
      `UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`,
    ).run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add metadata column for model/agent info (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN metadata TEXT`,
    );
  } catch {
    /* column already exists */
  }

  // Add model column to sessions table (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE sessions ADD COLUMN model TEXT`,
    );
  } catch {
    /* column already exists */
  }
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Remove UNIQUE constraint on folder in registered_groups.
  // Multiple JIDs (e.g. tg:123 and web:main) can legitimately share the same folder.
  migrateDropFolderUnique(db);

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/**
 * Migration: remove the UNIQUE constraint on `folder` in registered_groups.
 * SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table.
 */
function migrateDropFolderUnique(database: Database.Database): void {
  try {
    // Check if the UNIQUE index on folder still exists
    const idx = database
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='index' AND tbl_name='registered_groups' AND sql LIKE '%UNIQUE%' AND sql LIKE '%folder%'`,
      )
      .get();
    if (!idx) return; // Already migrated

    database.exec(`
      CREATE TABLE IF NOT EXISTS registered_groups_new (
        jid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        folder TEXT NOT NULL,
        trigger_pattern TEXT NOT NULL,
        added_at TEXT NOT NULL,
        container_config TEXT,
        requires_trigger INTEGER DEFAULT 1
      );
      INSERT OR IGNORE INTO registered_groups_new SELECT * FROM registered_groups;
      DROP TABLE registered_groups;
      ALTER TABLE registered_groups_new RENAME TO registered_groups;
    `);
    logger.info('Migrated registered_groups: removed UNIQUE constraint on folder');
  } catch (err) {
    logger.warn({ err }, 'Failed to migrate registered_groups UNIQUE constraint (may already be done)');
  }
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
  migrateDropFolderUnique(db);
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
): void {
  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `,
    ).run(chatJid, name, timestamp);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `,
    ).run(chatJid, chatJid, timestamp);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
  metadata?: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
    msg.metadata ? JSON.stringify(msg.metadata) : null,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders})
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
): NewMessage[] {
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp, `${botPrefix}:%`) as NewMessage[];
}

export function getLinkedChatJids(chatJid: string): string[] {
  const folderRow = db
    .prepare('SELECT folder FROM registered_groups WHERE jid = ?')
    .get(chatJid) as { folder: string } | undefined;

  if (!folderRow?.folder) return [chatJid];

  const linked = db
    .prepare('SELECT jid FROM registered_groups WHERE folder = ?')
    .all(folderRow.folder) as Array<{ jid: string }>;

  const jids = linked.map((r) => r.jid);
  return jids.length > 0 ? jids : [chatJid];
}

/**
 * Get non-bot messages since a timestamp for all chat JIDs linked to the same folder.
 * For non-web JIDs, this is equivalent to getMessagesSince.
 */
export function getMessagesSinceLinked(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
): NewMessage[] {
  const linkedJids = getLinkedChatJids(chatJid);
  const placeholders = linkedJids.map(() => '?').join(',');
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid IN (${placeholders}) AND timestamp > ?
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp
  `;

  return db
    .prepare(sql)
    .all(...linkedJids, sinceTimestamp, `${botPrefix}:%`) as NewMessage[];
}

/**
 * Get all messages since a timestamp, INCLUDING bot responses.
 * Used by the web UI API to show full conversation history.
 */
// ---- API Token persistence ----

export interface DbApiToken {
  id: string;
  token_hash: string;
  name: string;
  created_at: string;
  last_used: string | null;
  active: boolean;
}

export function insertApiToken(id: string, tokenHash: string, name: string): void {
  db.prepare(
    `INSERT INTO api_tokens (id, token_hash, name, created_at, active) VALUES (?, ?, ?, ?, 1)`,
  ).run(id, tokenHash, name, new Date().toISOString());
}

export function getAllApiTokens(): DbApiToken[] {
  const rows = db.prepare(`SELECT * FROM api_tokens`).all() as any[];
  return rows.map((r) => ({
    id: r.id,
    token_hash: r.token_hash,
    name: r.name,
    created_at: r.created_at,
    last_used: r.last_used,
    active: !!r.active,
  }));
}

export function updateApiTokenLastUsed(id: string): void {
  db.prepare(`UPDATE api_tokens SET last_used = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
}

export function deactivateApiToken(id: string): void {
  db.prepare(`UPDATE api_tokens SET active = 0 WHERE id = ?`).run(id);
}

export function getApiTokenChatMappings(tokenId: string): string[] {
  const rows = db.prepare(
    `SELECT chat_jid FROM api_token_chats WHERE token_id = ?`,
  ).all(tokenId) as any[];
  return rows.map((r) => r.chat_jid);
}

export function addApiTokenChat(tokenId: string, chatJid: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO api_token_chats (token_id, chat_jid) VALUES (?, ?)`,
  ).run(tokenId, chatJid);
}

export function deleteApiTokenChats(tokenId: string): void {
  db.prepare(`DELETE FROM api_token_chats WHERE token_id = ?`).run(tokenId);
}

export function getAllMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
): NewMessage[] {
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
    ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp) as NewMessage[];
}

/**
 * Parse a raw DB row into a NewMessage, deserializing the metadata JSON.
 */
function parseMessageRow(row: any): NewMessage {
  const msg: NewMessage = { ...row };
  if (typeof row.metadata === 'string') {
    try {
      msg.metadata = JSON.parse(row.metadata);
    } catch {
      msg.metadata = undefined;
    }
  } else {
    msg.metadata = undefined;
  }
  return msg;
}

/**
 * Get all messages since a timestamp for all chat JIDs linked to the same folder.
 * Includes bot responses. For non-web JIDs, this is equivalent to getAllMessagesSince.
 */
export function getAllMessagesSinceLinked(
  chatJid: string,
  sinceTimestamp: string,
): NewMessage[] {
  const linkedJids = getLinkedChatJids(chatJid);
  const placeholders = linkedJids.map(() => '?').join(',');
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, metadata
    FROM messages
    WHERE chat_jid IN (${placeholders}) AND timestamp > ?
    ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(...linkedJids, sinceTimestamp) as any[];
  return rows.map(parseMessageRow);
}

/**
 * Get a page of messages for the web UI with cursor-based pagination.
 * Returns the most recent `limit` messages before the given `before` timestamp.
 * Results are ordered ascending (oldest first) for display.
 * Includes messages from all linked JIDs sharing the same folder.
 */
export function getMessagesPage(
  chatJid: string,
  limit: number,
  before?: string,
): { messages: NewMessage[]; hasMore: boolean } {
  const linkedJids = getLinkedChatJids(chatJid);
  const placeholders = linkedJids.map(() => '?').join(',');

  const whereClause = before
    ? `WHERE chat_jid IN (${placeholders}) AND timestamp < ?`
    : `WHERE chat_jid IN (${placeholders})`;

  const params = before ? [...linkedJids, before] : [...linkedJids];

  // Fetch limit + 1 to know if there are more older messages
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, metadata
    FROM messages
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit + 1) as any[];
  const parsed = rows.map(parseMessageRow);
  const hasMore = parsed.length > limit;
  const page = hasMore ? parsed.slice(0, limit) : parsed;

  // Reverse to get ascending order (oldest first) for display
  page.reverse();

  return { messages: page, hasMore };
}

/**
 * Get recent messages for context loading.
 * Returns the last N messages from a chat, excluding bot messages.
 * Used to provide conversation history context to the agent.
 * 
 * Note: Reduced to 10 messages (from 50) because OpenCode sessions
 * maintain full conversation memory automatically. These messages
 * serve only as initial context for new sessions or after crashes.
 */
export function getRecentMessages(
  chatJid: string,
  limit: number,
  botPrefix: string,
): NewMessage[] {
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ?
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp DESC
    LIMIT ?
  `;
  const messages = db
    .prepare(sql)
    .all(chatJid, `${botPrefix}:%`, limit) as NewMessage[];
  
  // Reverse to get chronological order (oldest first)
  return messages.reverse();
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string, model?: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id, model) VALUES (?, ?, ?)',
  ).run(groupFolder, sessionId, model ?? getCurrentModel() ?? null);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

/**
 * Read the current model from opencode.json.
 */
function getCurrentModel(): string | undefined {
  try {
    const configPath = path.join(process.cwd(), 'opencode.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.model;
  } catch {
    return undefined;
  }
}

/**
 * Purge all sessions whose stored model doesn't match the current opencode.json model.
 * Called at startup so that changing the model in opencode.json automatically
 * forces new sessions (OpenCode locks model per-session).
 */
export function purgeSessionsIfModelChanged(): void {
  const currentModel = getCurrentModel();
  if (!currentModel) {
    logger.warn('Could not read model from opencode.json — skipping session purge');
    return;
  }

  const stale = db
    .prepare('SELECT group_folder, session_id, model FROM sessions WHERE model IS NULL OR model != ?')
    .all(currentModel) as Array<{ group_folder: string; session_id: string; model: string | null }>;

  if (stale.length === 0) {
    logger.info({ model: currentModel }, 'All sessions match current model — no purge needed');
    return;
  }

  for (const row of stale) {
    logger.info(
      { group: row.group_folder, oldModel: row.model, newModel: currentModel },
      'Purging stale session (model changed)',
    );
  }

  db.prepare('DELETE FROM sessions WHERE model IS NULL OR model != ?').run(currentModel);
  logger.info({ purged: stale.length, currentModel }, `Purged ${stale.length} stale session(s) due to model change`);
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? JSON.parse(row.container_config)
      : undefined,
    requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
  };
}

export function setRegisteredGroup(
  jid: string,
  group: RegisteredGroup,
): void {
  // Use ON CONFLICT(jid) instead of INSERT OR REPLACE to avoid
  // silently deleting other JIDs that share the same folder.
  // The UNIQUE constraint on folder can cause INSERT OR REPLACE to
  // delete a different row (e.g. tg: JID) when inserting a web: JID
  // with the same folder name.
  db.prepare(
    `INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(jid) DO UPDATE SET
       name = excluded.name,
       folder = excluded.folder,
       trigger_pattern = excluded.trigger_pattern,
       added_at = excluded.added_at,
       container_config = excluded.container_config,
       requires_trigger = excluded.requires_trigger`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db
    .prepare('SELECT * FROM registered_groups')
    .all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? JSON.parse(row.container_config)
        : undefined,
      requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    };
  }
  return result;
}

/**
 * Check if a group with the specified folder name exists.
 * 
 * @param folder - The folder name to check (e.g., 'main')
 * @returns true if a group with this folder exists, false otherwise
 */
export function hasGroupWithFolder(folder: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM registered_groups WHERE folder = ? LIMIT 1')
    .get(folder) as { 1: number } | undefined;
  return row !== undefined;
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      setRegisteredGroup(jid, group);
    }
  }
}
