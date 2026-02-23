/**
 * Search and Screenshot
 * Usage: node search-and-screenshot.js <url> <input-selector> <search-text> <button-selector> <output-file> [--full]
 */
import { launchBrowser, resolveOutputPath } from './browser-config.js';

const args = process.argv.slice(2);
if (args.length < 5) {
  console.error('Usage: node search-and-screenshot.js <url> <input-selector> <search-text> <button-selector> <output-file>');
  process.exit(1);
}

const [url, inputSelector, searchText, buttonSelector, outputFile] = args;
const fullPage = args.includes('--full');
const outputPath = resolveOutputPath(outputFile);

let context;
try {
  const result = await launchBrowser();
  context = result.context;
  const page = result.page;

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  console.log(`Filling: "${searchText}" into ${inputSelector}`);
  await page.waitForSelector(inputSelector, { timeout: 10000 });
  await page.fill(inputSelector, searchText);

  console.log(`Clicking: ${buttonSelector}`);
  await page.click(buttonSelector);

  console.log('Waiting for results...');
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(1500);

  console.log(`Taking screenshot: ${outputPath}`);
  await page.screenshot({ path: outputPath, fullPage });

  console.log(`✓ Done! Screenshot saved: ${outputPath}`);
} catch (err) {
  console.error('✗ Failed:', err.message);
  process.exit(1);
} finally {
  if (context) await context.close();
}
