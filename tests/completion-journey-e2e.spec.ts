import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import {
  countQualifyingExperiences,
  readinessGaps,
  type WorkforceReadinessInput,
} from '../app/frontend/src/lib/workforceReadiness';
import { toJourneyItems } from '../app/frontend/src/lib/completionJourney';

/**
 * PB-WORKFORCE-ACTIVATION WFA-002 — COMPLETION JOURNEY real browser E2E
 * against the deployed candidate (preview or production, per EXPECTED_ENV).
 * Uses the authorized disposable QA account and the REAL backend; the only
 * mutation is a bounded bio edit performed through the UI and restored
 * exactly (snapshot → conduct → EXACT restore, REST fallback in finally).
 *
 * Scenarios (WFA-002 exit criteria):
 *  J1. The journey renders EXACTLY the canonical gaps computed from DB truth
 *      (same predicate as WFA-007), in canonical order — every blocker maps
 *      to a real required action and no optional field ever appears.
 *  J2. `completion_journey_viewed` fires once per gap-set change, PII-free.
 *  J3. A field action deep-links and focuses the exact input;
 *      `completion_gap_selected` fires with the closed `field` param.
 *  J4. A section action scrolls the target section into view.
 *  J5. The experience action opens Quick Capture (only while the canonical
 *      experience gap exists); closing it creates nothing.
 *  J6. Post-action feedback: completing bio through the UI removes the item
 *      immediately (no logout/login); making it incomplete re-adds it. No
 *      stale banner, no false completion.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const EXPERIENCES_TABLE = 'app_worker_experiences';

// Spanish UI strings (the spec pins pipingbox_language=es, as the other specs).
const TXT = {
  incident: /Código de incidencia|Incident code/i,
  saveProfile: /Guardar perfil/i,
  saving: /Guardando/i,
};

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

test.describe('PB-WORKFORCE-ACTIVATION WFA-002 — completion journey E2E (snapshot → exact restore)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping journey E2E');

  test('journey reflects the canonical predicate, deep-links, updates after action, restores', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const emailTrimmed = (EMAIL ?? '').trim();
    expect(
      emailTrimmed,
      'the disposable account must be in the internal qa* test namespace on pipingbox.com',
    ).toMatch(/^qa[^@]*@pipingbox\.com$/i);

    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
      } catch {
        /* storage unavailable */
      }
    });

    const browserErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') browserErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => browserErrors.push('pageerror: ' + String(err).slice(0, 300)));

    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
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
          const json = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
          return (json.batch ?? [json]) as Record<string, unknown>[];
        } catch {
          return [];
        }
      });

    /** GA4 emission read from the local dataLayer (works even when the GA
     *  endpoint is unreachable; proves the event fired, PII-free). */
    const gaEvents = async (): Promise<{ name: string; params: Record<string, unknown> }[]> =>
      page.evaluate(() => {
        const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
        return dl
          .filter((e): e is unknown[] => Array.isArray(e) && e[0] === 'event')
          .map((e) => ({
            name: String(e[1]),
            params: (typeof e[2] === 'object' && e[2] !== null ? e[2] : {}) as Record<string, unknown>,
          }));
      });

    // ── 0. Login + served-SHA pre-flight (same pattern as the WFA spec) ──
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500);

    const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';
    const expectedEnv = process.env.EXPECTED_ENV ?? 'preview';
    const preFlight = decodeAll();
    if (expectedEnv === 'preview') {
      expect(preFlight.length, 'pre-flight requires at least one flushed event from /login').toBeGreaterThan(0);
      for (const e of preFlight) {
        const p = (e.properties ?? {}) as Record<string, unknown>;
        expect(String(p.environment), `served environment must be ${expectedEnv}`).toBe(expectedEnv);
        if (expectedVersion) {
          expect(String(p.app_version), 'ABORT: served app_version != expected SHA').toBe(expectedVersion);
        }
      }
    } else if (preFlight.length > 0) {
      for (const e of preFlight) {
        const p = (e.properties ?? {}) as Record<string, unknown>;
        if (expectedVersion && p.app_version !== undefined) {
          expect(String(p.app_version), 'ABORT: served app_version != expected SHA').toBe(expectedVersion);
        }
      }
    }

    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;

    let userId = '';
    for (let i = 0; i < 10 && !userId; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        const cand = String(id.distinct_id ?? p.distinct_id ?? '');
        if (UUID_RE.test(cand)) userId = cand;
      }
    }
    if (!UUID_RE.test(userId)) userId = '';
    if (!userId) {
      try {
        const jwt = restCtx.authorization.replace(/^Bearer\s+/i, '');
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
        if (UUID_RE.test(String(payload.sub ?? ''))) userId = String(payload.sub);
      } catch { /* fall through to the assertion below */ }
    }
    expect(userId, 'userId must resolve from $identify (preview) or the Supabase JWT sub (production)').toMatch(UUID_RE);

    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };
    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${userId}`;
    const experiencesUrl = `${restCtx.base}/rest/v1/${EXPERIENCES_TABLE}?select=*&user_id=eq.${userId}`;

    const readProfile = async (): Promise<Record<string, unknown>> => {
      const res = await fetch(profileUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(res.ok, `profile fetch failed: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as Record<string, unknown>[];
      expect(rows.length, 'QA account must have exactly one profile row').toBe(1);
      return rows[0];
    };
    const listOwnExperiences = async (): Promise<Record<string, unknown>[]> => {
      const res = await fetch(experiencesUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(res.ok, `experiences fetch failed: HTTP ${res.status}`).toBeTruthy();
      return (await res.json()) as Record<string, unknown>[];
    };
    const patchProfile = async (body: Record<string, unknown>) => {
      const res = await fetch(profileUrl, {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      expect(res.ok, `profile PATCH failed: HTTP ${res.status}`).toBeTruthy();
    };

    /** Canonical gaps evaluated from DB truth (never from UI optimism). */
    const dbGapKeys = async (): Promise<string[]> => {
      const [profile, experiences] = await Promise.all([readProfile(), listOwnExperiences()]);
      const input: WorkforceReadinessInput = {
        role: (profile.role as string) ?? null,
        full_name: (profile.full_name as string) ?? null,
        title: (profile.title as string) ?? null,
        location: (profile.location as string) ?? null,
        years_experience:
          profile.years_experience === null || profile.years_experience === undefined
            ? null
            : Number(profile.years_experience),
        bio: (profile.bio as string) ?? null,
        skills: (profile.skills as string[]) ?? null,
        availability_status: (profile.availability_status as string) ?? null,
        profile_visibility: (profile.profile_visibility as string) ?? null,
        cv_visible: (profile.cv_visible as boolean) ?? null,
        qualifying_experience_count: countQualifyingExperiences(
          experiences as { position: string | null; company_name: string | null }[],
        ),
        certification_count: 0,
        verified_certification_count: 0,
      };
      return toJourneyItems(readinessGaps(input)).map((i) => i.key);
    };

    /** Rendered journey item keys, in DOM order. */
    const renderedGapKeys = async (): Promise<string[]> => {
      const testids = await page.locator('[data-testid^="journey-item-"]').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-testid') ?? ''),
      );
      return testids.map((tid) => tid.replace(/^journey-item-/, ''));
    };

    const gotoProfile = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.goto('/profile', { timeout: 30_000 });
        await page.locator('#root').first().waitFor({ state: 'attached', timeout: 15_000 });
        const visible = await page
          .locator('#profile-field-years_experience')
          .isVisible({ timeout: 20_000 })
          .catch(() => false);
        if (visible) break;
        if (attempt === 1) {
          await expect(
            page.locator('#profile-field-years_experience'),
            'years-of-experience input must render on /profile',
          ).toBeVisible({ timeout: 10_000 });
        }
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(3000); // let the async sections + journey counts resolve
      expect(
        await page.getByText(TXT.incident).first().isVisible().catch(() => false),
        '/profile must NOT crash into the ErrorBoundary',
      ).toBe(false);
    };

    const saveProfileForm = async () => {
      await page.getByRole('button', { name: TXT.saveProfile }).click();
      await expect(
        page.getByRole('button', { name: TXT.saving }),
        'save button must leave the saving state',
      ).toBeHidden({ timeout: 20_000 });
      await page.waitForTimeout(1500); // profile refetch + journey recompute
    };

    // ── 1. Snapshot ──────────────────────────────────────────────────────
    const snapshot = await readProfile();
    expect(snapshot.role, "preflight: role must be 'worker'").toBe('worker');
    expect(snapshot.account_type, 'preflight: admin accounts are untouchable').not.toBe('admin');
    const snapshotBio = String(snapshot.bio ?? '');
    expect(
      snapshotBio.trim().length,
      'preflight: QA bio must currently satisfy the canonical predicate (>=10 chars) so the journey mutation is deterministic',
    ).toBeGreaterThanOrEqual(10);

    let bioRestored = false;

    try {
      // ── 2. J1 — journey renders EXACTLY the canonical gaps ─────────────
      await gotoProfile();
      const expectedInitial = await dbGapKeys();
      expect(
        expectedInitial.length,
        'preflight: QA account must have at least one canonical gap (0 experiences)',
      ).toBeGreaterThan(0);
      await expect(
        page.locator('[data-testid="completion-journey"]'),
        'completion journey must be visible for an incomplete canonical worker',
      ).toBeVisible({ timeout: 15_000 });

      const renderedInitial = await renderedGapKeys();
      expect(
        renderedInitial,
        'journey items must equal the canonical readinessGaps from DB truth (order included); optional fields must never appear',
      ).toEqual(expectedInitial);
      for (const optional of ['photo', 'company', 'cv', 'certification', 'documents']) {
        expect(renderedInitial, `optional field '${optional}' must never be a journey blocker`).not.toContain(optional);
      }
      // Every rendered blocker maps to a real action.
      for (const key of renderedInitial) {
        await expect(
          page.locator(`[data-testid="journey-action-${key}"]`),
          `journey item '${key}' must expose a direct action`,
        ).toBeVisible();
      }

      // ── 3. J2 — completion_journey_viewed fired, PII-free ──────────────
      const viewed = (await gaEvents()).filter((e) => e.name === 'completion_journey_viewed');
      expect(viewed.length, 'completion_journey_viewed must fire exactly once per gap-set').toBe(1);
      for (const e of viewed) {
        for (const k of Object.keys(e.params)) {
          expect(['field', 'status'], 'analytics params must stay inside the closed allowlist (no PII)').toContain(k);
        }
      }

      // ── 4. J5 — experience action opens Quick Capture, closes clean ────
      if (expectedInitial.includes('experience')) {
        const rowsBefore = (await listOwnExperiences()).length;
        await page.locator('[data-testid="journey-action-experience"]').click();
        await expect(page.getByRole('dialog'), 'Quick Capture must open from the journey action').toBeVisible({
          timeout: 10_000,
        });
        const selected = (await gaEvents()).filter(
          (e) => e.name === 'completion_gap_selected' && e.params.field === 'experience',
        );
        expect(selected.length, 'completion_gap_selected{field:experience} must fire').toBe(1);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog'), 'Quick Capture must close without saving').toBeHidden({
          timeout: 10_000,
        });
        // Nothing was created by open+close.
        expect(
          (await listOwnExperiences()).length,
          'open+close must not create experience rows',
        ).toBe(rowsBefore);
      }

      // ── 5. J4 — section action scrolls the section into view ───────────
      for (const sectionGap of ['availability', 'visibility'] as const) {
        if (!expectedInitial.includes(sectionGap)) continue;
        await page.locator(`[data-testid="journey-action-${sectionGap}"]`).click();
        const targetId = sectionGap === 'availability' ? 'profile-section-availability' : 'profile-section-visibility';
        await expect
          .poll(
            async () =>
              page.locator(`#${targetId}`).evaluate((el) => {
                const r = el.getBoundingClientRect();
                return r.top >= -1 && r.top < window.innerHeight;
              }),
            { timeout: 8_000, message: `section action must scroll #${targetId} into view` },
          )
          .toBe(true);
      }

      // ── 6. J6 — post-action feedback: bio completed → item disappears ──
      // 6a. Make bio non-qualifying through the UI (bounded mutation).
      await page.locator('#profile-field-bio').fill('x');
      await saveProfileForm();
      const expectedShortBio = await dbGapKeys();
      expect(expectedShortBio, 'bio gap must appear in the canonical predicate after shortening bio').toContain('bio');
      await expect
        .poll(async () => renderedGapKeys(), {
          timeout: 20_000,
          message: 'journey must add the bio item immediately after the save (no logout/login)',
        })
        .toEqual(expectedShortBio);

      // J2b — gap-set change re-emits completion_journey_viewed exactly once more.
      const viewedAfterShort = (await gaEvents()).filter((e) => e.name === 'completion_journey_viewed');
      expect(viewedAfterShort.length, 'a changed gap-set must re-emit completion_journey_viewed exactly once').toBe(2);

      // ── 7. J3 — field action deep-links and focuses the exact input ────
      await page.locator('[data-testid="journey-action-bio"]').click();
      await expect
        .poll(
          async () => page.evaluate(() => document.activeElement?.id ?? ''),
          { timeout: 8_000, message: 'field action must focus #profile-field-bio' },
        )
        .toBe('profile-field-bio');
      const selectedBio = (await gaEvents()).filter(
        (e) => e.name === 'completion_gap_selected' && e.params.field === 'bio',
      );
      expect(selectedBio.length, 'completion_gap_selected{field:bio} must fire').toBe(1);
      for (const e of selectedBio) {
        for (const k of Object.keys(e.params)) {
          expect(['field', 'status'], 'analytics params must stay inside the closed allowlist (no PII)').toContain(k);
        }
      }

      // 6b. Restore the original bio through the UI → the item disappears.
      await page.locator('#profile-field-bio').fill(snapshotBio);
      await saveProfileForm();
      const expectedRestored = await dbGapKeys();
      expect(expectedRestored, 'bio gap must clear once the canonical predicate is satisfied again').not.toContain(
        'bio',
      );
      await expect
        .poll(async () => renderedGapKeys(), {
          timeout: 20_000,
          message: 'completed action must remove the journey item immediately (no stale banner)',
        })
        .toEqual(expectedRestored);
      bioRestored = true;
    } finally {
      // ── 8. EXACT restore (REST fallback if the UI path did not finish) ──
      if (!bioRestored) {
        await patchProfile({ bio: snapshot.bio ?? null });
      }
      const finalRow = await readProfile();
      expect(
        String(finalRow.bio ?? ''),
        'restore: bio must be back to the snapshot value',
      ).toBe(snapshotBio);
    }

    // No page-level crash errors attributable to the journey.
    const fatal = browserErrors.filter((e) => /pageerror|TypeError|ReferenceError/.test(e));
    expect(fatal, `no fatal browser errors expected: ${fatal.join(' | ')}`).toHaveLength(0);
  });
});
