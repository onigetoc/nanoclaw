/**
 * Test: Control Comet (Perplexity browser) with Playwright
 * 
 * Comet is Chromium-based, so Playwright's chromium driver should work.
 * Run: node .opencode/skills/browser-playwright/scripts/test-comet.js
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COMET_PATH = path.join(process.env.LOCALAPPDATA || '', 'Perplexity\\Comet\\Application\\comet.exe');
const PROFILE_DIR = path.join(PROJECT_ROOT, 'data', 'browser-profile-comet');

fs.mkdirSync(PROFILE_DIR, { recursive: true });

async function main() {
  console.log('🚀 Launching Comet via Playwright...');
  console.log(`   Executable: ${COMET_PATH}`);
  console.log(`   Profile: ${PROFILE_DIR}`);

  if (!fs.existsSync(COMET_PATH)) {
    console.error('❌ Comet not found at:', COMET_PATH);
    process.exit(1);
  }

  try {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      executablePath: COMET_PATH,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-features=PerplexityOnboarding',
        '--no-default-browser-check',
        '--disable-popup-blocking',
      ],
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Wait for Comet to initialize
    await new Promise(r => setTimeout(r, 3000));

    // Close any onboarding tabs
    for (const p of context.pages()) {
      const url = p.url();
      if (url.includes('perplexity-onboarding') || url.includes('chrome://') || url.includes('welcome')) {
        console.log(`   Closing onboarding tab: ${url}`);
        try { await p.close(); } catch {}
      }
    }

    const page = context.pages()[0] || await context.newPage();

    // Test 1: Navigate to a page
    console.log('\n📍 Test 1: Navigate to example.com...');
    await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`   ✅ URL: ${page.url()}`);
    console.log(`   ✅ Title: ${await page.title()}`);

    // Test 2: Extract content
    console.log('\n📍 Test 2: Extract h1 text...');
    const h1 = await page.$eval('h1', el => el.textContent);
    console.log(`   ✅ H1: ${h1}`);

    // Test 3: Take a screenshot
    const screenshotPath = path.join(PROJECT_ROOT, 'data', 'comet-test-screenshot.png');
    console.log('\n📍 Test 3: Screenshot...');
    await page.screenshot({ path: screenshotPath });
    console.log(`   ✅ Saved: ${screenshotPath}`);

    // Test 4: Navigate to a search engine and fill a form
    console.log('\n📍 Test 4: Navigate to DuckDuckGo and search...');
    await page.goto('https://duckduckgo.com', { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`   ✅ URL: ${page.url()}`);

    // Try to fill the search box
    const searchSelector = 'input[name="q"]';
    await page.waitForSelector(searchSelector, { timeout: 10000 });
    await page.fill(searchSelector, 'Perplexity Comet browser');
    console.log('   ✅ Filled search box');

    // Press Enter to search
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    console.log(`   ✅ Search results URL: ${page.url()}`);

    console.log('\n🎉 All tests passed! Comet works with Playwright.');
    console.log('   Browser will stay open for 10 seconds so you can see it...');
    await page.waitForTimeout(10000);

    await context.close();
    console.log('👋 Done, browser closed.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  }
}

main();
