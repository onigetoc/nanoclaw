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

  console.log('1. Bing Homepage...');
  await page.goto('https://www.bing.com', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: './groups/main/bing-nav-1.png',
    fullPage: true,
  });

  console.log('2. Search results...');
  await page.goto('https://www.bing.com/search?q=mini+pc', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: './groups/main/bing-nav-2.png',
    fullPage: true,
  });

  console.log('3. Click first result...');
  try {
    await page.click('h2 a');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: './groups/main/bing-nav-3.png',
      fullPage: true,
    });
  } catch (e) {
    console.log('Could not click first result');
  }

  console.log('Done!');
  await browser.close();
})();
