import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('store/messages.db');
const groups = db.prepare('SELECT * FROM registered_groups').all();
console.log(JSON.stringify(groups, null, 2));
