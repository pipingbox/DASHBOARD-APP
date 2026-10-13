import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const hasCreds = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

async function login(page: any) {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

function makeMinimalPDF(): Buffer {
  const pdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n109\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

test.describe('CV upload smoke test (instrumented copy)', () => {
  test.skip(!hasCreds, 'no creds');

  test('uploads a CV, persists storage metadata, refreshes UI, then removes it', async ({ page }) => {
    test.setTimeout(120_000);
    page.on('console', (msg) => {
      const t = msg.text();
      if (/auth|session|PROFILE|config|REFERRAL|Error/i.test(t)) console.log('[BROWSER]', t.slice(0, 160));
    });
    page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));

    await page.addInitScript(() => {
      try { localStorage.setItem('pipingbox_beta_dismissed', 'true'); } catch { /* noop */ }
      // Trace all sb-* storage access and lock acquisitions
      const _get = Storage.prototype.getItem;
      const _set = Storage.prototype.setItem;
      const _rm = Storage.prototype.removeItem;
      const tag = () => performance.now().toFixed(0);
      Storage.prototype.getItem = function (k: string) {
        const v = _get.call(this, k);
        if (String(k).includes('sb-')) console.log(`[LS ${tag()}] GET ${k} -> ${v === null ? 'null' : 'len ' + v.length}`);
        return v;
      };
      Storage.prototype.setItem = function (k: string, v: string) {
        if (String(k).includes('sb-')) console.log(`[LS ${tag()}] SET ${k} len ${v.length}`);
        return _set.call(this, k, v);
      };
      Storage.prototype.removeItem = function (k: string) {
        if (String(k).includes('sb-')) console.log(`[LS ${tag()}] REMOVE ${k}`);
        return _rm.call(this, k);
      };
      const _locks = navigator.locks.request.bind(navigator.locks);
      (navigator.locks as any).request = (...args: any[]) => {
        console.log(`[LOCK ${tag()}] request ${String(args[0])}`);
        return _locks(...args);
      };
    });

    await login(page);
    await page.goto('/profile');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });

    const cvSection = page.locator('section').filter({ hasText: /^CV\s*\/\s*Resume/i });
    await expect(cvSection).toBeVisible({ timeout: 10_000 });

    const uniqueId = Date.now();
    const fileName = `cv-smoke-${uniqueId}.pdf`;
    const fileInput = cvSection.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: makeMinimalPDF() });
    await expect(cvSection.getByText(fileName)).toBeVisible({ timeout: 30_000 });

    // View button + popup + signed navigation (exactly like the original test)
    const viewButton = cvSection.getByRole('button', { name: /view|ver/i }).first();
    await expect(viewButton).toBeVisible({ timeout: 10_000 });
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    const signedNavPromise = page.context().waitForEvent(
      'request',
      (r) => r.url().includes('/object/sign/') && /[?&]token=/.test(r.url()),
      { timeout: 15_000 },
    );
    await viewButton.click();
    const popup = await popupPromise;
    const signedNav = await signedNavPromise;
    expect(signedNav.url()).not.toMatch(/\/object\/public\//);
    console.log('[DEBUG] popup url:', popup.url().slice(0, 100));
    await popup.close().catch(() => {});
    const sb2 = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.includes('sb-')) return { key: k, len: (localStorage.getItem(k) || '').length };
      return null;
    });
    console.log('[DEBUG] sb entry AFTER popup.close:', sb2);

    console.log('[DEBUG] before reload, url =', page.url());
    await page.reload({ waitUntil: 'domcontentloaded' });
    const lockProbeEarly = await page.evaluate(async () => {
      const lockName = 'sb:uqfbilyfpflrlthnyijj.auth.lock';
      try {
        const result = await Promise.race([
          navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => (lock ? 'ACQUIRED' : 'HELD_BY_OTHER')),
          new Promise((r) => setTimeout(() => r('TIMEOUT_3S'), 3000)),
        ]);
        return result as string;
      } catch (e) {
        return 'ERROR: ' + String(e);
      }
    });
    console.log('[DEBUG] lock probe IMMEDIATELY after reload:', lockProbeEarly);
    console.log('[DEBUG] after reload, url =', page.url());
    await expect(page).toHaveURL(/\/profile/, { timeout: 10_000 });
    const ls = await page.evaluate(() => Object.keys(localStorage));
    console.log('[DEBUG] localStorage after reload:', ls);
    const sb = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.includes('sb-')) return { key: k, len: (localStorage.getItem(k) || '').length };
      return null;
    });
    console.log('[DEBUG] sb entry:', sb);
    try {
      await expect(cvSection.getByText(fileName)).toBeVisible({ timeout: 10_000 });
      console.log('[DEBUG] fileName visible after reload: TRUE');
    } catch {
      console.log('[DEBUG] fileName visible after reload: FALSE');
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log('[DEBUG] BODY:', JSON.stringify(bodyText));
      const lockProbe = await page.evaluate(async () => {
        const lockName = 'sb:uqfbilyfpflrlthnyijj.auth.lock';
        try {
          const result = await Promise.race([
            navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => (lock ? 'ACQUIRED' : 'HELD_BY_OTHER')),
            new Promise((r) => setTimeout(() => r('TIMEOUT_2S'), 2000)),
          ]);
          return result as string;
        } catch (e) {
          return 'ERROR: ' + String(e);
        }
      });
      console.log('[DEBUG] supabase auth lock probe:', lockProbe);
      const urlNow = page.url();
      console.log('[DEBUG] url at failure:', urlNow);
      throw new Error('instrumented failure');
    }
  });
});