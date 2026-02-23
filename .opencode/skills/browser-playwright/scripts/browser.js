/**
 * Browser CLI — sends commands to the daemon.
 * Auto-starts daemon if not running.
 * 
 * Usage:
 *   node browser.js navigate <url>
 *   node browser.js screenshot <filename> [--full]
 *   node browser.js click <selector>
 *   node browser.js fill <selector> <text>
 *   node browser.js type <selector> <text>
 *   node browser.js press <key>
 *   node browser.js wait [selector|ms]
 *   node browser.js extract <selector> [--all] [--attr name]
 *   node browser.js scroll [down|up] [amount]
 *   node browser.js url
 *   node browser.js title
 *   node browser.js close
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.PROJECT_DIR || path.resolve(__dirname, '..', '..', '..', '..');
const IPC_DIR = path.join(PROJECT_ROOT, 'data', 'browser-ipc');
const CMD_FILE = path.join(IPC_DIR, 'command.json');
const RESULT_FILE = path.join(IPC_DIR, 'result.json');
const PID_FILE = path.join(IPC_DIR, 'daemon.pid');

fs.mkdirSync(IPC_DIR, { recursive: true });

function isDaemonRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startDaemon() {
  console.log('Starting browser daemon...');
  const daemonPath = path.join(__dirname, 'daemon.js');
  const env = { ...process.env, PROJECT_DIR: PROJECT_ROOT };
  const child = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore',
    env,
    cwd: PROJECT_ROOT,
  });
  child.unref();

  // Wait for daemon to be ready (PID file appears)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (isDaemonRunning()) {
      console.log('Browser daemon started.');
      return;
    }
  }
  throw new Error('Daemon failed to start within 30s');
}

async function sendCommand(cmd) {
  // Clean old result
  if (fs.existsSync(RESULT_FILE)) fs.unlinkSync(RESULT_FILE);

  // Write command
  fs.writeFileSync(CMD_FILE, JSON.stringify(cmd));

  // Wait for result (timeout 120s for slow pages)
  for (let i = 0; i < 600; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (fs.existsSync(RESULT_FILE)) {
      const raw = fs.readFileSync(RESULT_FILE, 'utf-8');
      fs.unlinkSync(RESULT_FILE);
      return JSON.parse(raw);
    }
  }
  throw new Error('Command timed out (120s)');
}

function parseArgs(args) {
  const action = args[0];
  if (!action) { console.error('No action specified'); process.exit(1); }

  switch (action) {
    case 'navigate': return { action, url: args[1] };
    case 'screenshot': {
      const cmd = { action, filename: args[1] || 'screenshot.png' };
      if (args.includes('--full')) cmd.fullPage = true;
      return cmd;
    }
    case 'click': return { action, selector: args[1] };
    case 'fill': return { action, selector: args[1], text: args[2] };
    case 'type': return { action, selector: args[1], text: args[2] };
    case 'press': return { action, key: args[1] };
    case 'wait': {
      const val = args[1];
      if (!val) return { action };
      if (/^\d+$/.test(val)) return { action, ms: parseInt(val) };
      return { action, selector: val, timeout: parseInt(args[2]) || 10000 };
    }
    case 'extract': {
      const cmd = { action, selector: args[1] };
      if (args.includes('--all')) cmd.all = true;
      const ai = args.indexOf('--attr');
      if (ai !== -1) cmd.attr = args[ai + 1];
      return cmd;
    }
    case 'scroll': return { action, direction: args[1] || 'down', amount: parseInt(args[2]) || 500 };
    case 'url': return { action };
    case 'title': return { action };
    case 'close': return { action };
    default: console.error(`Unknown action: ${action}`); process.exit(1);
  }
}

// --- Main ---
const args = process.argv.slice(2);
const cmd = parseArgs(args);

if (!isDaemonRunning() && cmd.action !== 'close') {
  await startDaemon();
}

if (!isDaemonRunning() && cmd.action === 'close') {
  console.log('Daemon not running.');
  process.exit(0);
}

try {
  const result = await sendCommand(cmd);
  if (result.ok) {
    if (result.url) console.log(`URL: ${result.url}`);
    if (result.title) console.log(`Title: ${result.title}`);
    if (result.path) console.log(`Screenshot: ${result.path}`);
    if (result.result) console.log(result.result);
    if (result.results) result.results.forEach((r, i) => console.log(`[${i + 1}] ${r}`));
    if (!result.url && !result.title && !result.path && !result.result && !result.results) {
      console.log('OK');
    }
  } else {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
