#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(process.cwd(), 'store', 'messages.db');
const db = new Database(dbPath);

console.log('\n=== Registered Groups ===\n');

const groups = db.prepare(`
  SELECT jid, name, folder, trigger_pattern, requires_trigger, added_at
  FROM registered_groups
  ORDER BY folder, jid
`).all();

if (groups.length === 0) {
  console.log('No groups registered.');
} else {
  for (const group of groups as any[]) {
    console.log(`Folder: ${group.folder}`);
    console.log(`  JID: ${group.jid}`);
    console.log(`  Name: ${group.name}`);
    console.log(`  Trigger: ${group.trigger_pattern}`);
    console.log(`  Requires Trigger: ${group.requires_trigger === 1 ? 'Yes' : 'No'}`);
    console.log(`  Added: ${group.added_at}`);
    console.log('');
  }
}

db.close();
