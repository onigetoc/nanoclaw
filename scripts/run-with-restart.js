#!/usr/bin/env node

/**
 * Process supervisor for EureClaw
 * Automatically restarts the process if it exits with code 0 (clean restart)
 * Exits on error codes (code !== 0)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let restartCount = 0;
const MAX_RESTARTS_PER_MINUTE = 5;
const restartTimestamps = [];

function shouldRestart() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // Clean old timestamps
  while (restartTimestamps.length > 0 && restartTimestamps[0] < oneMinuteAgo) {
    restartTimestamps.shift();
  }
  
  // Check if we've restarted too many times
  if (restartTimestamps.length >= MAX_RESTARTS_PER_MINUTE) {
    return false;
  }
  
  restartTimestamps.push(now);
  return true;
}

function startEureClaw() {
  console.log('\n🚀 Starting EureClaw...\n');
  
  const child = spawn('bun', ['run', 'scripts/start-with-opencode.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code, signal) => {
    console.log(`\n📊 Process exited - Code: ${code}, Signal: ${signal}`);
    
    if (signal) {
      console.log(`\n⚠️  EureClaw killed by signal: ${signal}`);
      process.exit(1);
    }

    if (code === 0) {
      // Clean exit - restart requested
      restartCount++;
      console.log(`\n🔄 Restart requested (count: ${restartCount})`);
      
      if (shouldRestart()) {
        console.log('⏳ Waiting 5 seconds for clean shutdown...\n');
        // Longer delay to ensure clean disconnect from Telegram/WhatsApp
        setTimeout(() => startEureClaw(), 5000);
      } else {
        console.error('\n❌ Too many restarts in a short time. Stopping to prevent restart loop.');
        console.error('   Please check logs and restart manually.\n');
        process.exit(1);
      }
    } else {
      // Error exit - don't restart
      console.error(`\n❌ EureClaw exited with error code: ${code}`);
      console.error('   Not restarting. Please check logs and fix the issue.\n');
      process.exit(code);
    }
  });

  child.on('error', (err) => {
    console.error('\n❌ Failed to start EureClaw:', err.message);
    process.exit(1);
  });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down EureClaw supervisor...\n');
  process.exit(0);
});

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           EureClaw Process Supervisor                     ║');
console.log('║                                                            ║');
console.log('║  • Automatic restart on /restart command                  ║');
console.log('║  • Protection against restart loops                       ║');
console.log('║  • Press Ctrl+C to stop                                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');

startEureClaw();
