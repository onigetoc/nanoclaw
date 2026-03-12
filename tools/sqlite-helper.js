import sqlite3 from 'sqlite3';
import { argv } from 'node:process';

const dbPath = argv[2];
const query = argv[3];

if (!dbPath || !query) {
  console.error('Usage: bun tools/sqlite-helper.js <dbPath> "<query>"');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

db.all(query, [], (err, rows) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
