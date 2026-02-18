#!/usr/bin/env node
/**
 * OpenCode Server Wrapper
 * Starts OpenCode server with a friendly message
 */
import { spawn } from 'child_process';

console.clear();
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                                                            ║');
console.log('║              🚀 NanoClaw OpenCode Server                   ║');
console.log('║                                                            ║');
console.log('║  Status: Running on http://127.0.0.1:4096                  ║');
console.log('║                                                            ║');
console.log('║  ℹ️  This window must stay open for NanoClaw to work       ║');
console.log('║                                                            ║');
console.log('║  ✅ Server is secure (localhost only)                      ║');
console.log('║  ✅ No external access possible                            ║');
console.log('║                                                            ║');
console.log('║  You can minimize this window, but do not close it.       ║');
console.log('║                                                            ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Start OpenCode server
const server = spawn('opencode', ['serve'], {
  stdio: 'inherit',
  shell: true
});

server.on('exit', (code) => {
  console.log('');
  console.log('⚠️  OpenCode server stopped');
  if (code !== 0) {
    console.log(`   Exit code: ${code}`);
  }
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 Shutting down OpenCode server...');
  server.kill('SIGINT');
});
