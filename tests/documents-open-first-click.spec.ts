import { test, expect, devices, type Page, type Route } from '@playwright/test';

/**
 * PB-PROFILE-DOCUMENT-OPEN-FIRST-CLICK-001 — regression spec.
 *
 * Production defect (confirmed): the open action in DocumentsSection was an
 * `<a href={doc.storageUrl || '#'}>` whose async onClick resolved the signed
 * URL AFTER the browser had already acted on href="#". The signed URL request
 * returned 200 (Storage + RLS were fine) but the first click opened a dead
 * tab — the document only appeared on the second click, once state had
 * re-rendered the anchor.
 *
 * Fix under test: a <button type="button"> that opens a blank tab
 * synchronously inside the user gesture, then resolves the signed URL and
 * navigates that tab (popup-blocker safe; opener severed manually). On
 * failure the blank tab is closed and the existing access-denied toast is
 * shown. Per-document pending state prevents duplicate tabs/requests.
 *
 * Hermetic harness (authorized QA account, ZERO DB writes):
 * - `app_worker_documents` GET is intercepted with two SYNTHETIC rows
 *   (PDF + PNG). No real document rows are read or written.
 * - The Storage `object/sign` POST is intercepted with a DELAYED synthetic
 *   signed URL, which is exactly what proves deferred navigation: if the
 *   component navigated before resolution (the old defect), the popup would
 *   sit on about:blank / '#' forever.
 *
 * Scenarios (ticket phases 1 & 5):
 * A. first click on PDF opens the signed URL (mobile + desktop viewports)
 * B. first click on image opens the signed URL
 * C. signed URL failure: no dead blank tab, access-denied toast, no '#'
 * D. rapid double-click: one sign request, one tab
 * E. popup blocked (window.open → null): same-tab navigation after resolve
 * F. listing prefers storage_path over legacy file_url
 */

test.use({ ...devices['Pixel 5'], locale: 'es-ES' });

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const JSON_HEADERS = { 'content-type': 'application/json' };
const SIGN_DELAY_MS = 900;

const DOCS_TABLE = 'app_worker_documents';
const BUCKET = 'worker-documents';

const SYNTHETIC_DOCS = [
  {
    id: 'qa-synthetic-doc-001',
    user_id: 'qa-synthetic-owner',
    document_type: 'training_certificate',
    document_category: 'certification',
    file_name: 'QA Synthetic Certificate.pdf',
    file_url: null,
    storage_bucket: BUCKET,
    // Canonical storage path (preferred source, scenario F)
    storage_path: 'qa-synthetic-owner/doc-qa-001.pdf',
    file_size: 12345,
    mime_type: 'application/pdf',
    notes: null,
    expires_at: null,
    verified: false,
    is_visible: true,
    created_at: '2026-10-08T06:00:00.000Z',
  },
  {
    id: 'qa-synthetic-doc-002',
    user_id: 'qa-synthetic-owner',
    document_type: 'safety_card',
    document_category: 'certification',
    file_name: 'QA Synthetic Safety Card.png',
    // Legacy URL present on purpose: storage_path must win (scenario F)
    file_url:
      'https://legacy.supabase.co/storage/v1/object/public/legacy-bucket/legacy-path/old-card.png',
    storage_bucket: BUCKET,
    storage_path: 'qa-synthetic-owner/doc-qa-002.png',
    file_size: 23456,
    mime_type: 'image/png',
    notes: null,
    expires_at: null,
    verified: false,
    is_visible: true,
    created_at: '2026-10-08T06:01:00.000Z',
  },
];

/** Intercept the documents list with the synthetic rows (hermetic read). */
async function interceptDocuments(page: Page) {
  await page.route(`**/rest/v1/${DOCS_TABLE}*`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(SYNTHETIC_DOCS),
    });
  });
}

type SignBehavior = { fail?: boolean; delayMs?: number };

/**
 * Intercept the Storage signed-URL endpoint. Counts requests and can delay
 * or fail the response. The synthetic signedURL is relative, exactly like
 * the real Storage API response (`{ "signedURL": "/object/sign/..." }`).
 */
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

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function gotoProfileDocuments(page: Page) {
  await page.goto('/profile', { waitUntil: 'networkidle' });
  await expect(page.getByText('QA Synthetic Certificate.pdf')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('QA Synthetic Safety Card.png')).toBeVisible();
}

/**
 * Version-agnostic open-action locator: the fixed build renders
 * `button[aria-label]`; the defective build rendered `a[target="_blank"]`
 * inside the same card. Resolving by card keeps the spec meaningful for
 * both, so the same spec PROVES the defect on the old bundle (popup never
 * navigates past '#') and the fix on the new one.
 */
function openAction(page: Page, docName: string) {
  return page
    .locator('div.border.bg-zinc-950', { hasText: docName })
    .locator('button[aria-label="Abrir documento"], a[target="_blank"]');
}

test.describe('PB-PROFILE-DOCUMENT-OPEN-FIRST-CLICK-001', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not configured');

  // SHA-lock pre-flight: the deployed Worker must be serving exactly the
  // build under test (read from /version.json, written at build time).
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
    await interceptDocuments(page);
    const sign = await interceptSign(page, { delayMs: SIGN_DELAY_MS });
    await login(page);
    await gotoProfileDocuments(page);

    // ── Scenario A: FIRST click on the PDF ──
    const pdfButton = openAction(page, 'QA Synthetic Certificate.pdf');
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.click();
    const popup = await popupPromise;
    // The signed URL resolves AFTER the click (delayed route): the popup must
    // still navigate to it. This is the exact assertion the old <a href="#">
    // defect fails (tab stays on about:blank).
    await popup.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    expect(popup.url()).toContain('/object/sign/worker-documents/qa-synthetic-owner/doc-qa-001.pdf');
    // Opener severed manually (noopener-equivalent, handle kept): the JS
    // window.opener property INSIDE the popup must be null.
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(sign.requests, 'exactly one sign request for the PDF').toBe(1);

    // ── Scenario B: FIRST click on the image ──
    const imageButton = openAction(page, 'QA Synthetic Safety Card.png');
    const popup2Promise = page.waitForEvent('popup', { timeout: 10_000 });
    await imageButton.click();
    const popup2 = await popup2Promise;
    await popup2.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    expect(popup2.url()).toContain('/object/sign/worker-documents/qa-synthetic-owner/doc-qa-002.png');
    // ── Scenario F: the canonical storage_path was signed, NOT the legacy URL
    expect(sign.paths[1]).toBe('qa-synthetic-owner/doc-qa-002.png');
    expect(sign.paths.join(' ')).not.toContain('legacy-path');

    // ── Scenario D: rapid double-click fires ONE sign request and ONE tab ──
    const before = sign.requests;
    const popup3Promise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.dblclick();
    const popup3 = await popup3Promise;
    await popup3.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
    // wait out the delayed route to make sure no second request lands
    await page.waitForTimeout(SIGN_DELAY_MS + 500);
    expect(sign.requests, 'double-click must not duplicate the sign request').toBe(before + 1);
    const popups = [popup, popup2, popup3];
    expect(popups.filter((p) => !p.isClosed()).length, 'exactly one live tab for the double-click').toBe(1);
  });

  test('C+E (mobile): sign failure leaves no dead tab and shows toast; popup blocked falls back to same-tab', async ({ page }) => {
    await interceptDocuments(page);

    // ── Scenario C: signed URL failure ──
    const signFail = await interceptSign(page, { fail: true });
    await login(page);
    await gotoProfileDocuments(page);

    const pdfButton = openAction(page, 'QA Synthetic Certificate.pdf');
    const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
    await pdfButton.click();
    const popup = await popupPromise;
    // The blank tab must be CLOSED, not left dead
    await expect
      .poll(async () => popup.isClosed(), { timeout: 10_000 })
      .toBe(true);
    // Access-denied toast (existing i18n key, es locale)
    await expect(page.locator('[data-sonner-toast]', { hasText: /denegado|denied/i })).toBeVisible({ timeout: 10_000 });
    // No '#' navigation on the main page
    expect(page.url()).not.toMatch(/#$/);
    expect(signFail.requests).toBe(1);

    // ── Scenario E: popup blocked (window.open returns null) ──
    await page.unroute('**/storage/v1/object/sign/**');
    await interceptSign(page, { delayMs: SIGN_DELAY_MS });
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).open = () => null;
    });
    const imageButton = openAction(page, 'QA Synthetic Safety Card.png');
    await imageButton.click();
    // Fallback: same-tab navigation AFTER the URL exists
    await page.waitForURL(/token=qa-synthetic-token/, { timeout: 15_000 });
    expect(page.url()).toContain('/object/sign/worker-documents/qa-synthetic-owner/doc-qa-002.png');
  });

  test('A (desktop viewport): first click on PDF opens the signed URL', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'es-ES',
    });
    const page = await context.newPage();
    try {
      await interceptDocuments(page);
      const sign = await interceptSign(page, { delayMs: SIGN_DELAY_MS });
      await login(page);
      await gotoProfileDocuments(page);

      const pdfButton = openAction(page, 'QA Synthetic Certificate.pdf');
      const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
      await pdfButton.click();
      const popup = await popupPromise;
      await popup.waitForURL(/token=qa-synthetic-token/, { timeout: 10_000 });
      expect(popup.url()).toContain('doc-qa-001.pdf');
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      expect(sign.requests).toBe(1);
    } finally {
      await context.close();
    }
  });
});
