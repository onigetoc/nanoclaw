const db = require('better-sqlite3')('data/nanoclaw.db');

console.log('=== REGISTERED GROUPS ===');
const groups = db.prepare('SELECT * FROM registered_groups').all();
if (groups.length === 0) {
  console.log('Aucun groupe enregistré!');
} else {
  groups.forEach(g => {
    console.log(`\nJID: ${g.jid}`);
    console.log(`  Name: ${g.name}`);
    console.log(`  Folder: ${g.folder}`);
    console.log(`  Trigger: ${g.trigger}`);
    console.log(`  Requires trigger: ${g.requires_trigger}`);
    console.log(`  Added: ${g.added_at}`);
  });
}

db.close();
