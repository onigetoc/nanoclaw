#!/usr/bin/env bun
import Database from 'better-sqlite3';

const db = new Database('store/messages.db');

const workspaceFolder = process.argv[2] || 'main';

console.log(`Clearing session for workspace: ${workspaceFolder}`);

const result = db.prepare('DELETE FROM sessions WHERE group_folder = ?').run(workspaceFolder);

console.log(`Deleted ${result.changes} session(s)`);

db.close();
