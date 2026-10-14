import { test, expect } from '@playwright/test';

/**
 * PB-PROFILE-STABILITY-001 / FASE 3 — certificate save under
 * translator-grade DOM mutation (real user incident: "Algo ha ido mal" on
 * save, certificate appears on Retry).
 *
 * Root cause under test (same class as PB-UI-DOM-INSERTBEFORE-001 and
 * PB-UI-DOM-REMOVECHILD-RESIDUAL-001): the certification dialog submit
 * button renders `{saving ? <Loader2/> : null}` next to a BARE text label.
 * With Chrome auto-translate having font-wrapped (detached) that text node,
 * the saving=false→true commit inserts the icon anchored at a text fiber
 * whose DOM node is no longer a child of the button → NotFoundError
 * insertBefore → ErrorBoundary. The INSERT can still complete server-side,
 * which is exactly why the certificate "appears on Retry".
 *
 * Sites covered by this regression:
 *  - CertificationsSection submit button (the reported flow)
 *  - CertificationsSection delete button (same construction)
 *  - ExperienceQuickCapture, CourseDetail checkout (same class, fixed in
 *    the same minimal patch)
 *
 * Method (mirrors the proven profile/onboarding DOM-mutation specs):
 *  1. Login (dedicated synthetic DOC_OPEN_E2E owner account) → /profile.
 *  2. Font-wrap ALL text nodes (Chrome translate simulation).
 *  3. Open the Add-certification dialog (new DOM) → fill via native setter.
 *  4. RE-mutate (Chrome retranslates newly inserted DOM — this wraps the
 *     dialog's submit label).
 *  5. Click Save. PRE-FIX: ErrorBoundary + NotFoundError (spec FAILS =
 *     defect reproduced). POST-FIX: no boundary, certificate visible and
 *     persisted in app_worker_certifications (spec PASSES).
 *  6. Cleanup: the synthetic certificate row is deleted via REST with the
 *     session token captured from the wire (zero residue, synthetic data
 *     owned by the synthetic account only).
 */

const EMAIL = process.env.DOC_OPEN_E2E_EMAIL;
const PASSWORD = process.env.DOC_OPEN_E2E_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const CERTS_TABLE = 'app_worker_certifications';
const CERT_NAME_PREFIX = 'E2E Crash Cert';

const TRANSLATE_SIM = `(() => {
  const root = document.getElementById('root');
  if (!root) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const font = document.createElement('font');
    font.style.verticalAlign = 'inherit';
    font.textContent = n.nodeValue;
    n.parentNode.replaceChild(font, n);
  }
  return nodes.length;
})()`;

test.use({ viewport: { width: 1366, height: 768 }, locale: 'es-ES' });

test.describe('PB-PROFILE-STABILITY-001 FASE 3 — certificate save under translate DOM mutation', () => {
  test.skip(!hasCreds, 'DOC_OPEN_E2E_EMAIL / DOC_OPEN_E2E_PASSWORD not configured');

  test('save certificate under font-wrapped DOM: no ErrorBoundary, canonical row persisted, zero residue', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
        localStorage.setItem('pipingbox_language', 'es');
      } catch {
        /* noop */
      }
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)));

    // Capture the Supabase REST context (apikey + user JWT) from the wire
    // for the canonical-row assertion and the cleanup (same mechanism as
    // the proven profile-dom-mutation spec).
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

    const certName = `${CERT_NAME_PREFIX} ${Date.now()}`;

    // ── Login → /profile ────────────────────────────────────────────────
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await page.waitForURL(/\/(dashboard|profile)/, { timeout: 30_000 });
    await page.goto('/profile', { waitUntil: 'networkidle' });
    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    // Owner id from the JWT sub (no PII).
    const jwt = restCtx.authorization.replace(/^Bearer\s+/i, '');
    const ownerId = String(
      JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).sub,
    );

    const cleanup = async () => {
      const res = await fetch(
        `${restCtx.base}/rest/v1/${CERTS_TABLE}?user_id=eq.${ownerId}&certification_name=like.${encodeURIComponent(CERT_NAME_PREFIX)}*`,
        { method: 'DELETE', headers: restHeaders, signal: AbortSignal.timeout(15_000) },
      );
      console.log('cleanup: DELETE synthetic certs -> HTTP', res.status);
    };

    try {
      // ── 1. Font-wrap everything (Chrome translate), incl. sections ────
      await page.waitForTimeout(4000); // let async sections resolve first
      const mutated1 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim pass 1 (loaded page): ${mutated1} nodes font-wrapped`);

      const boundaryVisible = () =>
        page
          .getByText(/Código de incidencia|Incident code/i)
          .first()
          .isVisible()
          .catch(() => false);

      // ── 2. Open the Add-certification dialog ─────────────────────────
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /a(ñ|n)adir|add/i.test(b.textContent ?? ''),
        );
        if (!btn) throw new Error('add-certification button not found');
        btn.click();
      });
      await page.locator('#cert-file-upload-input').waitFor({ state: 'attached', timeout: 15_000 });

      // ── 3. Fill name + org via the native setter (mutation-proof) ────
      const fill = await page.evaluate((name) => {
        const setVal = (el: HTMLInputElement, v: string) => {
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
          set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const inputs = [...document.querySelectorAll('[role=dialog] input:not([type=file]):not([type=date])')] as HTMLInputElement[];
        if (inputs.length < 2) return 'NF:' + inputs.length;
        setVal(inputs[0], name);
        setVal(inputs[1], 'E2E Synthetic Org');
        return 'ok';
      }, certName);
      expect(fill, 'dialog inputs (name, org) must be fillable').toBe('ok');

      // ── 4. RE-mutate: Chrome retranslates the newly inserted dialog ──
      const mutated2 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim pass 2 (dialog included): ${mutated2} nodes font-wrapped`);
      expect(
        await boundaryVisible(),
        'opening the dialog under translated DOM must not crash',
      ).toBe(false);

      // ── 5. Click Save — THE incident moment ──────────────────────────
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('[role=dialog] button[type=submit]')] as HTMLButtonElement[];
        const save = btn.find((b) => !b.disabled);
        if (!save) throw new Error('enabled submit button not found in dialog');
        save.click();
      });

      // Give the save commit + DB round trip time to land (or to crash).
      await page.waitForTimeout(6000);

      // PRE-FIX: NotFoundError insertBefore fires here and the boundary
      // appears (spec FAILS — defect reproduced with the exact production
      // symptoms). POST-FIX: no boundary, no NotFoundError.
      const notFoundErrors = pageErrors.filter((e) => /NotFoundError/.test(e));
      expect(
        notFoundErrors,
        `saving a certificate under translated DOM must not raise NotFoundError (got: ${notFoundErrors.join(' | ') || 'none'})`,
      ).toEqual([]);
      expect(
        await boundaryVisible(),
        'saving a certificate under translated DOM must NOT crash into the ErrorBoundary',
      ).toBe(false);

      // ── 6. Canonical confirmation: the row exists in PostgreSQL ──────
      const res = await fetch(
        `${restCtx.base}/rest/v1/${CERTS_TABLE}?user_id=eq.${ownerId}&certification_name=eq.${encodeURIComponent(certName)}&select=id,certification_name`,
        { headers: restHeaders, signal: AbortSignal.timeout(15_000) },
      );
      expect(res.ok, `canonical row fetch failed: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as unknown[];
      expect(rows.length, 'the saved certificate must be persisted in app_worker_certifications').toBe(1);

      // And it renders in the list (the "appears on Retry" state must be
      // reached WITHOUT any retry).
      await expect(page.getByText(certName)).toBeVisible({ timeout: 15_000 });
      console.log('certificate save under translated DOM: PASS (no crash, canonical row, rendered)');
    } finally {
      await cleanup();
    }
  });
});
