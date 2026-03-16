/**
 * Browser daemon — keeps Chrome open, executes commands via file-based IPC.
 *
 * Start: node daemon.js
 * Commands are written to data/browser-ipc/command.json
 * Results are written to data/browser-ipc/result.json
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT =
  process.env.PROJECT_DIR || path.resolve(__dirname, '..', '..', '..', '..');
const IPC_DIR = path.join(PROJECT_ROOT, 'data', 'browser-ipc');
const PROFILE_DIR = path.join(PROJECT_ROOT, 'data', 'browser-profile-test');
const CMD_FILE = path.join(IPC_DIR, 'command.json');
const RESULT_FILE = path.join(IPC_DIR, 'result.json');
const PID_FILE = path.join(IPC_DIR, 'daemon.pid');

fs.mkdirSync(IPC_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// Clean stale files
if (fs.existsSync(CMD_FILE)) fs.unlinkSync(CMD_FILE);
if (fs.existsSync(RESULT_FILE)) fs.unlinkSync(RESULT_FILE);

function findChrome() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(
      process.env.LOCALAPPDATA || '',
      'Google\\Chrome\\Application\\chrome.exe',
    ),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function resolveOutputPath(filename) {
  const groupFolder = process.env.GROUP_FOLDER || 'main';
  const groupDir = path.join(PROJECT_ROOT, 'groups', groupFolder);
  fs.mkdirSync(groupDir, { recursive: true });
  return path.join(groupDir, filename);
}

// --- Command handlers ---

async function handleCommand(page, cmd) {
  const { action } = cmd;

  switch (action) {
    case 'navigate': {
      await page.goto(cmd.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);
      return { ok: true, url: page.url(), title: await page.title() };
    }
    case 'screenshot': {
      const outPath = resolveOutputPath(cmd.filename || 'screenshot.png');
      await page.screenshot({ path: outPath, fullPage: !!cmd.fullPage });
      return { ok: true, path: outPath };
    }
    case 'click': {
      await page.click(cmd.selector, { timeout: 10000 });
      await page.waitForTimeout(500);
      return { ok: true };
    }
    case 'fill': {
      await page.waitForSelector(cmd.selector, { timeout: 10000 });
      await page.fill(cmd.selector, cmd.text);
      return { ok: true };
    }
    case 'type': {
      await page.waitForSelector(cmd.selector, { timeout: 10000 });
      await page.type(cmd.selector, cmd.text, { delay: 50 });
      return { ok: true };
    }
    case 'press': {
      await page.keyboard.press(cmd.key);
      return { ok: true };
    }
    case 'wait': {
      if (cmd.selector) {
        await page.waitForSelector(cmd.selector, {
          timeout: cmd.timeout || 10000,
        });
      } else if (cmd.ms) {
        await page.waitForTimeout(cmd.ms);
      } else {
        await page.waitForLoadState('networkidle', { timeout: 30000 });
      }
      return { ok: true };
    }
    case 'extract': {
      if (cmd.all) {
        const els = await page.$$(cmd.selector);
        const results = [];
        for (const el of els) {
          const val = cmd.attr
            ? await el.getAttribute(cmd.attr)
            : await el.textContent();
          if (val && val.trim()) results.push(val.trim());
        }
        return { ok: true, results };
      } else {
        const el = await page.$(cmd.selector);
        if (!el) return { ok: false, error: 'Element not found' };
        const val = cmd.attr
          ? await el.getAttribute(cmd.attr)
          : await el.textContent();
        return { ok: true, result: val ? val.trim() : '' };
      }
    }
    case 'scroll': {
      const amount = cmd.amount || 500;
      const dir = cmd.direction === 'up' ? -amount : amount;
      await page.evaluate((d) => window.scrollBy(0, d), dir);
      await page.waitForTimeout(300);
      return { ok: true };
    }
    case 'url': {
      return { ok: true, url: page.url() };
    }
    case 'title': {
      return { ok: true, title: await page.title() };
    }
    case 'close': {
      return { ok: true, shutdown: true };
    }
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

// --- Main loop ---

async function main() {
  const chromePath = findChrome();
  console.log(chromePath ? `Using Chrome: ${chromePath}` : 'Using Chromium');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Stealth
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = {
      runtime: {},
      loadTimes: function () {},
      csi: function () {},
    };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  let page = context.pages()[0] || (await context.newPage());

  // Write PID so CLI can check if daemon is running
  fs.writeFileSync(PID_FILE, String(process.pid));
  console.log(
    `Browser daemon running (PID ${process.pid}). Waiting for commands...`,
  );

  // Poll for commands
  while (true) {
    await new Promise((r) => setTimeout(r, 200));

    if (!fs.existsSync(CMD_FILE)) continue;

    let cmd;
    try {
      const raw = fs.readFileSync(CMD_FILE, 'utf-8');
      cmd = JSON.parse(raw);
      fs.unlinkSync(CMD_FILE);
    } catch {
      continue;
    }

    console.log(
      `> ${cmd.action}${cmd.url ? ' ' + cmd.url : ''}${cmd.selector ? ' ' + cmd.selector : ''}`,
    );

    try {
      const result = await handleCommand(page, cmd);
      fs.writeFileSync(RESULT_FILE, JSON.stringify(result));
      console.log(`  ✓ ${result.ok ? 'OK' : result.error}`);

      if (result.shutdown) {
        console.log('Shutting down...');
        break;
      }
    } catch (err) {
      const result = { ok: false, error: err.message };
      fs.writeFileSync(RESULT_FILE, JSON.stringify(result));
      console.log(`  ✗ ${err.message}`);
    }
  }

  await context.close();
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

main().catch((err) => {
  console.error('Daemon crashed:', err.message);
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(1);
});
