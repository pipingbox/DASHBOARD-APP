import { test, expect, devices, type Page, type Route } from '@playwright/test';

/**
 * PB-GROWTH-GATE-PROFILE-E2E-001 — certifications first-click regression spec.
 *
 * Defect under test (same class as the Fernando DocumentsSection incident,
 * confirmed by audit on main): CertificationsSection rendered
 * `<a href={cert.storageUrl || '#'}>` whose async onClick resolved the signed
 * URL AFTER the browser had already acted on href="#" — first click dead,
 * file only on the second click.
 *
 * Fix under test: `openCertificateFile` -> shared popup-safe
 * `openSecureFileInNewTab` helper (blank tab synchronously inside the user
 * gesture, deferred navigation to a FRESH signed URL, per-cert pending
 * dedupe, popup-blocker same-tab fallback).
 *
 * Hermetic harness (authorized QA account, ZERO DB writes):
 * - `app_worker_certifications` GET is intercepted with two SYNTHETIC rows
 *   (PDF + PNG). No real certification rows are read or written.
 * - The Storage `object/sign` POST is intercepted with a DELAYED synthetic
 *   signed URL — exactly what proves deferred navigation.
 *
 * Scenarios (ticket test matrix F–J, L–M for certifications):
 * A. first click on PDF opens the signed URL (mobile + desktop viewports)
 * B. first click on image opens the signed URL
 * C. signed URL failure: no dead blank tab, access-denied toast, no '#'
 * D. rapid double-click: one sign request, one tab
 * E. popup blocked (window.open → null): same-tab navigation after resolve
 * F. canonical storage_path is signed, NOT the legacy file_url
 */

test.use({ ...devices['Pixel 5'], locale: 'es-ES' });

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const JSON_HEADERS = { 'content-type': 'application/json' };
const SIGN_DELAY_MS = 900;

const CERTS_TABLE = 'app_worker_certifications';
const BUCKET = 'certificates';

const SYNTHETIC_CERTS = [
  {
    id: 'qa-synthetic-cert-001',
    user_id: 'qa-synthetic-owner',
    name: 'QA Synthetic VCA VOL',
    issuer: 'QA Authority',
    issue_date: '2026-01-15',
    expiry_date: '2030-01-15',
    credential_id: null,
    file_url: null,
    certificate_file_url: null,
    storage_bucket: BUCKET,
    // Canonical storage path (preferred source, scenario F)
    storage_path: 'qa-synthetic-owner/cert-qa-001.pdf',
    is_visible: true,
    notes: null,
    created_at: '2026-10-08T06:00:00.000Z',
  },
  {
    id: 'qa-synthetic-cert-002',
    user_id: 'qa-synthetic-owner',
    name: 'QA Synthetic Flange Card',
    issuer: 'QA Authority',
    issue_date: '2026-02-10',
    expiry_date: null,
    credential_id: null,
    // Legacy URL present on purpose: storage_path must win (scenario F)
    file_url:
      'https://legacy.supabase.co/storage/v1/object/public/legacy-bucket/legacy-path/old-cert.png',
    certificate_file_url: null,
    storage_bucket: BUCKET,
    storage_path: 'qa-synthetic-owner/cert-qa-002.png',
    is_visible: true,
    notes: null,
    created_at: '2026-10-08T06:01:00.000Z',
  },
];

async function interceptCertifications(page: Page) {
  await page.route(`**/rest/v1/${CERTS_TABLE}*`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(SYNTHETIC_CERTS),
    });
  });
}

type SignBehavior = { fail?: boolean; delayMs?: number };

async function interceptSign(page: Page, behavior: SignBehavior = {}) {
  const state = { requests: 0, paths: [] as string[] };
  const delayMs = behavior.delayMs ?? SIGN_DELAY_MS;
  await page.route('**/storage/v1/object/sign/**', async (route: Route) => {
    state.requests += 1;
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname.split(`/object/sign/${BUCKET}/`)[1] ?? '');
    state.paths.push(path);
    if (behavior.fail) {
      await route.fulfill({ status: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'qa synthetic sign failure' }) });
      return;
    }
    const signedURL = `/storage/v1/object/sign/${BUCKET}/${path}?token=qa-synthetic-token`;
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ signedURL }) });
  });
  return state;
}

function preparePage(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem('pipingbox_beta_dismissed', 'true');
      localStorage.setItem('pipingbox_language', 'es');
    } catch {
      /* noop */
    }
  });
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function gotoProfileCertifications(page: Page) {
  await page.goto('/profile', { waitUntil: 'networkidle' });
  await expect(page.getByText('QA Synthetic VCA VOL')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('QA Synthetic Flange Card')).toBeVisible();
}

/**
 * Version-agnostic open-action locator: the fixed build renders
 * `button[aria-label]`; the defective build rendered `a[target="_blank"]`
 * inside the same card.
 */
function openAction(page: Page, certName: string) {
  return page
    .locator('div.border', { hasText: certName })
    .locator('button[aria-label], a[target="_blank"]')
    .first();
}

test.describe('PB-GROWTH-GATE-PROFILE-E2E-001 certifications first-click', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not configured');

  test.beforeEach(async ({ request }) => {
    const expected = process.env.EXPECTED_APP_VERSION;
    if (!expected) return;
    const res = await request.get('/version.json');
    expect(res.status(), 'version.json must be reachable on the target').toBe(200);
    const body = await res.json();
    expect(
      body.version,
      `served bundle must be the tested SHA (got ${body.version}, expected ${expected})`,
    ).toBe(expected);
  });

  test('A+B+D+F (mobile): first click opens PDF and image; double-click does not duplicate; storage_path preferred', async ({ page }) => {
    await interceptCertifications(page);
    const sign = await interceptSign(page, { delayMs: SIGN_DELAY_MS });
    await preparePage(page);
    await login(page);
    await gotoProfileCertifications(page);

    // ── Scenario A: FIRST click on the PDF ──
    const pdfButton = openAction(page, 'QA Synthetic VCA VOL');
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.click();
    const popup = await popupPromise;
    await popup.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    expect(popup.url()).toContain('/object/sign/certificates/qa-synthetic-owner/cert-qa-001.pdf');
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(sign.requests, 'exactly one sign request for the PDF').toBe(1);

    // ── Scenario B: FIRST click on the image ──
    const imageButton = openAction(page, 'QA Synthetic Flange Card');
    const popup2Promise = page.waitForEvent('popup', { timeout: 10_000 });
    await imageButton.click();
    const popup2 = await popup2Promise;
    await popup2.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    expect(popup2.url()).toContain('/object/sign/certificates/qa-synthetic-owner/cert-qa-002.png');
    // ── Scenario F: the canonical storage_path was signed, NOT the legacy URL
    expect(sign.paths[1]).toBe('qa-synthetic-owner/cert-qa-002.png');
    expect(sign.paths.join(' ')).not.toContain('legacy-path');

    // ── Scenario D: rapid double-click fires ONE sign request and ONE tab ──
    const before = sign.requests;
    const pagesBefore = page.context().pages().length;
    const popup3Promise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.dblclick();
    const popup3 = await popup3Promise;
    await popup3.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    await page.waitForTimeout(SIGN_DELAY_MS + 500);
    expect(sign.requests, 'double-click must not duplicate the sign request').toBe(before + 1);
    expect(
      page.context().pages().length - pagesBefore,
      'double-click must open exactly ONE additional tab',
    ).toBe(1);
  });

  test('C+E (mobile): sign failure leaves no dead tab and shows toast; popup blocked falls back to same-tab', async ({ page }) => {
    await interceptCertifications(page);

    // ── Scenario C: signed URL failure ──
    const signFail = await interceptSign(page, { fail: true });
    await preparePage(page);
    await login(page);
    await gotoProfileCertifications(page);

    const pdfButton = openAction(page, 'QA Synthetic VCA VOL');
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.click();
    const popup = await popupPromise;
    await expect
      .poll(async () => popup.isClosed(), { timeout: 10_000 })
      .toBe(true);
    await expect(page.locator('[data-sonner-toast]', { hasText: /denegado|denied/i })).toBeVisible({ timeout: 10_000 });
    expect(page.url()).not.toMatch(/#$/);
    expect(signFail.requests).toBe(1);

    // ── Scenario E: popup blocked (window.open returns null) ──
    await page.unroute('**/storage/v1/object/sign/**');
    await interceptSign(page, { delayMs: SIGN_DELAY_MS });
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).open = () => null;
    });
    const imageButton = openAction(page, 'QA Synthetic Flange Card');
    await imageButton.click();
    await page.waitForURL(/token=qa-synthetic-token/, { timeout: 15_000 });
    expect(page.url()).toContain('/object/sign/certificates/qa-synthetic-owner/cert-qa-002.png');
  });

  test('A (desktop viewport): first click on PDF opens the signed URL', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'es-ES',
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
        localStorage.setItem('pipingbox_language', 'es');
      } catch { /* noop */ }
    });
    const page = await context.newPage();
    await interceptCertifications(page);
    await interceptSign(page, { delayMs: SIGN_DELAY_MS });
    await login(page);
    await gotoProfileCertifications(page);

    const pdfButton = openAction(page, 'QA Synthetic VCA VOL');
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.click();
    const popup = await popupPromise;
    await popup.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    expect(popup.url()).toContain('/object/sign/certificates/qa-synthetic-owner/cert-qa-001.pdf');
    await context.close();
  });
});
