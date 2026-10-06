import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/** Local diagnostic (not part of the gate). */
const BASE = "http://localhost:4180";

test('update banner flow without session', async ({ page, context }) => {
  const payloads: Buffer[] = [];
  page.on('request', (req) => {
    if (req.url().includes('posthog') && req.method() === 'POST') {
      const b = req.postDataBuffer();
      if (b) payloads.push(b);
    }
  });

  const remoteVersion = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  await context.route('**/version.json*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ version: remoteVersion }),
    });
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const banner = page.getByTestId('app-update-banner');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await banner.getByRole('button', { name: /actualizar aplicaci|update app/i }).click();

  // After the controlled reload the mismatch persists → persistent banner.
  await page.waitForTimeout(9000);
  await expect(page.getByTestId('app-update-banner')).toBeVisible();
  await expect(page.getByTestId('app-update-banner')).toContainText(/no hemos podido actualizar|couldn't update/i);

  const events = payloads.flatMap((buf) => {
    let text: string;
    try {
      text = gunzipSync(buf).toString('utf8');
    } catch {
      text = buf.toString('utf8');
    }
    try {
      const j = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
      return (j.batch ?? [j]) as Record<string, unknown>[];
    } catch {
      return [];
    }
  });
  const names = events.map((e) => e.event);
  console.log('WIRE EVENTS:', JSON.stringify(names, null, 1));
  const requested = events.filter((e) => e.event === 'app_update_requested');
  console.log('app_update_requested on wire:', requested.length);
  if (requested[0]) {
    const props = requested[0].properties as Record<string, unknown>;
    const custom: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props ?? {})) {
      if (!k.startsWith('$')) custom[k] = v;
    }
    console.log('custom props:', JSON.stringify(custom));
  }
  expect(requested.length).toBe(1);
});
