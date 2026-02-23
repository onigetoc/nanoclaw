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
  await page.goto('https://ca.yahoo.com', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  // Handle consent if present
  console.log('Checking for consent popup...');
  const acceptBtn = await page.$(
    'button[name="agree"], button[data-th="agree"], button:has-text("Accept")',
  );
  if (acceptBtn) {
    console.log('Clicking accept...');
    await acceptBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('Looking for search input...');
  const searchInput = await page.$('#yschsp');
  if (searchInput) {
    console.log('Found search input, clicking and typing...');
    await searchInput.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('openclaw', { delay: 50 });
    await page.keyboard.press('Enter');
  } else {
    console.log('Input not found, trying Enter directly...');
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(3000);

  const outputPath = './groups/main/yahoo-search.png';
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log('Screenshot saved');

  await browser.close();
})();
