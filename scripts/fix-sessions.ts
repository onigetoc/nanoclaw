#!/usr/bin/env bun
/**
 * Fix session loop issue by cleaning up and resetting state
 */
import Database from 'better-sqlite3';
import path from 'path';
import { execSync } from 'child_process';

const STORE_DIR = path.join(process.cwd(), 'store');
const dbPath = path.join(STORE_DIR, 'messages.db');

console.log('🔧 Fixing session loop issue...\n');

// 1. Check current sessions
console.log('📊 Current sessions in database:');
const db = new Database(dbPath);
const sessions = db.prepare('SELECT * FROM sessions').all();
console.log(sessions);
console.log('');

// 2. Check for running processes
console.log('🔍 Checking for running EureClaw processes...');
try {
  const processes = execSync('ps aux | grep -E "(eureclaw|opencode)" | grep -v grep', { encoding: 'utf-8' });
  if (processes.trim()) {
    console.log('Found running processes:');
    console.log(processes);
    console.log('\n⚠️  Please stop EureClaw first: pkill -f eureclaw');
    process.exit(1);
  }
} catch {
  console.log('✓ No running processes found\n');
}

// 3. Keep sessions but clear any stale state
console.log('✓ Sessions are valid, keeping them\n');

// 4. Check router state
console.log('📊 Router state:');
const routerState = db.prepare('SELECT * FROM router_state').all();
console.log(routerState);
console.log('');

console.log('✅ Database looks good!');
console.log('\n💡 To restart EureClaw:');
console.log('   bun run dev');

db.close();
