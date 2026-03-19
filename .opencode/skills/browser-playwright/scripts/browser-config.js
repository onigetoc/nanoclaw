/**
 * Shared browser config.
 * Uses a dedicated persistent profile (data/browser-profile/).
 * Cookies and sessions accumulate over time — log in once, stay logged in.
 * Uses real Chrome executable with stealth patches.
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.PROJECT_DIR || path.resolve(__dirname, '..', '..', '..', '..');
const PROFILE_DIR = path.join(PROJECT_ROOT, 'data', 'browser-profile');
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const USER_AGENTS = [
  // Chrome 131 - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Chrome 130 - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Chrome 131 - Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Chrome 130 - Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Edge 131 - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  // Firefox 132 - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  // Firefox 132 - Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  // Chrome 131 - Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function findBrowser() {
  // Allow override via env var
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }

  const paths = [
    // Chrome first (most stable with Playwright)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export async function launchBrowser() {
  const browserPath = findBrowser();
  console.log(browserPath ? `Using browser: ${browserPath}` : 'Using Chromium (fallback)');

  const ua = randomUserAgent();
  console.log(`User-Agent: ${ua.slice(0, 60)}...`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: browserPath || undefined,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-extensions',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-features=PerplexityOnboarding',
      '--no-default-browser-check',
      '--disable-popup-blocking',
    ],
    userAgent: ua,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Give custom browsers (Comet, etc.) time to initialize
  await new Promise(r => setTimeout(r, 3000));

  // Close any onboarding/welcome tabs that Comet may open
  for (const p of context.pages()) {
    const url = p.url();
    if (url.includes('perplexity-onboarding') || url.includes('chrome://') || url.includes('welcome')) {
      try { await p.close(); } catch {}
    }
  }

  // Stealth patches
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

export function resolveOutputPath(filename) {
  const workspaceFolder = process.env.WORKSPACE_FOLDER || 'main';
  const workspaceDir = path.join(PROJECT_ROOT, 'workspaces', workspaceFolder);
  fs.mkdirSync(workspaceDir, { recursive: true });
  return path.join(workspaceDir, filename);
}
