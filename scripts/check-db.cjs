const db = require('better-sqlite3')('store/messages.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', JSON.stringify(tables, null, 2));
db.close();
