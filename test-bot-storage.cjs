const db = require('better-sqlite3')('store/messages.db');

console.log('=== TEST: Bot Message Storage ===\n');

// Count total messages
const total = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`Total messages: ${total.count}`);

// Count bot messages
const botCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_bot_message = 1').get();
console.log(`Bot messages: ${botCount.count}`);

// Count user messages
const userCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_bot_message = 0').get();
console.log(`User messages: ${userCount.count}`);

console.log('\n=== DERNIERS 10 MESSAGES ===');
const recent = db.prepare(`
  SELECT sender_name, content, timestamp, is_bot_message 
  FROM messages 
  ORDER BY timestamp DESC 
  LIMIT 10
`).all();

recent.reverse().forEach((m, i) => {
  const type = m.is_bot_message ? '🤖 BOT' : '👤 USER';
  const preview = m.content.substring(0, 80).replace(/\n/g, ' ');
  console.log(`${i + 1}. ${type} ${m.sender_name}: ${preview}...`);
});

console.log('\n=== RÉSULTAT ===');
if (botCount.count > 0) {
  console.log('✅ SUCCESS! Les messages du bot sont stockés dans SQLite.');
  console.log(`   Ratio: ${userCount.count} messages utilisateur, ${botCount.count} messages bot`);
} else {
  console.log('❌ FAIL! Aucun message bot trouvé dans SQLite.');
  console.log('   Le fix n\'a pas encore été testé ou NanoClaw n\'a pas encore répondu.');
}

db.close();
