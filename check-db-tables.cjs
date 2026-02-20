const db = require('better-sqlite3')('data/nanoclaw.db');

console.log('=== TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(`  - ${t.name}`));

console.log('\n=== MESSAGES ===');
try {
  const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get();
  console.log(`Total messages: ${msgCount.count}`);
  
  const recent = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 3').all();
  console.log('\nDerniers messages:');
  recent.forEach(m => {
    console.log(`  [${m.timestamp}] ${m.sender_name}: ${m.content.substring(0, 50)}...`);
  });
} catch (err) {
  console.log('Erreur:', err.message);
}

db.close();
