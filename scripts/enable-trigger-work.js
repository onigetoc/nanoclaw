import Database from 'better-sqlite3';

const db = new Database('store/messages.db');

// Enable trigger requirement for work group
db.prepare(`
  UPDATE registered_groups 
  SET requires_trigger = 1 
  WHERE folder = 'work'
`).run();

console.log('✅ Trigger enabled for work group - you must write @andy to get a response');

// Verify
const result = db.prepare(`
  SELECT jid, name, folder, requires_trigger 
  FROM registered_groups 
  WHERE folder = 'work'
`).all();

console.log('\nWork group settings:');
console.log(JSON.stringify(result, null, 2));

db.close();
