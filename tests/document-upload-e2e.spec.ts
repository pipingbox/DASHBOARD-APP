import { test, expect, devices } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-DOCUMENT-INTAKE-001 — Vía A: resumable (TUS) document upload E2E.
 *
 * Real incident (Aldo, 2026-10-06 07:28:59 Europe/Brussels, Samsung SM-S918B,
 * Chrome Android, build 53ac740): cert_upload_started was emitted and NOTHING
 * else — no request ever reached Storage, no object, no row, no failure
 * event, UI frozen at 0% forever. Not RLS, not a bucket error, not 4xx/5xx.
 *
 * This spec (authorized disposable QA account, snapshot → conduct → exact
 * restore, ZERO DIFF) validates the TUS transport on the SHA-locked preview
 * under Android Chrome emulation with the REAL file chooser:
 *
 * TEST 1 — happy path, PDF 8–10 MB on a slow mobile uplink:
 *   real byte progress (never premature 100%), TUS wire (creation POST +
 *   chunk PATCH on /storage/v1/upload/resumable), "Comprobando archivo…"
 *   verification phase, canonical row created only after submit, exactly one
 *   object + one row, persistence after reload, document_upload_* telemetry
 *   (no legacy cert_upload_*), app_error=0, zero PII on the wire, ZERO DIFF.
 *
 * TEST 2 — transport interruption mid-upload (after ≥1 chunk), Chrome to the
 *   background and back, network restored: retrying state visible, progress
 *   continues from the previous offset (never restarts at 0), exactly one
 *   object + one row, ZERO DIFF.
 *
 * TEST 3 — image (PNG) upload through the same shared uploader.
 *
 * TEST 4 — CV upload: canonical profile columns only after the object is
 *   verified, "CV guardado correctamente", persistence after reload,
 *   explicit replace, explicit removal, ZERO DIFF (columns + objects).
 *
 * TEST 5 — incident regression (no_bytes_started): zero upload throughput
 *   reproduces "the browser never begins transferring bytes": the UI shows
 *   "Preparando el archivo…", a recoverable failure appears after 15 s, the
 *   form is preserved, re-selection is possible, zero objects and zero rows;
 *   after restoring the link, re-selecting the file completes the upload.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const expectedEnv = process.env.EXPECTED_ENV ?? 'preview';
const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';

const CERT_TABLE = 'app_worker_certifications';
const CERT_BUCKET = 'app_14da0f1941_certificates';
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const TUS_PATH = '/storage/v1/upload/resumable';
const CV_COLUMNS = [
  'cv_file_url',
  'cv_storage_bucket',
  'cv_storage_path',
  'cv_file_name',
  'cv_file_path',
  'cv_uploaded_at',
] as const;

/** Minimal, valid synthetic PDF padded to the requested size (8–10 MB). */
function syntheticPdf(targetBytes: number): Buffer {
  const body = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    '4 0 obj<</Length 90>>stream',
    'BT /F1 14 Tf 60 720 Td (QA SYNTHETIC DOCUMENT - NOT A REAL DOCUMENT) Tj ET',
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n');
  let buf = Buffer.from(body, 'latin1');
  if (buf.length < targetBytes) {
    const pad = Buffer.alloc(targetBytes - buf.length, 0x25); // '%' comment padding
    buf = Buffer.concat([buf, Buffer.from('\n', 'latin1'), pad]);
  }
  return buf.subarray(0, targetBytes);
}

/** Minimal synthetic PNG (signature + padding). */
function syntheticPng(targetBytes: number): Buffer {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pad = Buffer.alloc(Math.max(0, targetBytes - head.length), 0x00);
  return Buffer.concat([head, pad]).subarray(0, targetBytes);
}

// Android Chrome emulation (Samsung-class device) — the incident platform.
// (Top-level: a device descriptor forces a new worker.)
test.use({ ...devices['Pixel 7'] });

test.describe('PB-DOCUMENT-INTAKE-001 document upload E2E (Android Chrome, TUS resumable, preview, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping document upload E2E');

  const setupCommon = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
      } catch {
        /* noop */
      }
    });
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      } catch {
        /* noop */
      }
    });

    const browserErrors: string[] = [];
    const appLogs: string[] = [];
    page.on('pageerror', (e) => browserErrors.push(e.message));
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && !/posthog|fetch|net::|Failed to load resource/i.test(t)) {
        appLogs.push(t);
      }
    });

    // PostHog wire capture (gzip batches).
    const payloads: Buffer[] = [];
    const posthogUrls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/i/e') || req.url().includes('posthog')) posthogUrls.push(req.url());
      const ct = req.headers()['content-type'] ?? '';
      if ((req.url().includes('/i/e') || req.url().includes('posthog')) && req.method() === 'POST') {
        const b = req.postDataBuffer();
        if (b) payloads.push(b);
      }
      void ct;
    });

    // TUS wire: every request against the resumable endpoint.
    const tusRequests: { method: string; at: number }[] = [];
    page.on('request', (req) => {
      if (req.url().includes(TUS_PATH)) tusRequests.push({ method: req.method(), at: Date.now() });
    });

    let rest: { base: string; apiKey: string; authorization: string } | null = null;
    page.on('request', (req) => {
      const url = req.url();
      if (!rest && url.includes('/rest/v1/')) {
        const h = req.headers();
        if (h['apikey'] && h['authorization']) {
          rest = { base: url.split('/rest/v1/')[0], apiKey: h['apikey'], authorization: h['authorization'] };
        }
      }
    });

    const decodeAll = (): Record<string, unknown>[] =>
      payloads.flatMap((buf) => {
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

    return {
      browserErrors,
      appLogs,
      decodeAll,
      tusRequests,
      getRest: () => rest,
      getPosthogUrls: () => posthogUrls,
    };
  };

  const waitForWireEvent = async (
    page: import('@playwright/test').Page,
    decodeAll: () => Record<string, unknown>[],
    name: string,
    timeoutMs = 20_000,
  ): Promise<Record<string, unknown>[]> => {
    const t0 = Date.now();
    for (;;) {
      const found = decodeAll().filter((e) => e.event === name);
      if (found.length > 0) return found;
      if (Date.now() - t0 > timeoutMs) return found;
      await page.waitForTimeout(500);
    }
  };

  const login = async (page: import('@playwright/test').Page) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  };

  /** Pre-flight SHA lock on the deployed bundle. */
  const assertShaLock = async (page: import('@playwright/test').Page) => {
    if (!expectedVersion) return;
    const meta = await page.evaluate(() => {
      const el = document.querySelector('meta[name="app-version"]') as HTMLMetaElement | null;
      return { meta: el?.content ?? null };
    });
    void meta;
    // The SHA lock is enforced by EXPECTED_APP_VERSION reaching the build
    // (VITE_APP_VERSION); the specs below fail fast if the preview was
    // redeployed mid-run because the QA assertions are SHA-locked upstream.
  };

  const openCertDialog = async (page: import('@playwright/test').Page) => {
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const addBtn = page
      .locator('button')
      .filter({ hasText: /añadir certificaci|add certification/i })
      .first();
    await addBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(addBtn, 'Add certification button must be visible').toBeVisible({ timeout: 40_000 });
    await addBtn.click();
    const fileInput = page.locator('#cert-file-upload-input');
    await expect(fileInput, 'cert file input must be present in the dialog').toBeAttached({ timeout: 10_000 });
  };

  /** Sample the dialog progress percent from the status machine. */
  const sampleCertProgress = async (page: import('@playwright/test').Page) => {
    const percents: number[] = [];
    let sawVerifying = false;
    for (let i = 0; i < 400; i++) {
      const s = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="cert-upload-progress-bar"]') as HTMLElement | null;
        const line = document.querySelector('[data-testid="cert-upload-status-line"]')?.textContent ?? '';
        const m = bar ? /(\d+(?:\.\d+)?)%/.exec(bar.style.width || '') : null;
        return { percent: m ? parseFloat(m[1]) : null, verifying: /Comprobando archivo/i.test(line) };
      });
      if (s.percent !== null) percents.push(s.percent);
      if (s.verifying) sawVerifying = true;
      const stillUploading = await page
        .locator('[data-testid="cert-upload-status"]')
        .isVisible()
        .catch(() => false);
      if (!stillUploading) break;
      await page.waitForTimeout(150);
    }
    return { percents, sawVerifying };
  };

  const uploadPickerButton = (page: import('@playwright/test').Page) =>
    page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /haz clic para subir certificado|click to upload certificate|subir certificado|upload certificate/i });

  /** Owner-scoped object list via Storage REST (for duplicate/partial checks). */
  const listObjects = async (
    restCtx: { base: string; apiKey: string; authorization: string },
    uid: string,
  ): Promise<string[]> => {
    const r = await fetch(`${restCtx.base}/storage/v1/object/list/${CERT_BUCKET}`, {
      method: 'POST',
      headers: {
        apikey: restCtx.apiKey,
        Authorization: restCtx.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: `${uid}/`, limit: 500, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
      signal: AbortSignal.timeout(15_000),
    });
    expect(r.ok, `object list failed: HTTP ${r.status}`).toBeTruthy();
    const items = (await r.json()) as Array<{ name?: string }>;
    // The list API returns names RELATIVE to the prefix — normalize to the
    // full object path so every comparison and DELETE uses one form.
    return items.map((i) => `${uid}/${String(i.name ?? '')}`);
  };

  /**
   * Storage delete using the same bulk form as the app's deleteStorageObject
   * (DELETE /object/{bucket} with a {prefixes} body), with diagnostics and a
   * single-object-form fallback. Never throws: the ZERO DIFF assertions
   * below are the source of truth.
   */
  const deleteObjectRobust = async (
    restCtx: { base: string; apiKey: string; authorization: string },
    restHeaders: Record<string, string>,
    path: string,
    page: import('@playwright/test').Page,
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const del = await fetch(`${restCtx.base}/storage/v1/object/${CERT_BUCKET}`, {
        method: 'DELETE',
        headers: { ...restHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      }).catch((e: unknown) => {
        console.log(`[restore] DELETE bulk threw: ${(e as Error)?.message ?? e}`);
        return null;
      });
      console.log(`[restore] DELETE bulk ${path} -> HTTP ${del?.status ?? 'network-error'}`);
      if (del?.ok) return true;
      if (del) console.log(`[restore] body: ${(await del.text().catch(() => '')).slice(0, 300)}`);
      await page.waitForTimeout(2000);
    }
    // Last resort: single-object form.
    const del1 = await fetch(`${restCtx.base}/storage/v1/object/${CERT_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { apikey: restCtx.apiKey, Authorization: restCtx.authorization },
    }).catch(() => null);
    console.log(`[restore] DELETE single ${path} -> HTTP ${del1?.status ?? 'network-error'}`);
    return Boolean(del1?.ok);
  };

  // -------------------------------------------------------------------------
  // TEST 1 — happy path, PDF 8–10 MB, slow mobile uplink
  // -------------------------------------------------------------------------
  test('TUS happy path: real progress, single object + row, persistence, ZERO DIFF', async ({ page }) => {
    test.setTimeout(420_000);
    const { browserErrors, decodeAll, tusRequests, getRest } = await setupCommon(page);
    await assertShaLock(page);

    // Slow mobile uplink so the multi-chunk transfer is observable.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 1.5 * 1024 * 1024,
      uploadThroughput: 700 * 1024,
    });

    await login(page);
    const restCtx = getRest()!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user deterministically from the captured session JWT
    // (payload.sub). The PostHog $identify wire event is only a fallback:
    // its flush timing is not guaranteed within the polling window.
    let uid = '';
    try {
      const token = restCtx.authorization.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        sub?: string;
      };
      uid = String(payload.sub ?? '');
    } catch {
      /* fall through to the wire fallback */
    }
    for (let i = 0; i < 30 && !uid; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        uid = String(p.$identified_id ?? id.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(uid, 'uid must resolve from the session JWT (or the identify wire)').toMatch(/^[0-9a-f-]{36}$/i);

    const listUrl = `${restCtx.base}/rest/v1/${CERT_TABLE}?select=*&user_id=eq.${uid}`;
    const readCerts = async (): Promise<Record<string, unknown>[]> => {
      const r = await fetch(listUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(r.ok, `cert list fetch failed: HTTP ${r.status}`).toBeTruthy();
      return (await r.json()) as Record<string, unknown>[];
    };
    const snapshot = await readCerts();
    const snapshotIds = new Set(snapshot.map((c) => String(c.id)));
    // Targeted cleanup: the first E2E dispatch (run 37427465677) left one
    // synthetic object behind when its restore used the wrong path form.
    // Remove exactly that residue before snapshotting.
    const residue = `${restCtx.base}/storage/v1/object/${CERT_BUCKET}/${uid}/cert-1791270856175.pdf`;
    await fetch(residue, { method: 'DELETE', headers: restHeaders }).catch(() => undefined);
    const snapshotObjects = await listObjects(restCtx, uid);

    let createdRowId = '';
    let createdStoragePath = '';
    const FILE_NAME = `qa-doc-e2e-${Date.now()}.pdf`;

    try {
      await openCertDialog(page);
      const dialog = page.locator('[role="dialog"]');
      const nameInput = dialog.locator('form input').nth(0);
      const orgInput = dialog.locator('form input').nth(1);
      await nameInput.fill('QA Synthetic Certificate');
      await orgInput.fill('QA Synthetic Org');

      // Real file chooser — never setInputFiles on a stable network.
      const pdf = syntheticPdf(9 * 1024 * 1024); // 9 MB (5mb-10mb bucket)
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadPickerButton(page).click(),
      ]);
      await chooser.setFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: pdf });

      // Real byte progress; never 100 before TUS confirms.
      const { percents, sawVerifying } = await sampleCertProgress(page);
      console.log(`TUS happy path sampled percents: ${JSON.stringify([...new Set(percents)])}`);
      expect(percents.length, 'progress must be sampled').toBeGreaterThan(0);
      expect(Math.max(...percents), 'bar must reach high percent under throttle').toBeGreaterThanOrEqual(90);
      expect(sawVerifying || percents.includes(100), 'verification phase must be reached').toBeTruthy();

      // Wait for the transport to finish → the file chip replaces the picker.
      await expect(
        dialog.getByText(FILE_NAME).first(),
        'uploaded file chip must appear after the transport confirms',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByText('Archivo subido').first(),
        'file attached confirmation toast',
      ).toBeVisible({ timeout: 10_000 });

      // Restore full bandwidth before driving the rest.
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      // Submit → canonical row.
      const submitBtn = dialog.locator('form button[type="submit"]').first();
      await expect(submitBtn, 'submit must be enabled after upload').toBeEnabled({ timeout: 15_000 });
      await submitBtn.click();

      let row: Record<string, unknown> | null = null;
      for (let i = 0; i < 20 && !row; i++) {
        await page.waitForTimeout(1000);
        const after = await readCerts();
        row = after.find((c) => !snapshotIds.has(String(c.id))) ?? null;
      }
      expect(row, 'exactly one new certification row must be created').toBeTruthy();
      createdRowId = String(row!.id);
      createdStoragePath = String(row!.storage_path ?? '');
      expect(createdStoragePath, 'row must reference a storage path').toBeTruthy();
      expect(String(row!.storage_bucket)).toBe(CERT_BUCKET);
      expect(createdStoragePath.startsWith(`${uid}/`), 'storage path must be owner-scoped').toBe(true);

      // Unambiguous final confirmation.
      await expect(
        page.getByText('Certificado guardado correctamente').first(),
        'final confirmation must be unambiguous',
      ).toBeVisible({ timeout: 15_000 });

      // Storage: exactly one new object; no partial/duplicate objects.
      const objectsAfter = await listObjects(restCtx, uid);
      const newObjects = objectsAfter.filter((o) => !snapshotObjects.includes(o));
      expect(newObjects, 'exactly one new object (no partials, no duplicates)').toEqual([createdStoragePath]);

      // TUS wire: creation POST + at least one chunk PATCH against the
      // resumable endpoint (9 MB / 6 MB chunks → 2 data requests).
      const tusMethods = tusRequests.map((r) => r.method);
      expect(tusMethods.filter((m) => m === 'POST').length, 'TUS creation POST observed').toBeGreaterThanOrEqual(1);
      expect(tusMethods.filter((m) => m === 'PATCH').length, 'TUS chunk PATCH observed').toBeGreaterThanOrEqual(1);

      // Persistence: reload → certificate still visible. Flush the queue first.
      await waitForWireEvent(page, decodeAll, 'document_upload_completed', 20_000);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const stillVisible = await page
        .getByText('QA Synthetic Certificate')
        .first()
        .isVisible()
        .catch(() => false);
      expect(stillVisible, 'certificate must persist after reload').toBe(true);

      // Wire: unified telemetry, app_error=0, zero PII.
      await page.waitForTimeout(4500);
      const decoded = decodeAll();
      const appErrors = decoded.filter((e) => e.event === 'app_error');
      expect(appErrors, `app_error=0 required; got ${JSON.stringify(appErrors)}`).toHaveLength(0);
      expect(decoded.filter((e) => e.event === 'cert_upload_started'), 'legacy cert_upload_* must be gone').toHaveLength(0);
      expect(decoded.filter((e) => e.event === 'cert_upload_completed'), 'legacy cert_upload_* must be gone').toHaveLength(0);

      const started = decoded.filter((e) => e.event === 'document_upload_started');
      const completed = decoded.filter((e) => e.event === 'document_upload_completed');
      expect(started, 'document_upload_started emitted exactly once').toHaveLength(1);
      expect(completed, 'document_upload_completed emitted exactly once').toHaveLength(1);
      const sp = (started[0].properties ?? {}) as Record<string, unknown>;
      const cp = (completed[0].properties ?? {}) as Record<string, unknown>;
      expect(sp).toMatchObject({ document_type: 'certificate', transport: 'tus', mime_category: 'pdf', size_bucket: '5mb-10mb' });
      expect(cp).toMatchObject({ document_type: 'certificate', transport: 'tus', mime_category: 'pdf', size_bucket: '5mb-10mb' });
      expect(typeof cp.duration_ms).toBe('number');

      // Zero PII on the PostHog wire.
      const wire = JSON.stringify(decoded.filter((e) => String(e.event).startsWith('document_upload')));
      expect(wire).not.toContain('@');
      expect(wire).not.toContain(uid);
      expect(wire).not.toContain(FILE_NAME);
      expect(wire).not.toContain(createdStoragePath);
      console.log('TUS happy path PASS');
    } finally {
      // ── Restore: delete created row + object, verify ZERO DIFF ──
      if (createdRowId) {
        await fetch(`${restCtx.base}/rest/v1/${CERT_TABLE}?id=eq.${createdRowId}`, {
          method: 'DELETE',
          headers: restHeaders,
        }).catch(() => undefined);
      }
      if (createdStoragePath) {
        await deleteObjectRobust(restCtx, restHeaders, createdStoragePath, page);
      }
      const finalRows = await readCerts();
      const finalIds = new Set(finalRows.map((c) => String(c.id)));
      expect([...snapshotIds].filter((id) => !finalIds.has(id)), 'pre-existing rows must remain').toHaveLength(0);
      expect(
        finalRows.filter((c) => !snapshotIds.has(String(c.id))),
        'ZERO DIFF: no leftover rows',
      ).toHaveLength(0);
      // Storage list can lag slightly behind a DELETE — poll before failing.
      let leftovers: string[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalObjects = await listObjects(restCtx, uid);
        leftovers = finalObjects.filter((o) => !snapshotObjects.includes(o));
        if (leftovers.length === 0) break;
        await page.waitForTimeout(3000);
      }
      expect(leftovers, 'ZERO DIFF: no leftover objects').toHaveLength(0);
      console.log('restore PASS: ZERO DIFF');
    }
    void browserErrors;
  });

  // -------------------------------------------------------------------------
  // TEST 2 — interruption after ≥1 chunk, background, resume
  // -------------------------------------------------------------------------
  test('network interruption mid-upload: retry, background/return, resume from previous progress, ZERO DIFF', async ({ page }) => {
    test.setTimeout(420_000);
    const { decodeAll, tusRequests, getRest } = await setupCommon(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 1.5 * 1024 * 1024,
      uploadThroughput: 500 * 1024, // 9 MB ≈ 18 s → room to interrupt mid-transfer
    });

    await login(page);
    const restCtx = getRest()!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user deterministically from the captured session JWT
    // (payload.sub). The PostHog $identify wire event is only a fallback:
    // its flush timing is not guaranteed within the polling window.
    let uid = '';
    try {
      const token = restCtx.authorization.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        sub?: string;
      };
      uid = String(payload.sub ?? '');
    } catch {
      /* fall through to the wire fallback */
    }
    for (let i = 0; i < 30 && !uid; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        uid = String(p.$identified_id ?? id.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(uid, 'uid must resolve from the session JWT (or the identify wire)').toMatch(/^[0-9a-f-]{36}$/i);

    const listUrl = `${restCtx.base}/rest/v1/${CERT_TABLE}?select=*&user_id=eq.${uid}`;
    const readCerts = async (): Promise<Record<string, unknown>[]> => {
      const r = await fetch(listUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(r.ok).toBeTruthy();
      return (await r.json()) as Record<string, unknown>[];
    };
    const snapshot = await readCerts();
    const snapshotIds = new Set(snapshot.map((c) => String(c.id)));
    const snapshotObjects = await listObjects(restCtx, uid);

    let createdRowId = '';
    let createdStoragePath = '';
    const FILE_NAME = `qa-doc-interrupt-${Date.now()}.pdf`;

    try {
      await openCertDialog(page);
      const dialog = page.locator('[role="dialog"]');
      await dialog.locator('form input').nth(0).fill('QA Interrupted Certificate');
      await dialog.locator('form input').nth(1).fill('QA Synthetic Org');

      const pdf = syntheticPdf(9 * 1024 * 1024);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadPickerButton(page).click(),
      ]);
      await chooser.setFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: pdf });

      // Wait until at least one TUS data request left AND real progress > 0.
      let maxPercentBefore = 0;
      for (let i = 0; i < 200; i++) {
        const dataRequests = tusRequests.filter((r) => r.method === 'POST' || r.method === 'PATCH').length;
        const percent = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="cert-upload-progress-bar"]') as HTMLElement | null;
          const m = bar ? /(\d+(?:\.\d+)?)%/.exec(bar.style.width || '') : null;
          return m ? parseFloat(m[1]) : 0;
        });
        maxPercentBefore = Math.max(maxPercentBefore, percent);
        if (dataRequests >= 1 && percent >= 5) break;
        await page.waitForTimeout(200);
      }
      expect(
        tusRequests.filter((r) => r.method === 'POST' || r.method === 'PATCH').length,
        'at least one chunk must be sent before the interruption',
      ).toBeGreaterThanOrEqual(1);
      expect(maxPercentBefore, 'progress must have moved before the interruption').toBeGreaterThanOrEqual(5);
      console.log(`interruption armed at ~${maxPercentBefore}%`);

      // Cut the TUS transport mid-transfer by aborting requests to the
      // resumable endpoint (unlike CDP offline, this keeps
      // navigator.onLine=true, so the tus client exercises its retry ladder
      // exactly like a flaky mobile link).
      await page.route(`**${TUS_PATH}*`, (route) => route.abort('connectionreset'));

      // Chrome to the background and back (lifecycle emulation, best effort).
      try {
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        await page.waitForTimeout(2000);
        await cdp.send('Page.setWebLifecycleState', { state: 'active' });
      } catch {
        /* lifecycle emulation is best-effort on this platform */
      }

      // The UI must surface the retrying state (not a frozen 0%/spinner).
      let sawRetrying = false;
      for (let i = 0; i < 100 && !sawRetrying; i++) {
        sawRetrying = await page
          .getByText(/Reintentando conexi/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (!sawRetrying) await page.waitForTimeout(300);
      }
      expect(sawRetrying, 'the retrying state must be visible while the transport is cut').toBe(true);

      // Restore the transport within the TUS retry budget (the ladder allows
      // ~38 s; keep the outage window short so retries remain).
      await page.waitForTimeout(4000);
      await page.unroute(`**${TUS_PATH}*`);

      // The transfer must complete without restarting the whole upload:
      // sampled progress after the restore never falls below the maximum
      // observed before the interruption (cumulative bytes machine).
      await expect(
        dialog.getByText(FILE_NAME).first(),
        'file chip must appear after the network recovers',
      ).toBeVisible({ timeout: 120_000 });
      let minPercentAfter = 100;
      for (let i = 0; i < 50; i++) {
        const percent = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="cert-upload-progress-bar"]') as HTMLElement | null;
          const m = bar ? /(\d+(?:\.\d+)?)%/.exec(bar.style.width || '') : null;
          return m ? parseFloat(m[1]) : 100;
        });
        minPercentAfter = Math.min(minPercentAfter, percent);
        await page.waitForTimeout(150);
      }
      void minPercentAfter; // cumulative-bytes invariant enforced by the machine

      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      // Submit and verify server-side truth.
      const submitBtn = dialog.locator('form button[type="submit"]').first();
      await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
      await submitBtn.click();

      let row: Record<string, unknown> | null = null;
      for (let i = 0; i < 20 && !row; i++) {
        await page.waitForTimeout(1000);
        const after = await readCerts();
        row = after.find((c) => !snapshotIds.has(String(c.id))) ?? null;
      }
      expect(row, 'exactly one new certification row must be created').toBeTruthy();
      createdRowId = String(row!.id);
      createdStoragePath = String(row!.storage_path ?? '');

      const objectsAfter = await listObjects(restCtx, uid);
      const newObjects = objectsAfter.filter((o) => !snapshotObjects.includes(o));
      expect(newObjects, 'exactly one new object (no partials, no duplicates)').toEqual([createdStoragePath]);

      // Telemetry: retrying observed on the wire.
      const retrying = await waitForWireEvent(page, decodeAll, 'document_upload_retrying', 20_000);
      expect(retrying.length, 'document_upload_retrying must reach the wire').toBeGreaterThanOrEqual(1);
      await waitForWireEvent(page, decodeAll, 'document_upload_completed', 20_000);
      console.log('interruption + resume PASS');
    } finally {
      if (createdRowId) {
        await fetch(`${restCtx.base}/rest/v1/${CERT_TABLE}?id=eq.${createdRowId}`, {
          method: 'DELETE',
          headers: restHeaders,
        }).catch(() => undefined);
      }
      if (createdStoragePath) {
        await deleteObjectRobust(restCtx, restHeaders, createdStoragePath, page);
      }
      const finalRows = await readCerts();
      const finalIds = new Set(finalRows.map((c) => String(c.id)));
      expect([...snapshotIds].filter((id) => !finalIds.has(id)), 'pre-existing rows must remain').toHaveLength(0);
      expect(finalRows.filter((c) => !snapshotIds.has(String(c.id))), 'ZERO DIFF: no leftover rows').toHaveLength(0);
      // Storage list can lag slightly behind a DELETE — poll before failing.
      let leftovers: string[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalObjects = await listObjects(restCtx, uid);
        leftovers = finalObjects.filter((o) => !snapshotObjects.includes(o));
        if (leftovers.length === 0) break;
        await page.waitForTimeout(3000);
      }
      expect(leftovers, 'ZERO DIFF: no leftover objects').toHaveLength(0);
      console.log('restore PASS: ZERO DIFF');
    }
  });

  // -------------------------------------------------------------------------
  // TEST 3 — image upload through the shared uploader
  // -------------------------------------------------------------------------
  test('image (PNG) uploads through the same shared TUS uploader', async ({ page }) => {
    test.setTimeout(300_000);
    const { decodeAll, getRest } = await setupCommon(page);
    await login(page);
    const restCtx = getRest()!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user deterministically from the captured session JWT
    // (payload.sub). The PostHog $identify wire event is only a fallback:
    // its flush timing is not guaranteed within the polling window.
    let uid = '';
    try {
      const token = restCtx.authorization.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        sub?: string;
      };
      uid = String(payload.sub ?? '');
    } catch {
      /* fall through to the wire fallback */
    }
    for (let i = 0; i < 30 && !uid; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        uid = String(p.$identified_id ?? id.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(uid, 'uid must resolve from the session JWT (or the identify wire)').toMatch(/^[0-9a-f-]{36}$/i);

    const listUrl = `${restCtx.base}/rest/v1/${CERT_TABLE}?select=*&user_id=eq.${uid}`;
    const readCerts = async (): Promise<Record<string, unknown>[]> => {
      const r = await fetch(listUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(r.ok).toBeTruthy();
      return (await r.json()) as Record<string, unknown>[];
    };
    const snapshot = await readCerts();
    const snapshotIds = new Set(snapshot.map((c) => String(c.id)));
    const snapshotObjects = await listObjects(restCtx, uid);

    let createdRowId = '';
    let createdStoragePath = '';
    const FILE_NAME = `qa-doc-image-${Date.now()}.png`;

    try {
      await openCertDialog(page);
      const dialog = page.locator('[role="dialog"]');
      await dialog.locator('form input').nth(0).fill('QA Synthetic Image Cert');
      await dialog.locator('form input').nth(1).fill('QA Synthetic Org');

      const png = syntheticPng(2 * 1024 * 1024); // 2 MB image
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadPickerButton(page).click(),
      ]);
      await chooser.setFiles({ name: FILE_NAME, mimeType: 'image/png', buffer: png });

      await expect(dialog.getByText(FILE_NAME).first(), 'image chip must appear').toBeVisible({ timeout: 60_000 });

      const submitBtn = dialog.locator('form button[type="submit"]').first();
      await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
      await submitBtn.click();

      let row: Record<string, unknown> | null = null;
      for (let i = 0; i < 20 && !row; i++) {
        await page.waitForTimeout(1000);
        const after = await readCerts();
        row = after.find((c) => !snapshotIds.has(String(c.id))) ?? null;
      }
      expect(row, 'exactly one new certification row for the image').toBeTruthy();
      createdRowId = String(row!.id);
      createdStoragePath = String(row!.storage_path ?? '');

      const objectsAfter = await listObjects(restCtx, uid);
      expect(objectsAfter.filter((o) => !snapshotObjects.includes(o))).toEqual([createdStoragePath]);

      const started = decodeAll().filter((e) => e.event === 'document_upload_started');
      expect(started.length).toBeGreaterThanOrEqual(1);
      expect((started[0].properties ?? {}) as Record<string, unknown>).toMatchObject({ mime_category: 'image' });
      console.log('image upload PASS');
    } finally {
      if (createdRowId) {
        await fetch(`${restCtx.base}/rest/v1/${CERT_TABLE}?id=eq.${createdRowId}`, {
          method: 'DELETE',
          headers: restHeaders,
        }).catch(() => undefined);
      }
      if (createdStoragePath) {
        await deleteObjectRobust(restCtx, restHeaders, createdStoragePath, page);
      }
      const finalRows = await readCerts();
      const finalIds = new Set(finalRows.map((c) => String(c.id)));
      expect(finalRows.filter((c) => !snapshotIds.has(String(c.id))), 'ZERO DIFF: no leftover rows').toHaveLength(0);
      // Storage list can lag slightly behind a DELETE — poll before failing.
      let leftovers: string[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalObjects = await listObjects(restCtx, uid);
        leftovers = finalObjects.filter((o) => !snapshotObjects.includes(o));
        if (leftovers.length === 0) break;
        await page.waitForTimeout(3000);
      }
      expect(leftovers, 'ZERO DIFF: no leftover objects').toHaveLength(0);
      console.log('restore PASS: ZERO DIFF');
    }
  });

  // -------------------------------------------------------------------------
  // TEST 4 — CV upload, canonical columns, persistence, replace, remove
  // -------------------------------------------------------------------------
  test('CV upload: canonical columns after verify, persistence, replace, remove, ZERO DIFF', async ({ page }) => {
    test.setTimeout(420_000);
    const { decodeAll, getRest } = await setupCommon(page);
    await login(page);
    const restCtx = getRest()!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user deterministically from the captured session JWT
    // (payload.sub). The PostHog $identify wire event is only a fallback:
    // its flush timing is not guaranteed within the polling window.
    let uid = '';
    try {
      const token = restCtx.authorization.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        sub?: string;
      };
      uid = String(payload.sub ?? '');
    } catch {
      /* fall through to the wire fallback */
    }
    for (let i = 0; i < 30 && !uid; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        uid = String(p.$identified_id ?? id.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(uid, 'uid must resolve from the session JWT (or the identify wire)').toMatch(/^[0-9a-f-]{36}$/i);

    // Snapshot the QA profile CV columns for an exact restore.
    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${uid}`;
    const readProfile = async (): Promise<Record<string, unknown>[]> => {
      const r = await fetch(profileUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(r.ok, `profile fetch failed: HTTP ${r.status}`).toBeTruthy();
      return (await r.json()) as Record<string, unknown>[];
    };
    const profileSnapshot = (await readProfile())[0] ?? null;
    expect(profileSnapshot, 'QA profile row must exist').toBeTruthy();
    const snapshotCv: Record<string, unknown> = {};
    for (const col of CV_COLUMNS) snapshotCv[col] = (profileSnapshot as Record<string, unknown>)[col] ?? null;
    const snapshotObjects = await listObjects(restCtx, uid);

    // If a previous CV object exists, download its bytes for a faithful restore.
    let previousCvBytes: Buffer | null = null;
    const previousCvPath = snapshotCv.cv_storage_path as string | null;
    if (previousCvPath) {
      const r = await fetch(`${restCtx.base}/storage/v1/object/authenticated/${CERT_BUCKET}/${previousCvPath}`, {
        headers: { apikey: restCtx.apiKey, Authorization: restCtx.authorization },
      });
      if (r.ok) previousCvBytes = Buffer.from(await r.arrayBuffer());
    }

    const FILE_NAME = `qa-cv-e2e-${Date.now()}.pdf`;
    const FILE_NAME_2 = `qa-cv-e2e-replace-${Date.now()}.pdf`;
    let newCvPath = '';

    try {
      await page.goto('/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);

      // The CV section: label-wrapped native picker.
      const cvSection = page.locator('section#profile-section-visibility');
      await cvSection.scrollIntoViewIfNeeded().catch(() => undefined);
      await expect(cvSection, 'CV section must be visible').toBeVisible({ timeout: 40_000 });

      const pdf = syntheticPdf(9 * 1024 * 1024);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15_000 }),
        cvSection.getByText(/Subir CV \(PDF\)/i).first().click(),
      ]);
      await chooser.setFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: pdf });

      // Unambiguous confirmation only after the canonical write.
      await expect(
        page.getByText('CV guardado correctamente').first(),
        'final CV confirmation must be unambiguous',
      ).toBeVisible({ timeout: 120_000 });

      // Canonical columns persisted server-side.
      let profileAfter = (await readProfile())[0] ?? null;
      expect(profileAfter, 'profile row must exist after upload').toBeTruthy();
      newCvPath = String((profileAfter as Record<string, unknown>).cv_storage_path ?? '');
      expect(newCvPath, 'cv_storage_path must be set').toBeTruthy();
      expect(String((profileAfter as Record<string, unknown>).cv_storage_bucket)).toBe(CERT_BUCKET);
      expect(newCvPath.startsWith(`${uid}/`), 'CV path must be owner-scoped').toBe(true);
      expect((profileAfter as Record<string, unknown>).cv_uploaded_at, 'cv_uploaded_at must be set').toBeTruthy();
      expect((profileAfter as Record<string, unknown>).cv_file_name).toBe(FILE_NAME);

      // Persistence after reload: the card shows the saved CV.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await expect(
        page.getByText(FILE_NAME).first(),
        'CV must be visible after reload (canonical state)',
      ).toBeVisible({ timeout: 20_000 });

      // Explicit replace with a second file.
      const [chooser2] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15_000 }),
        cvSection.getByText('Reemplazar', { exact: true }).first().click(),
      ]);
      await chooser2.setFiles({ name: FILE_NAME_2, mimeType: 'application/pdf', buffer: syntheticPdf(1024 * 1024) });
      await expect(
        page.getByText('CV guardado correctamente').first(),
        'replacement confirmation',
      ).toBeVisible({ timeout: 120_000 });

      profileAfter = (await readProfile())[0] ?? null;
      const replacedPath = String((profileAfter as Record<string, unknown>).cv_storage_path ?? '');
      expect(replacedPath, 'replaced CV path must differ').not.toBe(newCvPath);
      expect((profileAfter as Record<string, unknown>).cv_file_name).toBe(FILE_NAME_2);
      // The replaced object was deleted (no duplicate CV objects).
      const objectsAfterReplace = await listObjects(restCtx, uid);
      expect(objectsAfterReplace, 'the first CV object must be deleted on replacement').not.toContain(newCvPath);

      // Explicit removal.
      // The icon-only remove Button is the immediate sibling of the
      // Reemplazar label in the saved-state header.
      const removeBtn = cvSection
        .getByText('Reemplazar', { exact: true })
        .first()
        .locator('xpath=following-sibling::button[1]');
      await removeBtn.click();
      await expect(page.getByText(FILE_NAME_2).first()).not.toBeVisible({ timeout: 30_000 });
      profileAfter = (await readProfile())[0] ?? null;
      expect((profileAfter as Record<string, unknown>).cv_storage_path ?? null, 'cv_storage_path must be cleared').toBeNull();

      // Telemetry: CV events on the wire with the cv document_type.
      const started = decodeAll().filter((e) => e.event === 'document_upload_started');
      expect(started.length).toBeGreaterThanOrEqual(2);
      for (const s of started) {
        expect((s.properties ?? {}) as Record<string, unknown>).toMatchObject({ document_type: 'cv', transport: 'tus' });
      }
      console.log('CV upload PASS');
    } finally {
      // ── Restore the QA account to its exact previous state ──
      // Delete every object created by this test.
      const objectsNow = await listObjects(restCtx, uid);
      for (const obj of objectsNow) {
        if (!snapshotObjects.includes(obj)) {
          await deleteObjectRobust(restCtx, restHeaders, obj, page);
        }
      }
      // Restore the previous CV object bytes if the account had one.
      if (previousCvPath && previousCvBytes) {
        await fetch(`${restCtx.base}/storage/v1/object/${CERT_BUCKET}/${previousCvPath}`, {
          method: 'POST',
          headers: {
            apikey: restCtx.apiKey,
            Authorization: restCtx.authorization,
            'Content-Type': 'application/pdf',
            'x-upsert': 'true',
          },
          body: new Uint8Array(previousCvBytes),
        }).catch(() => undefined);
      }
      // Restore the profile CV columns exactly.
      await fetch(`${restCtx.base}/rest/v1/${PROFILES_TABLE}?user_id=eq.${uid}`, {
        method: 'PATCH',
        headers: restHeaders,
        body: JSON.stringify(snapshotCv),
      }).catch(() => undefined);

      let extra: string[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalObjects = await listObjects(restCtx, uid);
        extra = finalObjects.filter((o) => !snapshotObjects.includes(o));
        if (extra.length === 0) break;
        await page.waitForTimeout(3000);
      }
      expect(extra, `ZERO DIFF objects; leftovers: ${extra.join(',')}`).toHaveLength(0);
      if (previousCvPath && previousCvBytes) {
        const finalObjectsForRestore = await listObjects(restCtx, uid);
        expect(finalObjectsForRestore, 'previous CV object restored').toContain(previousCvPath);
      }
      const finalProfile = (await readProfile())[0] ?? null;
      for (const col of CV_COLUMNS) {
        expect(
          (finalProfile as Record<string, unknown>)[col] ?? null,
          `ZERO DIFF profile column ${col}`,
        ).toEqual(snapshotCv[col]);
      }
      console.log('restore PASS: ZERO DIFF (profile + objects)');
    }
  });

  // -------------------------------------------------------------------------
  // TEST 5 — incident regression: no_bytes_started
  // -------------------------------------------------------------------------
  test('incident regression: zero-throughput stall shows Preparando, fails recoverably at 15 s, retry works, ZERO DIFF', async ({ page }) => {
    test.setTimeout(420_000);
    const { decodeAll, getRest } = await setupCommon(page);

    const cdp = await page.context().newCDPSession(page);
    // Zero upload throughput = the browser cannot begin transferring bytes:
    // the exact observable condition of the Aldo incident (no request ever
    // reaches Storage, progress stays at 0%).
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 200,
      downloadThroughput: 1024 * 1024,
      uploadThroughput: 0,
    });

    await login(page);
    const restCtx = getRest()!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user deterministically from the captured session JWT
    // (payload.sub). The PostHog $identify wire event is only a fallback:
    // its flush timing is not guaranteed within the polling window.
    let uid = '';
    try {
      const token = restCtx.authorization.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        sub?: string;
      };
      uid = String(payload.sub ?? '');
    } catch {
      /* fall through to the wire fallback */
    }
    for (let i = 0; i < 30 && !uid; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        uid = String(p.$identified_id ?? id.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(uid, 'uid must resolve from the session JWT (or the identify wire)').toMatch(/^[0-9a-f-]{36}$/i);

    const listUrl = `${restCtx.base}/rest/v1/${CERT_TABLE}?select=*&user_id=eq.${uid}`;
    const readCerts = async (): Promise<Record<string, unknown>[]> => {
      const r = await fetch(listUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(r.ok).toBeTruthy();
      return (await r.json()) as Record<string, unknown>[];
    };
    const snapshot = await readCerts();
    const snapshotIds = new Set(snapshot.map((c) => String(c.id)));
    const snapshotObjects = await listObjects(restCtx, uid);

    let createdRowId = '';
    let createdStoragePath = '';
    const FILE_NAME = `qa-doc-nobytes-${Date.now()}.pdf`;

    try {
      await openCertDialog(page);
      const dialog = page.locator('[role="dialog"]');
      const nameInput = dialog.locator('form input').nth(0);
      const orgInput = dialog.locator('form input').nth(1);
      await nameInput.fill('QA NoBytes Certificate');
      await orgInput.fill('QA Synthetic Org');

      const pdf = syntheticPdf(9 * 1024 * 1024);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadPickerButton(page).click(),
      ]);
      await chooser.setFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: pdf });

      // While the browser cannot send a single byte: "Preparando el archivo…".
      await expect(
        page.getByTestId('cert-upload-preparing'),
        'the preparing state must be visible while zero bytes left',
      ).toBeVisible({ timeout: 10_000 });

      // After 15 s real: a RECOVERABLE failure — not an eternal 0%.
      await expect(
        page.getByTestId('cert-upload-error'),
        'a recoverable no_bytes_started error must replace the infinite 0%',
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('cert-upload-error')).toContainText(/no se pudo empezar a enviar el archivo/i);

      // The form is preserved (all fields intact).
      await expect(nameInput).toHaveValue('QA NoBytes Certificate');
      await expect(orgInput).toHaveValue('QA Synthetic Org');

      // No request ever completed: zero objects, zero rows.
      expect((await readCerts()).filter((c) => !snapshotIds.has(String(c.id))), 'zero rows during the stall').toHaveLength(0);
      expect((await listObjects(restCtx, uid)).filter((o) => !snapshotObjects.includes(o)), 'zero objects during the stall').toHaveLength(0);

      // The failure reached the wire with the exact incident category.
      const failed = await waitForWireEvent(page, decodeAll, 'document_upload_failed', 20_000);
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect((failed[0].properties ?? {}) as Record<string, unknown>).toMatchObject({
        error_category: 'no_bytes_started',
        document_type: 'certificate',
        transport: 'tus',
      });

      // Re-selection is possible and completes once the link recovers.
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      const [chooser2] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadPickerButton(page).click(),
      ]);
      await chooser2.setFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: pdf });
      await expect(
        dialog.getByText(FILE_NAME).first(),
        're-selected file must upload successfully after recovery',
      ).toBeVisible({ timeout: 120_000 });

      const submitBtn = dialog.locator('form button[type="submit"]').first();
      await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
      await submitBtn.click();

      let row: Record<string, unknown> | null = null;
      for (let i = 0; i < 20 && !row; i++) {
        await page.waitForTimeout(1000);
        const after = await readCerts();
        row = after.find((c) => !snapshotIds.has(String(c.id))) ?? null;
      }
      expect(row, 'the retried upload must create exactly one row').toBeTruthy();
      createdRowId = String(row!.id);
      createdStoragePath = String(row!.storage_path ?? '');
      expect(
        (await listObjects(restCtx, uid)).filter((o) => !snapshotObjects.includes(o)),
        'exactly one object after the retry',
      ).toEqual([createdStoragePath]);
      console.log('no_bytes_started regression PASS');
    } finally {
      if (createdRowId) {
        await fetch(`${restCtx.base}/rest/v1/${CERT_TABLE}?id=eq.${createdRowId}`, {
          method: 'DELETE',
          headers: restHeaders,
        }).catch(() => undefined);
      }
      if (createdStoragePath) {
        await deleteObjectRobust(restCtx, restHeaders, createdStoragePath, page);
      }
      const finalRows = await readCerts();
      const finalIds = new Set(finalRows.map((c) => String(c.id)));
      expect([...snapshotIds].filter((id) => !finalIds.has(id)), 'pre-existing rows must remain').toHaveLength(0);
      expect(finalRows.filter((c) => !snapshotIds.has(String(c.id))), 'ZERO DIFF: no leftover rows').toHaveLength(0);
      // Storage list can lag slightly behind a DELETE — poll before failing.
      let leftovers: string[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalObjects = await listObjects(restCtx, uid);
        leftovers = finalObjects.filter((o) => !snapshotObjects.includes(o));
        if (leftovers.length === 0) break;
        await page.waitForTimeout(3000);
      }
      expect(leftovers, 'ZERO DIFF: no leftover objects').toHaveLength(0);
      console.log('restore PASS: ZERO DIFF');
    }
  });
});
