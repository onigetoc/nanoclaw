/**
 * Navigate and Screenshot
 * Usage: node navigate-and-screenshot.js <url> <output-file> [--full]
 */
import { launchBrowser, resolveOutputPath } from './browser-config.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node navigate-and-screenshot.js <url> <output-file> [--full]');
  process.exit(1);
}

const url = args[0];
const outputFile = args[1];
const fullPage = args.includes('--full');
const outputPath = resolveOutputPath(outputFile);

let context;
try {
  const result = await launchBrowser();
  context = result.context;
  const page = result.page;

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
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
