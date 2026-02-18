#!/usr/bin/env node
/**
 * NanoClaw startup script with OpenCode auto-install
 * Checks if OpenCode is installed and running, installs if needed, then starts NanoClaw
 */
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkCommand(command) {
  try {
    execSync(`${command} --version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isOpencodeServerRunning() {
  try {
    // Try to connect to OpenCode server
    if (process.platform === 'win32') {
      const result = execSync('netstat -ano | findstr :4096', { encoding: 'utf8' });
      return result.includes('LISTENING');
    } else {
      const result = execSync('lsof -i :4096', { encoding: 'utf8' });
      return result.length > 0;
    }
  } catch {
    return false;
  }
}

async function main() {
  log('\n🚀 Starting NanoClaw with OpenCode...', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.blue);

  // Step 1: Check if npm is installed
  log('📦 Checking npm installation...', colors.yellow);
  if (!checkCommand('npm')) {
    log('❌ npm is not installed!', colors.red);
    log('   Please install Node.js from https://nodejs.org/', colors.red);
    process.exit(1);
  }
  log('✅ npm is installed\n', colors.green);

  // Step 2: Check if OpenCode is installed
  log('🔍 Checking OpenCode installation...', colors.yellow);
  if (!checkCommand('opencode')) {
    log('⚠️  OpenCode is not installed', colors.yellow);
    log('📥 Installing OpenCode globally via npm...', colors.blue);
    
    try {
      execSync('npm install -g opencode-ai', { 
        stdio: 'inherit',
        cwd: projectRoot 
      });
      log('✅ OpenCode installed successfully\n', colors.green);
    } catch (error) {
      log('❌ Failed to install OpenCode', colors.red);
      log('   Please install manually: npm install -g opencode-ai', colors.red);
      process.exit(1);
    }
  } else {
    const version = execSync('opencode --version', { encoding: 'utf8' }).trim();
    log(`✅ OpenCode is installed (v${version})\n`, colors.green);
  }

  // Step 3: OpenCode server is now managed by NanoClaw itself (src/opencode-server.ts)
  // It will auto-start, health-check, and restart the server as needed.
  // Kill any zombie OpenCode server from previous runs to avoid port conflicts.
  log('🔌 Checking for stale OpenCode server...', colors.yellow);
  if (isOpencodeServerRunning()) {
    log('⚠️  Found existing OpenCode server on port 4096', colors.yellow);
    log('   NanoClaw will manage it automatically. Killing stale process...', colors.yellow);
    try {
      if (process.platform === 'win32') {
        execSync('for /f "tokens=5" %a in (\'netstat -ano ^| findstr :4096 ^| findstr LISTENING\') do taskkill /F /PID %a', { stdio: 'pipe', shell: true });
      } else {
        execSync('kill $(lsof -t -i :4096) 2>/dev/null || true', { stdio: 'pipe' });
      }
      log('✅ Stale server killed. NanoClaw will start a fresh one.\n', colors.green);
    } catch {
      log('   Could not kill stale server, NanoClaw will handle it.\n', colors.yellow);
    }
  } else {
    log('✅ No stale OpenCode server found. NanoClaw will start one.\n', colors.green);
  }

  // Step 4: Run auto-setup
  log('⚙️  Running auto-setup...', colors.yellow);
  try {
    execSync('node scripts/auto-setup.js', { 
      stdio: 'inherit',
      cwd: projectRoot 
    });
  } catch (error) {
    log('⚠️  Auto-setup had issues, but continuing...', colors.yellow);
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('🎉 All checks passed! Starting NanoClaw...', colors.green);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.blue);

  // Step 5: Start NanoClaw
  const nanoclaw = spawn('tsx', ['src/index.ts'], {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: true // Required on Windows
  });

  nanoclaw.on('exit', (code) => {
    if (code !== 0) {
      log(`\n❌ NanoClaw exited with code ${code}`, colors.red);
    }
    process.exit(code);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    log('\n\n👋 Shutting down NanoClaw...', colors.yellow);
    nanoclaw.kill('SIGINT');
  });
}

main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
