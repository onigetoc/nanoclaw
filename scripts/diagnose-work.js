/**
 * Diagnostic script for WORK group Telegram issue
 */
import Database from 'better-sqlite3';
const db = new Database('store/messages.db');

console.log('\n=== WORK Group Diagnostic ===\n');

// 1. Check registered groups
console.log('1. Registered Groups:');
const groups = db.prepare('SELECT * FROM registered_groups').all();
console.log(JSON.stringify(groups, null, 2));

// 2. Check chats
console.log('\n2. All Chats:');
const chats = db.prepare('SELECT jid, name FROM chats').all();
console.log(JSON.stringify(chats, null, 2));

// 3. FIX: Set requires_trigger to 0 for WORK
console.log('\n3. Fixing WORK requires_trigger...');
const result = db.prepare(`
  UPDATE registered_groups 
  SET requires_trigger = 0 
  WHERE jid = 'tg:-5116663284'
`).run();
console.log(`Updated ${result.changes} row(s)`);

// 4. Verify the fix
console.log('\n4. WORK group after fix:');
const workGroup = db.prepare(`
  SELECT * FROM registered_groups WHERE jid = 'tg:-5116663284'
`).get();
console.log(JSON.stringify(workGroup, null, 2));

// 5. Check recent messages for WORK
console.log('\n3. Recent messages in WORK-related chats:');
const workMessages = db.prepare(`
  SELECT chat_jid, sender_name, content, timestamp 
  FROM messages 
  WHERE chat_jid LIKE '%work%' OR chat_jid LIKE 'tg:%'
  ORDER BY timestamp DESC 
  LIMIT 10
`).all();
console.log(JSON.stringify(workMessages, null, 2));

// 6. Check sessions
console.log('\n4. Sessions:');
const sessions = db.prepare('SELECT * FROM sessions').all();
console.log(JSON.stringify(sessions, null, 2));

db.close();
console.log('\n=== End Diagnostic ===\n');
