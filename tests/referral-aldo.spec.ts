import { test, expect } from '@playwright/test';
import { gunzipSync } from 'zlib';

/**
 * PB-REFERRAL-ALDO-001 — referral link validation for the Aldo campaign
 * (production, SHA-locked, isolated QA window).
 *
 * Validates the end-to-end attribution path against the REAL deployed
 * functions (referrals-bootstrap / referrals-apply were 404 until this
 * ticket — every attribution was silently dropped):
 *
 *   1. /register?ref=PB-ALDO0017 stores the code (capture proof).
 *   2. Dashboard recovery applies the attribution via referrals-apply.
 *   3. Exactly one referrals row (no duplicates on a second pass).
 *   4. Self-referral rejected (400).
 *   5. A previous attribution is never overwritten (already_assigned).
 *   6. referrals-bootstrap is idempotent (stable code, no regeneration).
 *   7. app_error = 0 and zero PII on the analytics wire.
 *
 * Restore: the referrals table has NO delete RLS policy for owners, and the
 * campaign counter evidence must exist at service level, so the test leaves
 * the attribution in place on success; the operator verifies the counter
 * and restores ZERO DIFF via service SQL immediately after the run
 * (documented in brain/growth/PB-REFERRAL-ALDO-001.md). On failure the
 * finally-block still clears localStorage state.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const BASE_URL = (process.env.PREVIEW_URL ?? 'https://pipingbox.com').replace(/\/$/, '');
const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';
const expectedEnv = process.env.EXPECTED_ENV ?? 'production';

const hasCreds = Boolean(EMAIL && PASSWORD);

// Aldo's canonical persisted identity for this campaign (never PII: the
// code is a public share token and the uid is internal-only test wiring).
const ALDO_UID = 'f7e3f65e-fd9a-4c09-b021-dd502651003b';
const ALDO_CODE = 'PB-ALDO0017';
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const REFERRALS_TABLE = 'app_14da0f1941_referrals';

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

test.describe('PB-REFERRAL-ALDO-001 referral attribution E2E (production, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping referral E2E');

  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  });

  const setupCommon = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
      } catch {
        /* noop */
      }
    });

    const browserErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') browserErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => browserErrors.push('pageerror: ' + String(e).slice(0, 300)));

    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const b = req.postDataBuffer();
        if (b) payloads.push(b);
      }
    });

    let rest: RestCtx | null = null;
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

    return { browserErrors, decodeAll, getRest: () => rest };
  };

  const waitForWireEvent = async (
    page: import('@playwright/test').Page,
    decodeAll: () => Record<string, unknown>[],
    name: string,
    timeoutMs = 25_000,
  ): Promise<Record<string, unknown>[]> => {
    const t0 = Date.now();
    for (;;) {
      const found = decodeAll().filter((e) => e.event === name);
      if (found.length > 0) return found;
      if (Date.now() - t0 > timeoutMs) return found;
      await page.waitForTimeout(500);
    }
  };

  test('link capture → attribution → counter → invariants (no-dup, no-self, no-overwrite, idempotent bootstrap)', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { browserErrors, decodeAll, getRest } = await setupCommon(page);

    const emailTrimmed = (EMAIL ?? '').trim();
    expect(emailTrimmed, 'disposable account must be in qa* namespace').toMatch(/^qa[^@]*@pipingbox\.com$/i);

    // ── Login ──
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // ── Pre-flight: SHA-lock + environment on app events ──
    let restCtx: RestCtx | null = null;
    let servedVersion = '';
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 60_000) {
        const appEvents = decodeAll().filter((e) => {
          const p = (e.properties ?? {}) as Record<string, unknown>;
          return typeof p.app_version === 'string' && typeof p.environment === 'string';
        });
        restCtx = restCtx ?? getRest();
        if (appEvents.length > 0 && restCtx) {
          const p = (appEvents[0].properties ?? {}) as Record<string, unknown>;
          servedVersion = String(p.app_version);
          if (expectedVersion) {
            expect(servedVersion, 'served app_version must equal the tested SHA').toBe(expectedVersion);
          }
          expect(String(p.environment), 'PostHog environment mismatch').toBe(expectedEnv);
          break;
        }
        await page.waitForTimeout(1000);
      }
    }
    expect(restCtx, 'REST context (apikey + bearer) must be captured').toBeTruthy();
    console.log(`pre-flight PASS: served app_version=${servedVersion || 'n/a'} env=${expectedEnv}`);

    const restHeaders: Record<string, string> = {
      apikey: restCtx!.apiKey,
      Authorization: restCtx!.authorization,
      'Content-Type': 'application/json',
    };

    // ── QA identity + snapshot ──
    const profileRes = await fetch(
      `${restCtx!.base}/rest/v1/${PROFILES_TABLE}?select=user_id,referral_code,referred_by_user_id`,
      { headers: restHeaders },
    );
    const profiles = (await profileRes.json()) as Array<Record<string, unknown>>;
    expect(profiles.length, 'QA profile must exist').toBe(1);
    const uid = String(profiles[0].user_id);
    let snapshotCode = (profiles[0].referral_code as string | null) ?? null;
    const snapshotReferredBy = (profiles[0].referred_by_user_id as string | null) ?? null;
    expect(snapshotReferredBy, 'QA account must start unattributed for this test').toBeNull();

    const fnHeaders: Record<string, string> = {
      Authorization: restCtx!.authorization,
      'Content-Type': 'application/json',
    };

    // Existing full profiles (like Aldo's) never hit the AUTH_ONLY bootstrap
    // path, so they may still lack a code — exactly the gap this ticket fixed
    // for Aldo manually. Assign one through the now-deployed function, which
    // also exercises referrals-bootstrap directly.
    if (!snapshotCode) {
      const boot = await fetch(`${restCtx!.base}/functions/v1/referrals-bootstrap`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({}),
      });
      expect(boot.status, 'referrals-bootstrap must assign a code').toBe(200);
      snapshotCode = String(((await boot.json()) as Record<string, unknown>).referral_code ?? '');
    }
    expect(snapshotCode, 'QA profile must own a stable referral_code (T1)').toMatch(/^PB-/);

    const referralsBefore = (await (
      await fetch(`${restCtx!.base}/rest/v1/${REFERRALS_TABLE}?referred_id=eq.${uid}&select=id`, {
        headers: restHeaders,
      })
    ).json()) as Array<Record<string, unknown>>;
    expect(referralsBefore.length, 'QA account must start with zero referral rows').toBe(0);
    console.log(`snapshot: uid captured, code=${snapshotCode}, referred_by=NULL, referral rows=0`);

    try {
      // ── 1) Link capture: /register?ref=PB-ALDO0017 persists the code ──
      await page.goto(`/register?ref=${ALDO_CODE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const stored = await page.evaluate(() => localStorage.getItem('pipingbox_referral_code'));
      expect(stored, 'referral code must be persisted by the capture hook').toBe(ALDO_CODE);
      const opened = await waitForWireEvent(page, decodeAll, 'referral_link_opened');
      const captured = await waitForWireEvent(page, decodeAll, 'referral_captured');
      expect(opened.length, 'referral_link_opened must reach the wire').toBeGreaterThan(0);
      expect(captured.length, 'referral_captured must reach the wire').toBeGreaterThan(0);
      for (const e of [...opened, ...captured]) {
        // The referral CODE itself must never be sent to analytics.
        expect(JSON.stringify(e), 'analytics must not contain the referral code').not.toContain(ALDO_CODE);
      }
      console.log('capture PASS: code persisted, referral_link_opened + referral_captured on wire, code not leaked');

      // ── 2) Attribution via Dashboard recovery (referrals-apply) ──
      await page.goto('/dashboard', { waitUntil: 'networkidle' });
      let attributed = false;
      for (let i = 0; i < 45 && !attributed; i++) {
        await page.waitForTimeout(1000);
        const r = (await (
          await fetch(
            `${restCtx!.base}/rest/v1/${PROFILES_TABLE}?select=referred_by_user_id`,
            { headers: restHeaders },
          )
        ).json()) as Array<Record<string, unknown>>;
        attributed = r[0]?.referred_by_user_id === ALDO_UID;
      }
      expect(attributed, 'QA profile must become attributed to Aldo via dashboard recovery').toBe(true);

      const rows = (await (
        await fetch(
          `${restCtx!.base}/rest/v1/${REFERRALS_TABLE}?referred_id=eq.${uid}&select=id,referrer_id,status`,
          { headers: restHeaders },
        )
      ).json()) as Array<Record<string, unknown>>;
      expect(rows.length, 'exactly one referral row must exist').toBe(1);
      expect(rows[0].referrer_id).toBe(ALDO_UID);
      expect(['pending', 'verified']).toContain(rows[0].status);
      console.log(`attribution PASS: referred_by=ALDO, 1 row (status=${rows[0].status})`);

      // Counter proof (QA-visible slice): the attributed row is exactly what
      // getReferralStats(ALDO) counts via profiles.referred_by_user_id.
      const counterSlice = (await (
        await fetch(
          `${restCtx!.base}/rest/v1/${PROFILES_TABLE}?referred_by_user_id=eq.${ALDO_UID}&select=user_id`,
          { headers: restHeaders },
        )
      ).json()) as Array<Record<string, unknown>>;
      expect(counterSlice.length, 'Aldo counter source must include the QA profile').toBe(1);
      console.log('counter PASS: profiles.referred_by_user_id=ALDO resolves the QA profile');

      // ── 3) No duplicates: second recovery pass must not add rows ──
      await page.evaluate((code) => {
        localStorage.setItem('pipingbox_referral_code', code);
        localStorage.setItem('pipingbox_referral_timestamp', Date.now().toString());
      }, ALDO_CODE);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(8000);
      const rowsAfterSecondPass = (await (
        await fetch(
          `${restCtx!.base}/rest/v1/${REFERRALS_TABLE}?referred_id=eq.${uid}&select=id`,
          { headers: restHeaders },
        )
      ).json()) as Array<Record<string, unknown>>;
      expect(rowsAfterSecondPass.length, 'second recovery pass must NOT duplicate the referral').toBe(1);
      console.log('no-duplicates PASS');

      // ── 4) Self-referral rejected ──
      const selfRes = await fetch(`${restCtx!.base}/functions/v1/referrals-apply`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({ referred_id: uid, referrer_id: uid }),
      });
      expect(selfRes.status, 'self-referral must be rejected with 400').toBe(400);
      console.log('no-self-referral PASS');

      // ── 5) Previous attribution is never overwritten ──
      const otherRes = await fetch(`${restCtx!.base}/functions/v1/referrals-apply`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({
          referred_id: uid,
          referrer_id: '00000000-0000-0000-0000-000000000001',
        }),
      });
      expect(otherRes.status).toBe(200);
      const otherBody = (await otherRes.json()) as Record<string, unknown>;
      expect(otherBody.already_assigned, 'apply must no-op when attribution exists').toBe(true);
      const stillAldo = (await (
        await fetch(`${restCtx!.base}/rest/v1/${PROFILES_TABLE}?select=referred_by_user_id`, {
          headers: restHeaders,
        })
      ).json()) as Array<Record<string, unknown>>;
      expect(stillAldo[0]?.referred_by_user_id, 'attribution must remain Aldo').toBe(ALDO_UID);
      console.log('no-overwrite PASS (already_assigned, attribution intact)');

      // ── 6) Bootstrap idempotency: stable code, never regenerated ──
      const boot1 = await fetch(`${restCtx!.base}/functions/v1/referrals-bootstrap`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({}),
      });
      expect(boot1.status).toBe(200);
      const boot1Body = (await boot1.json()) as Record<string, unknown>;
      const boot2 = await fetch(`${restCtx!.base}/functions/v1/referrals-bootstrap`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({}),
      });
      const boot2Body = (await boot2.json()) as Record<string, unknown>;
      expect(boot1Body.referral_code, 'bootstrap must return the PRE-EXISTING code').toBe(snapshotCode);
      expect(boot2Body.referral_code, 'bootstrap must be idempotent across calls').toBe(snapshotCode);
      expect(boot1Body.referrer_id ?? null, 'bootstrap must not reassign when attributed').toBeNull();
      console.log(`bootstrap idempotency PASS (code stable: ${boot1Body.referral_code})`);

      // ── 7) Wire sweep: app_error=0, zero PII ──
      await page.waitForTimeout(4500);
      const decodedFinal = decodeAll();
      const appErrors = decodedFinal.filter((e) => e.event === 'app_error');
      expect(appErrors, `app_error=0 required; got ${JSON.stringify(appErrors.map((e) => (e.properties as Record<string, unknown>)?.incident_code))}`).toHaveLength(0);
      for (const e of decodedFinal) {
        expect(JSON.stringify(e)).not.toContain('@');
      }
      expect(browserErrors.filter((b) => /insertBefore|removeChild/i.test(b)), 'no DOM reconciliation crashes').toHaveLength(0);
      console.log('wire PASS: app_error=0, zero PII, no DOM crashes');
    } finally {
      // Leave the browser-side referral state clean; the server-side
      // attribution stays for the service-level counter evidence and is
      // restored to ZERO DIFF by the operator via service SQL post-run.
      await page.evaluate(() => {
        try {
          localStorage.removeItem('pipingbox_referral_code');
          localStorage.removeItem('pipingbox_referral_timestamp');
          localStorage.removeItem('pipingbox_referral_email');
        } catch {
          /* noop */
        }
      });
    }
  });
});
