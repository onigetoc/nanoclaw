#!/usr/bin/env node
/**
 * Disable trigger requirement for "work" group
 * 
 * This allows you to talk to Andy in the work group without using @andy
 * 
 * Usage: node scripts/disable-trigger-for-work.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const dbPath = join(projectRoot, 'store', 'messages.db');

console.log(`\nOpening database: ${dbPath}\n`);

const db = new Database(dbPath);

// Check if table exists
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registered_groups'").all();

if (tables.length === 0) {
  console.log('❌ Table "registered_groups" not found!');
  console.log('   EureClaw needs to be started at least once to create the database.');
  console.log('   Run "bun start" first, then run this script again.');
  db.close();
  process.exit(1);
}

// Show current state
console.log('Current groups:');
const groups = db.prepare('SELECT jid, name, folder, requires_trigger FROM registered_groups').all();

if (groups.length === 0) {
  console.log('  (no groups registered yet)');
  db.close();
  process.exit(0);
}

groups.forEach(g => {
  const triggerStatus = g.requires_trigger === 1 ? '✓ requires @andy' : '✗ no trigger needed';
  console.log(`  ${g.name} (${g.folder}): ${triggerStatus}`);
});

// Check if work group exists
const workGroup = groups.find(g => g.folder === 'work');
if (!workGroup) {
  console.log('\n⚠️  "work" group not found in database.');
  console.log('   Register the work group first by sending a message to it.');
  db.close();
  process.exit(0);
}

if (workGroup.requires_trigger === 0) {
  console.log('\n✓ "work" group already has trigger disabled!');
  db.close();
  process.exit(0);
}

// Update work group to not require trigger
console.log('\nDisabling trigger requirement for "work" group...');
const result = db.prepare(`
  UPDATE registered_groups 
  SET requires_trigger = 0 
  WHERE folder = 'work'
`).run();

console.log(`✓ Updated ${result.changes} group(s)`);

// Show new state
console.log('\nNew state:');
const newGroups = db.prepare('SELECT jid, name, folder, requires_trigger FROM registered_groups').all();
newGroups.forEach(g => {
  const triggerStatus = g.requires_trigger === 1 ? '✓ requires @andy' : '✗ no trigger needed';
  console.log(`  ${g.name} (${g.folder}): ${triggerStatus}`);
});

db.close();
console.log('\n✓ Done! Restart EureClaw to apply changes.');
console.log('  You can now talk in the work group without using @andy\n');
