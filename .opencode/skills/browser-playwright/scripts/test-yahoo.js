const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  console.log('Going to Yahoo...');
  await page.goto('https://www.yahoo.com', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  console.log('Looking for search input...');
  try {
    const searchInput = await page.waitForSelector('#yschsp', {
      timeout: 5000,
    });
    console.log('Found input, typing search...');
    await searchInput.fill('openclaw');
    await page.keyboard.press('Enter');
  } catch (e) {
    console.log('Input not found with primary selector');
  }

  await page.waitForTimeout(3000);

  const outputPath = './groups/main/yahoo-search.png';
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log('Screenshot saved');

  await browser.close();
})();
