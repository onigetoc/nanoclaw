// Vérifier le contenu de la base de données
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'nanoclaw.db');
const db = new Database(dbPath);

console.log('\n=== Groupes enregistrés ===');
const groups = db.prepare('SELECT * FROM registered_groups').all();
console.log(groups);

console.log('\n=== Chats ===');
const chats = db.prepare('SELECT * FROM chats').all();
console.log(chats);

console.log('\n=== Sessions ===');
const sessions = db.prepare('SELECT * FROM sessions').all();
console.log(sessions);

db.close();
