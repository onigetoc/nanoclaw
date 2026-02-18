#!/usr/bin/env node
/**
 * Auto-setup script for NanoClaw
 * Runs on first start to configure the main chat automatically
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Paths
const storeDir = path.join(projectRoot, 'store');
const dbPath = path.join(storeDir, 'messages.db');
const groupsDir = path.join(projectRoot, 'groups');
const mainGroupDir = path.join(groupsDir, 'main');

console.log('🔍 Checking NanoClaw setup...');

// Create store directory
fs.mkdirSync(storeDir, { recursive: true });

// Open database
const db = new Database(dbPath);

// Create schema
db.exec(`
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
    folder TEXT NOT NULL UNIQUE,
    trigger_pattern TEXT NOT NULL,
    added_at TEXT NOT NULL,
    container_config TEXT,
    requires_trigger INTEGER DEFAULT 1
  );
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
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    context_mode TEXT DEFAULT 'isolated'
  );
  CREATE TABLE IF NOT EXISTS task_run_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    run_at TEXT NOT NULL,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    result TEXT,
    error TEXT,
    FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
  );
`);

// Check if main group exists
const mainGroup = db.prepare('SELECT * FROM registered_groups WHERE folder = ?').get('main');

if (!mainGroup) {
  console.log('📝 No main group found - setup required');
  console.log('');
  console.log('ℹ️  When you send your first message to the bot on Telegram,');
  console.log('   it will automatically register your chat as the main group.');
  console.log('');
  console.log('   Just start the bot and send a message!');
} else {
  console.log('✅ Main group already configured');
  console.log(`   JID: ${mainGroup.jid}`);
  console.log(`   Name: ${mainGroup.name}`);
}

// Create main group directory structure
fs.mkdirSync(path.join(mainGroupDir, 'logs'), { recursive: true });
fs.mkdirSync(path.join(mainGroupDir, 'conversations'), { recursive: true });

// Create AGENTS.md if it doesn't exist
const agentsMdPath = path.join(mainGroupDir, 'AGENTS.md');
if (!fs.existsSync(agentsMdPath)) {
  fs.writeFileSync(agentsMdPath, `# Memory for Main Chat

This is your personal chat memory. You can store information here that you want to remember across conversations.

## About Me

[The agent can write information about you here]

## Preferences

[Your preferences and settings]

## Projects

[Information about your projects]
`);
  console.log('📄 Created groups/main/AGENTS.md');
}

// Create global directory
const globalDir = path.join(groupsDir, 'global');
fs.mkdirSync(globalDir, { recursive: true });

const globalAgentsMdPath = path.join(globalDir, 'AGENTS.md');
if (!fs.existsSync(globalAgentsMdPath)) {
  fs.writeFileSync(globalAgentsMdPath, `# Global Memory

This memory is shared across all groups. Store general knowledge and capabilities here.

## Available Skills

Skills are located in \`.opencode/skills/\`. To use a skill, read its SKILL.md file.

## Capabilities

- Web search and content fetching
- File reading and writing
- Code analysis and generation
- Task scheduling
- Multi-group management
`);
  console.log('📄 Created groups/global/AGENTS.md');
}

db.close();

console.log('');
console.log('✅ Setup complete!');
console.log('');
console.log('Next steps:');
console.log('1. Make sure TELEGRAM_BOT_TOKEN is set in .env');
console.log('2. Start NanoClaw: npm start');
console.log('3. Send a message to your bot on Telegram');
console.log('4. The bot will auto-register your chat!');
console.log('');
