/**
 * Automated visual QA screenshots from the Cloudflare preview.
 *
 * Opens the Stud Bolts tool, dismisses the beta modal, and captures
 * desktop + mobile screenshots for the requested cases.
 */

import { chromium, devices } from 'playwright';
import { mkdir } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://pipingbox-app.pipingbox.workers.dev/tools?active=bolts-nuts';
const OUT_DIR = join(__dirname, '..', '..', '..', 'screenshots', 'preview-qa');

const cases = [
  { name: 'nps2-class150-rf', params: '' }, // default is NPS 2 Class 150 RF
  { name: 'nps2-class150-rtj', params: '&nps=2%22&class=150&facing=RTJ' },
  { name: 'class400-nps2-rf', params: '&nps=2%22&class=400&facing=RF' },
  { name: 'nps3-5-class150-rf', params: '&nps=3-1%2F2%22&class=150&facing=RF' },
  { name: 'nps5-class150-rf', params: '&nps=5%22&class=150&facing=RF' },
  { name: 'nps22-class300-rf', params: '&nps=22%22&class=300&facing=RF' },
  { name: 'unsupported-nps14-class2500', params: '&nps=14%22&class=2500&facing=RF' },
];

async function capture(page, url, name, deviceLabel) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Try to dismiss beta modal
  const continueBtn = page.locator('button:has-text("Continue")');
  try {
    await continueBtn.click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch {
    // modal may not be present
  }

  const path = join(OUT_DIR, `${name}-${deviceLabel}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('Captured', path);
}

async function run() {
  mkdir(OUT_DIR, { recursive: true }, () => {});

  const browser = await chromium.launch();

  // Desktop
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  for (const c of cases) {
    await capture(desktopPage, `${BASE_URL}${c.params}`, c.name, 'desktop');
  }
  await desktopContext.close();

  // Mobile
  const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
  const mobilePage = await mobileContext.newPage();
  for (const c of cases) {
    await capture(mobilePage, `${BASE_URL}${c.params}`, c.name, 'mobile');
  }
  await mobileContext.close();

  await browser.close();
  console.log('Done. Output:', OUT_DIR);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
