/**
 * Diagnostic script to check current session state
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const dbPath = path.join(projectRoot, 'store', 'messages.db');

console.log('📊 EureClaw Session State Diagnostic\n');
console.log(`Database: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Check sessions table
  console.log('=== SESSIONS ===');
  const sessions = db.prepare('SELECT * FROM sessions').all();
  
  if (sessions.length === 0) {
    console.log('No sessions found (all cleared)');
  } else {
    console.table(sessions);
  }

  // Check recent messages
  console.log('\n=== RECENT MESSAGES (last 5) ===');
  const recentMessages = db.prepare(`
    SELECT 
      substr(id, 1, 20) as id,
      chat_jid,
      sender_name,
      substr(content, 1, 50) as content,
      timestamp,
      is_bot_message
    FROM messages
    ORDER BY timestamp DESC
    LIMIT 5
  `).all();
  
  console.table(recentMessages);

  // Check for /new command
  console.log('\n=== /NEW COMMAND USAGE ===');
  const newCommands = db.prepare(`
    SELECT 
      sender_name,
      content,
      timestamp
    FROM messages
    WHERE content LIKE '/new%'
    ORDER BY timestamp DESC
    LIMIT 5
  `).all();
  
  if (newCommands.length === 0) {
    console.log('No /new commands found in history');
  } else {
    console.table(newCommands);
  }

  db.close();

  console.log('\n✅ Diagnostic complete');
} catch (err) {
  console.error('❌ Error:', err);
  process.exit(1);
}
