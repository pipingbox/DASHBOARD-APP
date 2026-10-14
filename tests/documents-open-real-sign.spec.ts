import { test, expect, devices, type Page } from '@playwright/test';

/**
 * PB-PROFILE-STABILITY-001 / FASE 1 — REAL integration E2E (no interception).
 *
 * Fernando's defect: clicking "Abrir documento" in Chrome on Windows does
 * NOTHING. Backend probes passed 6/6 (sign, RLS, Storage all fine), so this
 * spec exercises the exact production path end to end in Chromium:
 *
 *   click → synchronous blank popup → REAL createSignedUrl → popup navigates
 *   → Storage serves the object (HTTP 200) → zero JS errors
 *
 * Rules of engagement (ticket):
 * - NOTHING on the Storage sign path is intercepted or mocked in scenarios
 *   A/B/C/D/F. The signed URL is issued by production Supabase Storage.
 * - Only scenario E (error handling) deliberately forces a sign failure to
 *   verify the user-visible error + retry; it is labeled accordingly.
 * - Fixtures: two permanent synthetic E2E accounts (owner + stranger) and
 *   two permanent fixture objects (PDF + PNG) owned by the owner account.
 *   The spec NEVER creates or deletes data — zero residue.
 *
 * Evidence collected per scenario: every console error/warning and
 * pageerror on the profile page during the open flow (a silent pageerror
 * would explain "nothing happens"), plus the real sign response status.
 */

const EMAIL = process.env.DOC_OPEN_E2E_EMAIL;
const PASSWORD = process.env.DOC_OPEN_E2E_PASSWORD;
const OTHER_EMAIL = process.env.DOC_OPEN_E2E_OTHER_EMAIL;
const OTHER_PASSWORD = process.env.DOC_OPEN_E2E_OTHER_PASSWORD;
const ANON_KEY = process.env.DOC_OPEN_E2E_ANON_KEY;
const hasCreds = Boolean(EMAIL && PASSWORD && OTHER_EMAIL && OTHER_PASSWORD && ANON_KEY);

const BUCKET = 'worker-documents';
// Owner account fixtures (created once by the FASE-1 setup, documented in
// the FASE-2 storage inventory as known synthetic E2E fixtures).
const OWNER_ID = '8c628a5d-70e0-4a99-9d6f-53a1741f751b';
const PDF_PATH = `${OWNER_ID}/e2e-fixture-pdf.pdf`;
// The card heading renders file_name (not document_name).
const PDF_NAME = 'e2e-fixture-pdf.pdf';
const PNG_NAME = 'e2e-fixture-png.png';

const SUPABASE_ORIGIN = 'https://mwdauubztjxkbrefirbg.supabase.co';

// Fernando uses desktop Chrome on Windows — desktop viewport is the
// primary target here (the hermetic spec already covers mobile).
test.use({ viewport: { width: 1366, height: 768 }, locale: 'es-ES' });

type JsErrorLog = { console: string[]; pageerrors: string[]; signResponses: number[] };

/** Attach evidence collectors for the whole open flow. */
function collectEvidence(page: Page): JsErrorLog {
  const log: JsErrorLog = { console: [], pageerrors: [], signResponses: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      log.console.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => log.pageerrors.push(String(err)));
  page.on('response', (res) => {
    if (res.url().includes(`/storage/v1/object/sign/${BUCKET}/`) && res.request().method() === 'POST') {
      log.signResponses.push(res.status());
    }
  });
  return log;
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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await page.waitForURL(/\/(dashboard|profile|onboarding)/, { timeout: 30_000 });
}

async function gotoProfileDocuments(page: Page) {
  await page.goto('/profile', { waitUntil: 'networkidle' });
  await expect(page.getByText(PDF_NAME)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(PNG_NAME)).toBeVisible({ timeout: 10_000 });
}

function openAction(page: Page, docName: string) {
  return page
    .locator('div.border.bg-zinc-950', { hasText: docName })
    .locator('button[aria-label="Abrir documento"], a[target="_blank"]');
}

/** Assert the popup landed on a REAL signed URL and Storage served it. */
async function expectRealSignedOpen(page: Page, button: ReturnType<typeof openAction>, log: JsErrorLog, fileName: string) {
  const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
  await button.click();
  const popup = await popupPromise;
  // Real Storage sign → real token in the URL (never intercepted)
  await popup.waitForURL(new RegExp(`/object/sign/${BUCKET}/.*[?&]token=`), { timeout: 20_000 });
  expect(popup.url()).toContain(fileName);
  // Storage actually SERVES the object: the popup document must load 200.
  const served = await popup.waitForResponse(
    (res) => res.url().includes(`/object/sign/${BUCKET}/`) && res.request().method() === 'GET',
    { timeout: 20_000 },
  );
  expect(served.status(), 'Storage must serve the signed object').toBe(200);
  // No silent JS failure on the profile page during the open
  expect(log.pageerrors, 'no pageerror may fire during the open flow').toEqual([]);
  await popup.close();
}

test.describe('PB-PROFILE-STABILITY-001 FASE 1 — real documents-open integration', () => {
  test.skip(!hasCreds, 'DOC_OPEN_E2E_* secrets not configured');

  // SHA-lock: when EXPECTED_APP_VERSION is provided, the served bundle must
  // be exactly that build (prevents testing a stale deploy).
  test.beforeEach(async ({ request }) => {
    const expected = process.env.EXPECTED_APP_VERSION;
    if (!expected) return;
    const res = await request.get('/version.json');
    expect(res.status(), 'version.json must be reachable on the target').toBe(200);
    const body = await res.json();
    expect(body.version, `served bundle must be the tested SHA (got ${body.version}, expected ${expected})`).toBe(expected);
  });

  test('A: FIRST click on PDF opens the real signed URL and Storage serves it (desktop)', async ({ page }) => {
    const log = collectEvidence(page);
    await preparePage(page);
    await login(page, EMAIL!, PASSWORD!);
    await gotoProfileDocuments(page);
    await expectRealSignedOpen(page, openAction(page, PDF_NAME), log, 'e2e-fixture-pdf.pdf');
    console.log('[evidence] sign responses:', log.signResponses, '| console:', log.console, '| pageerrors:', log.pageerrors);
  });

  test('B: FIRST click on PNG image opens the real signed URL and Storage serves it', async ({ page }) => {
    const log = collectEvidence(page);
    await preparePage(page);
    await login(page, EMAIL!, PASSWORD!);
    await gotoProfileDocuments(page);
    await expectRealSignedOpen(page, openAction(page, PNG_NAME), log, 'e2e-fixture-png.png');
    console.log('[evidence] sign responses:', log.signResponses, '| console:', log.console, '| pageerrors:', log.pageerrors);
  });

  test('C: popup blocked (window.open → null) falls back to same-tab navigation with the real signed URL', async ({ page }) => {
    const log = collectEvidence(page);
    await preparePage(page);
    await login(page, EMAIL!, PASSWORD!);
    await gotoProfileDocuments(page);
    // Simulate the browser popup blocker: window.open returns null. This
    // does NOT touch the Storage path — the sign request stays real.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).open = () => null;
    });
    await openAction(page, PDF_NAME).click();
    await page.waitForURL(new RegExp(`/object/sign/${BUCKET}/.*[?&]token=`), { timeout: 20_000 });
    expect(page.url()).toContain('e2e-fixture-pdf.pdf');
    expect(log.pageerrors, 'no pageerror during popup-blocked fallback').toEqual([]);
    console.log('[evidence] sign responses:', log.signResponses, '| console:', log.console, '| pageerrors:', log.pageerrors);
  });

  test('D: a different user CANNOT sign the owner object (RLS/ownership enforced)', async ({ request }) => {
    const loginRes = await request.post(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, {
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY! },
      data: { email: OTHER_EMAIL, password: OTHER_PASSWORD },
    });
    expect(loginRes.ok(), `stranger login must succeed: HTTP ${loginRes.status()}`).toBeTruthy();
    const { access_token: token } = await loginRes.json();
    const signRes = await request.post(`${SUPABASE_ORIGIN}/storage/v1/object/sign/${BUCKET}/${PDF_PATH}`, {
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY!, Authorization: `Bearer ${token}` },
      data: { expiresIn: 60 },
    });
    expect([400, 403, 404]).toContain(signRes.status());
  });

  test('E: sign failure shows a comprehensible error, leaves no dead tab, and RETRY succeeds', async ({ page }) => {
    const log = collectEvidence(page);
    await preparePage(page);
    await login(page, EMAIL!, PASSWORD!);
    await gotoProfileDocuments(page);

    // Force a REAL-path failure once (this is the ONLY intercepted scenario,
    // labeled error-handling rather than integration): Storage sign → 500.
    await page.route(`**/storage/v1/object/sign/${BUCKET}/**`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'forced e2e failure' }) }),
    );
    const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
    await openAction(page, PDF_NAME).click();
    const popup = await popupPromise;
    // The blank tab must be closed, not left dead
    await expect.poll(async () => popup.isClosed(), { timeout: 15_000 }).toBe(true);
    // Comprehensible user-facing error (existing i18n access-denied toast)
    await expect(page.locator('[data-sonner-toast]', { hasText: /denegado|denied|error/i })).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toMatch(/#$/);

    // RETRY with the real backend restored: the same click must now succeed.
    await page.unroute(`**/storage/v1/object/sign/${BUCKET}/**`);
    await expectRealSignedOpen(page, openAction(page, PDF_NAME), log, 'e2e-fixture-pdf.pdf');
    console.log('[evidence] sign responses:', log.signResponses, '| console:', log.console, '| pageerrors:', log.pageerrors);
  });

  test('F (mobile viewport): FIRST click opens the real signed URL', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-ES' });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
        localStorage.setItem('pipingbox_language', 'es');
      } catch { /* noop */ }
    });
    const page = await context.newPage();
    try {
      const log = collectEvidence(page);
      await login(page, EMAIL!, PASSWORD!);
      await gotoProfileDocuments(page);
      await expectRealSignedOpen(page, openAction(page, PDF_NAME), log, 'e2e-fixture-pdf.pdf');
      console.log('[evidence] sign responses:', log.signResponses, '| console:', log.console, '| pageerrors:', log.pageerrors);
    } finally {
      await context.close();
    }
  });
});
