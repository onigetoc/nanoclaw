const Database = require('better-sqlite3');
const db = new Database('data/nanoclaw.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));
for (const t of tables) {
  const count = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get();
  console.log(t.name + ':', count.c, 'rows');
  if (count.c > 0 && count.c < 20) {
    const rows = db.prepare('SELECT * FROM ' + t.name).all();
    console.log('  Data:', JSON.stringify(rows, null, 2));
  }
}
db.close();
