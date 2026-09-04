import { test, expect, type Page } from '@playwright/test';

/**
 * Permanent browser smoke test for PipingBox deployments (Cloudflare Workers
 * preview and, later, production). Curl/HTTP-only checks are NOT sufficient:
 * they confirm the Worker served bytes, not that React actually booted in
 * the browser. This suite fails the pipeline if the app renders blank due
 * to a runtime/bootstrap exception (e.g. missing VITE_* build-time env
 * vars), even though every asset returns HTTP 200.
 */

async function assertNoBlankBoot(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);

  // #root must contain rendered content, not be empty.
  const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
  expect(rootHtml.trim().length, `#root is empty on ${path} -- app did not mount`).toBeGreaterThan(0);

  // No uncaught JS exceptions during bootstrap.
  const bootErrors = errors.filter((e) => !e.includes('routes-scanner'));
  expect(bootErrors, `Uncaught JS errors on ${path}:\n${bootErrors.join('\n')}`).toEqual([]);

  return { rootHtml };
}

test.describe('Preview browser smoke test', () => {
  test('root: #root renders and no uncaught exceptions', async ({ page }) => {
    await assertNoBlankBoot(page, '/');
  });

  test('landing i18n renders in Spanish on mobile without object-to-string error', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoBlankBoot(page, '/?lng=es');

    const body = await page.locator('body').innerText();
    expect(body).toContain('La plataforma del sector industrial europeo');
    expect(body).toContain('Para Trabajadores');
    expect(body).toContain('Para Empresas');
    expect(body).toContain('Preguntas frecuentes');
    expect(body).toContain('¿Listo para empezar?');
    expect(body).not.toContain('returned an object instead of string');
  });

  test('landing i18n renders in English on mobile without object-to-string error', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoBlankBoot(page, '/?lng=en');

    const body = await page.locator('body').innerText();
    expect(body).toContain('The European industrial sector platform');
    expect(body).toContain('For Workers');
    expect(body).toContain('For Companies');
    expect(body).toContain('Frequently asked questions');
    expect(body).toContain('Ready to get started?');
    expect(body).not.toContain('returned an object instead of string');
  });

  test('login page is visible', async ({ page }) => {
    await assertNoBlankBoot(page, '/login');
    await expect(page.getByRole('button', { name: /iniciar sesi|log in|sign in/i }).first()).toBeVisible({ timeout: 10_000 }).catch(async () => {
      // Fallback: at minimum an email/password input must exist.
      await expect(page.locator('input[type="email"], input[type="password"]').first()).toBeVisible();
    });
  });

  test('/tools renders content', async ({ page }) => {
    const { rootHtml } = await assertNoBlankBoot(page, '/tools');
    expect(rootHtml.length).toBeGreaterThan(200);
  });

  test('/academy renders content', async ({ page }) => {
    const { rootHtml } = await assertNoBlankBoot(page, '/academy');
    expect(rootHtml.length).toBeGreaterThan(200);
  });

  test('/companies renders content', async ({ page }) => {
    const { rootHtml } = await assertNoBlankBoot(page, '/companies');
    expect(rootHtml.length).toBeGreaterThan(200);
  });

  test('deep-link + hard refresh works (SPA fallback)', async ({ page }) => {
    await assertNoBlankBoot(page, '/tools');
    // Hard refresh (full navigation), not client-side routing.
    await assertNoBlankBoot(page, '/tools');
  });
});
