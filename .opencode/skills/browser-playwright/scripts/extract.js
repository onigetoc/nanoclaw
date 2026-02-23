/**
 * Extract text from page elements
 * Usage: node extract.js <url> <selector> [--all] [--attr <name>]
 */
import { launchBrowser } from './browser-config.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node extract.js <url> <selector> [--all] [--attr <name>]');
  process.exit(1);
}

const url = args[0];
const selector = args[1];
const extractAll = args.includes('--all');
const attrIndex = args.indexOf('--attr');
const attrName = attrIndex !== -1 ? args[attrIndex + 1] : null;

let context;
try {
  const result = await launchBrowser();
  context = result.context;
  const page = result.page;

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  console.log(`Extracting from: ${selector}`);

  if (extractAll) {
    const elements = await page.$$(selector);
    if (elements.length === 0) {
      console.log('No elements found');
    } else {
      console.log(`Found ${elements.length} elements:`);
      for (let i = 0; i < elements.length; i++) {
        const value = attrName
          ? await elements[i].getAttribute(attrName)
          : await elements[i].textContent();
        if (value && value.trim()) console.log(`[${i + 1}] ${value.trim()}`);
      }
    }
  } else {
    const element = await page.$(selector);
    if (!element) { console.log('Element not found'); process.exit(1); }
    const value = attrName
      ? await element.getAttribute(attrName)
      : await element.textContent();
    console.log(value ? value.trim() : '');
  }
} catch (err) {
  console.error('✗ Extract failed:', err.message);
  process.exit(1);
} finally {
  if (context) await context.close();
}
