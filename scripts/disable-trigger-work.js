import Database from 'better-sqlite3';

const db = new Database('store/messages.db');

// Disable trigger requirement for work group
db.prepare(`
  UPDATE registered_groups 
  SET requires_trigger = 0 
  WHERE folder = 'work'
`).run();

console.log('✅ Trigger disabled for work group - you no longer need to write @andy');

// Verify
const result = db.prepare(`
  SELECT jid, name, folder, requires_trigger 
  FROM registered_groups 
  WHERE folder = 'work'
`).all();

console.log('\nWork group settings:');
console.log(JSON.stringify(result, null, 2));

db.close();
