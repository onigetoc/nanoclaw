const db = require('better-sqlite3')('store/messages.db');

console.log('=== STATISTIQUES SQLite ===\n');

const stats = db.prepare('SELECT COUNT(*) as total, MIN(timestamp) as first, MAX(timestamp) as last FROM messages').get();
console.log('Total messages:', stats.total);
console.log('Premier message:', stats.first);
console.log('Dernier message:', stats.last);

console.log('\n=== PAR EXPÉDITEUR ===');
const bySender = db.prepare('SELECT sender_name, COUNT(*) as count FROM messages GROUP BY sender_name').all();
bySender.forEach(s => console.log(`  ${s.sender_name}: ${s.count} messages`));

console.log('\n=== MESSAGES BOT ===');
const botCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_bot_message = 1').get();
console.log('Messages du bot:', botCount.count);

console.log('\n=== DERNIERS 5 MESSAGES ===');
const recent = db.prepare('SELECT sender_name, content, timestamp, is_bot_message FROM messages ORDER BY timestamp DESC LIMIT 5').all();
recent.forEach(m => {
  const type = m.is_bot_message ? '[BOT]' : '[USER]';
  const preview = m.content.substring(0, 60);
  console.log(`${type} ${m.sender_name} (${m.timestamp}): ${preview}...`);
});

db.close();
