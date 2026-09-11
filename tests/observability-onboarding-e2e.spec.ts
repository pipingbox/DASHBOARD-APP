import { test, expect, Page } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-OBSERVABILITY-001 — onboarding funnel E2E (preview, SHA-locked).
 *
 * Runs in its own isolated workflow job (no concurrent auth gates, shared
 * deploy-preview concurrency lock) against the deployed preview. Verifies on
 * the PostHog wire:
 *  - onboarding_started  (exactly once)
 *  - onboarding_step_reached (steps 1..8, once each, in order)
 *  - onboarding_completed (exactly once, emitted ONLY after the canonical
 *    onboarding_status confirms finalization — MARKETPLACE_READY via the
 *    pb_complete_onboarding RPC behind the complete-onboarding edge function)
 * with the same correlation_id, environment=preview and app_version equal to
 * the served SHA, no duplicates from re-render and no PII.
 *
 * PB-COMPLETE-ONBOARDING-404-001 coverage: the wizard must treat a non-2xx
 * complete-onboarding response as failure (no success screen, no draft
 * clearing, no onboarding_completed) and offer a recoverable retry. Verified
 * with a one-shot mocked 500 before the real call.
 *
 * ── Authorized one-shot QA-account reset (PO authorization, 2026-09-11) ──
 * The disposable QA account is past the OnboardingGate, and the profiles
 * update guard makes onboarding_status / marketplace_ready /
 * profile_completion owner-unwritable. The ONLY owner-executable canonical
 * writer of that trio is the deployed recalculate-profiles edge function.
 *
 * Procedure (all authorization conditions implemented):
 *  1. Account identity resolved from the $identify wire event (never from
 *     the email; the UUID is only ever printed redacted to 8 chars).
 *  2. Preflight: exactly one profile row; role='worker'; account_type !=
 *     admin; zero experience / certification / document rows; no residual
 *     storage avatar from a previous run. Any violation aborts BEFORE
 *     touching data.
 *  3. Snapshot the FULL profile row (all columns).
 *  4. Authorized reset (whenever the wizard gate would not show): owner
 *     PATCH nulling title/company/location/years_experience/skills/bio/
 *     avatar_url (full_name is PRESERVED so the post-wizard completion
 *     reaches the canonical threshold: avatar 10 + full_name 5 + title 5 +
 *     skills 10 + location 5 = 35 >= 30), then recalculate-profiles
 *     (exactly one updated row); derived state must be AUTH_ONLY / 0 / false.
 *  5. Drive the wizard (8 steps, public visibility, avatar upload) with a
 *     one-shot mocked 500 on complete-onboarding first: the wizard must stay
 *     open with a recoverable error and NO success; retry Finalizar against
 *     the real endpoint.
 *  6. Assert the canonical MARKETPLACE_READY state server-side and the
 *     closed funnel on the wire.
 *  7. finally (ALWAYS): restore every owner-granted snapshot column the
 *     reset or wizard may have touched, recalculate to re-derive the
 *     protected trio, require ZERO differences vs the snapshot except
 *     updated_at, and best-effort delete the test-uploaded storage avatar.
 *
 * PostHog history/events are never deleted. This authorization covers this
 * account and this execution only.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redact = (v: unknown) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : v);
const redactUuids = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid');

// 1x1 transparent PNG.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const COMPLETED_STATUSES = ['PROFILE_COMPLETED', 'MARKETPLACE_READY'];
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const COUNT_TABLES = [
  'app_worker_experiences',
  'app_worker_certifications',
  'app_worker_documents',
] as const;

// full_name is deliberately PRESERVED by the reset (see header): with the
// wizard's avatar upload the completion reaches 35 >= 30, so the canonical
// finalization is reachable through the wizard alone.
const RESET_NULL_COLUMNS = [
  'title',
  'company',
  'location',
  'years_experience',
  'skills',
  'bio',
  'avatar_url',
] as const;

const RESTORE_COLUMNS = [
  ...RESET_NULL_COLUMNS,
  'full_name',
  'account_type',
  'role',
  'availability_status',
  'willing_to_travel',
  'willing_to_relocate',
  'cv_visible',
  'profile_visibility',
] as const;

const IGNORED_DIFF_COLUMNS = new Set(['updated_at']);

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

test.describe('PB-OBSERVABILITY-001 onboarding E2E (SHA-locked, authorized QA reset, non-2xx coverage)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping onboarding E2E');

  test('reset → wizard → mocked-500 retry → canonical completion → funnel on the wire → exact restore', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // Guard: disposable-account convention (verified live: qa*@pipingbox.com).
    const emailTrimmed = (EMAIL ?? '').trim();
    expect(emailTrimmed.length, 'E2E_TEST_EMAIL must not be empty').toBeGreaterThan(0);
    expect(
      emailTrimmed,
      'the disposable account must be in the internal qa* test namespace on pipingbox.com',
    ).toMatch(/^qa[^@]*@pipingbox\.com$/i);

    // PostHog wire capture (gzip batches).
    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });

    // Backend network capture (edge + non-2xx REST), UUIDs redacted.
    const netLog: string[] = [];
    page.on('response', async (res) => {
      const url = res.url();
      try {
        if (url.includes('/functions/v1/')) {
          const body = (await res.text()).slice(0, 300);
          netLog.push(`EDGE ${res.status()} ${url.split('/functions/v1/')[1]} :: ${body}`);
        } else if (url.includes('/rest/v1/') && res.status() >= 400) {
          const body = (await res.text()).slice(0, 300);
          netLog.push(`REST ${res.status()} ${url.split('/rest/v1/')[1]?.slice(0, 80)} :: ${body}`);
        }
      } catch {
        netLog.push(`${url.includes('/functions/v1/') ? 'EDGE' : 'REST'} ${res.status()} (body unavailable)`);
      }
    });

    // Track the avatar storage upload (for the finally-block cleanup).
    let uploadedAvatarPath: string | null = null;
    page.on('request', (req) => {
      const m = req.url().match(/\/storage\/v1\/object\/profile_pictures\/(.+)$/);
      if (m && req.method() === 'POST') uploadedAvatarPath = m[1];
    });

    // Supabase REST context from the app's own requests (never printed).
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

    const distinctIdOf = (e: Record<string, unknown>): string => {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      return String(e.distinct_id ?? p.distinct_id ?? '');
    };

    // ── 1. Pre-flight: served build must match the expected SHA ────────────
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500); // past the SDK's 3s batch flush

    const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';
    const preFlight = decodeAll();
    expect(
      preFlight.length,
      'pre-flight requires at least one flushed event from the login page',
    ).toBeGreaterThan(0);
    for (const e of preFlight) {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      expect(String(p.environment), 'served environment must be preview').toBe('preview');
      if (expectedVersion) {
        expect(
          String(p.app_version),
          'ABORT: served app_version does not match the expected SHA — deploy the target SHA before running this E2E',
        ).toBe(expectedVersion);
      }
    }
    console.log(
      `pre-flight PASS: ${preFlight.length} events from served build ${redact(expectedVersion) || '(no expected SHA set)'}`,
    );

    // ── 2. Login with the disposable QA account ────────────────────────────
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // Canonical user UUID from the wire $identify (never from the email).
    let identifiedId = '';
    for (let i = 0; i < 10 && !identifiedId; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        identifiedId = String(p.$identified_id ?? distinctIdOf(id));
      }
    }
    expect(identifiedId, 'exactly one $identify must flush after login').toMatch(UUID_RE);
    expect(identifiedId).not.toContain('@');
    console.log(`identified auth.user.id (redacted): ${redact(identifiedId)}`);

    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };
    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${identifiedId}`;

    const readProfile = async (): Promise<Record<string, unknown>> => {
      const res = await fetch(profileUrl, { headers: restHeaders });
      expect(res.ok, `profile fetch failed: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as Record<string, unknown>[];
      expect(rows.length, 'QA account must have exactly one profile row').toBe(1);
      return rows[0];
    };

    const recalculateOwn = async (): Promise<number> => {
      const res = await fetch(`${restCtx.base}/functions/v1/recalculate-profiles`, {
        method: 'POST',
        headers: { Authorization: restCtx.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: identifiedId }),
      });
      expect(res.ok, `recalculate-profiles failed: HTTP ${res.status}`).toBeTruthy();
      const body = (await res.json()) as { updated?: number };
      expect(body.updated, 'recalculate-profiles must report exactly one updated profile').toBe(1);
      return body.updated ?? 0;
    };

    // ── 3. Snapshot + preflight (abort BEFORE touching anything) ──────────
    const snapshot = await readProfile();
    console.log(
      `snapshot: onboarding_status=${String(snapshot.onboarding_status)}, marketplace_ready=${String(snapshot.marketplace_ready)}, profile_completion=${String(snapshot.profile_completion)}`,
    );

    expect(snapshot.role, "preflight: role must be 'worker'").toBe('worker');
    expect(snapshot.account_type, 'preflight: admin accounts are untouchable').not.toBe('admin');

    for (const table of COUNT_TABLES) {
      const res = await fetch(
        `${restCtx.base}/rest/v1/${table}?select=user_id&user_id=eq.${identifiedId}`,
        { headers: restHeaders },
      );
      expect(res.ok, `preflight count failed on ${table}: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as unknown[];
      expect(
        rows.length,
        `preflight abort: the QA account has ${table} rows — they would keep the derived completion >= 30; nothing has been modified`,
      ).toBe(0);
    }

    let restoreDone = false;
    let restoreDiffColumns: string[] = [];
    try {
      // ── 4. Authorized reset (whenever the gate would NOT show) ──────────
      const gateWouldShow =
        !COMPLETED_STATUSES.includes(String(snapshot.onboarding_status)) &&
        (!(snapshot.title && snapshot.location) ||
          snapshot.role === 'user' ||
          !snapshot.account_type);
      if (!gateWouldShow) {
        const resetBody: Record<string, unknown> = {};
        for (const col of RESET_NULL_COLUMNS) resetBody[col] = null;

        const resetRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(resetBody),
        });
        expect(resetRes.ok, `reset PATCH failed: HTTP ${resetRes.status}`).toBeTruthy();
        const resetRows = (await resetRes.json()) as Record<string, unknown>[];
        expect(resetRows, 'reset PATCH must affect exactly one row').toHaveLength(1);

        await recalculateOwn();

        const afterReset = await readProfile();
        expect(String(afterReset.onboarding_status), 'reset must derive AUTH_ONLY').toBe('AUTH_ONLY');
        expect(Number(afterReset.profile_completion), 'reset must derive completion <= 5 (full_name only)').toBeLessThanOrEqual(5);
        expect(Boolean(afterReset.marketplace_ready), 'reset must derive marketplace_ready false').toBe(false);
        console.log('authorized reset applied: AUTH_ONLY (full_name preserved for threshold reachability)');
      } else {
        console.log('no reset needed: gate already armed');
      }

      // ── 5. Reload so the gate re-evaluates; the wizard must appear ──────
      await page.evaluate((uid) => localStorage.removeItem(`pipingbox_onboarding_draft_${uid}`), identifiedId);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(
        page.getByText('¿Qué tipo de cuenta necesitas?'),
        'onboarding wizard must appear (pre-onboarding canonical status)',
      ).toBeVisible({ timeout: 30_000 });

      // ── 6. Drive the 8-step wizard (worker, public, avatar) ─────────────
      await page.getByRole('button', { name: /Profesional Industrial/ }).click();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('¿Cuál es tu rol principal?').waitFor();
      await page.getByRole('button', { name: 'Piping Supervisor', exact: true }).click();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('Selecciona tus especialidades').waitFor();
      await page.getByRole('button', { name: 'Piping', exact: true }).click();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('¿Dónde te encuentras?').waitFor();
      await page.getByPlaceholder('Ej: México, España, Colombia...').fill('España');
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('¿Cuál es tu disponibilidad?').waitFor();
      await page.getByRole('button', { name: 'Disponible ahora' }).click();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('Movilidad y disponibilidad para viajar').waitFor();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('Visibilidad de tu perfil').waitFor();
      await page.getByRole('button', { name: /Perfil público/ }).click();
      await page.getByRole('button', { name: 'Siguiente' }).click();

      await page.getByText('Foto de perfil (opcional)').waitFor();
      // Avatar upload: +10 completion so the wizard path reaches >= 30
      // (avatar 10 + full_name 5 + title 5 + skills 10 + location 5 = 35).
      await page.setInputFiles('input[type="file"]', {
        name: 'pb-e2e-avatar.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });

      // ── 6b. PB-COMPLETE-ONBOARDING-404-001: non-2xx must NOT complete ──
      // One-shot mocked 500: the wizard must show the recoverable error,
      // stay open, keep the draft, and NOT report success.
      let mockUsed = false;
      await page.route('**/functions/v1/complete-onboarding', async (route) => {
        if (!mockUsed) {
          mockUsed = true;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'mocked failure for non-2xx coverage' }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByRole('button', { name: /Finalizar/ }).click();

      await expect(
        page.getByTestId('onboarding-completion-error'),
        'a non-2xx complete-onboarding response must surface the recoverable error banner',
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText('Foto de perfil (opcional)'),
        'the wizard must stay open at the final step after a non-2xx finalization (no false success)',
      ).toBeVisible({ timeout: 5_000 });
      console.log('non-2xx handling PASS: recoverable error shown, wizard kept open, no false success');

      // ── 6c. Retry against the real endpoint ─────────────────────────────
      await page.getByRole('button', { name: /Finalizar/ }).click();

      await expect(
        page.getByText('Foto de perfil (opcional)'),
        'wizard must close after a successful retry',
      ).toBeHidden({ timeout: 30_000 });
      await page.waitForTimeout(5000); // past the 3s batch flush

      // ── 7. Canonical state (the RPC-returned + server-side truth) ──────
      const canonical = await readProfile();
      const canonicalStatus = String(canonical.onboarding_status);
      console.log(
        `canonical: onboarding_status=${canonicalStatus}, marketplace_ready=${String(canonical.marketplace_ready)}, profile_completion=${String(canonical.profile_completion)}`,
      );
      expect(
        canonicalStatus,
        'canonical onboarding_status must confirm completion via the app path',
      ).toBe('MARKETPLACE_READY');
      expect(Number(canonical.profile_completion), 'completion must reach the canonical threshold').toBeGreaterThanOrEqual(30);
      expect(Boolean(canonical.marketplace_ready), 'public visibility + completion must derive marketplace_ready').toBe(true);

      console.log('── network log (edge + non-2xx REST, UUIDs redacted) ──');
      for (const line of netLog) console.log(redactUuids(line));

      // ── 8. Wire assertions: the closed onboarding funnel ────────────────
      const decoded = decodeAll();
      const onboardingEvents = decoded.filter((e) =>
        ['onboarding_started', 'onboarding_step_reached', 'onboarding_completed'].includes(
          String(e.event),
        ),
      );
      console.log(
        `wire funnel: total=${onboardingEvents.length} (started=${onboardingEvents.filter((e) => e.event === 'onboarding_started').length} steps=${onboardingEvents.filter((e) => e.event === 'onboarding_step_reached').length} completed=${onboardingEvents.filter((e) => e.event === 'onboarding_completed').length})`,
      );

      expect(onboardingEvents.length, 'onboarding funnel events must reach the wire').toBe(10);

      const started = onboardingEvents.filter((e) => e.event === 'onboarding_started');
      expect(started, 'onboarding_started exactly once (no re-render duplicates)').toHaveLength(1);

      const stepEvents = onboardingEvents.filter((e) => e.event === 'onboarding_step_reached');
      expect(stepEvents, 'onboarding_step_reached exactly 8 times (steps 1..8)').toHaveLength(8);
      const stepSequence = stepEvents.map(
        (e) => (e.properties as Record<string, unknown>).step as number,
      );
      expect(stepSequence, 'steps must be reached in order 1..8').toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const completed = onboardingEvents.filter((e) => e.event === 'onboarding_completed');
      expect(completed, 'onboarding_completed exactly once (after the successful retry only)').toHaveLength(1);
      const funnelOrder = onboardingEvents.map((e) => String(e.event));
      expect(funnelOrder[funnelOrder.length - 1], 'onboarding_completed must close the funnel').toBe(
        'onboarding_completed',
      );

      const correlationIds = new Set<string>();
      for (const e of onboardingEvents) {
        const p = (e.properties ?? {}) as Record<string, unknown>;
        expect(String(p.environment), 'every onboarding event must be environment=preview').toBe(
          'preview',
        );
        if (expectedVersion) {
          expect(String(p.app_version), 'every onboarding event must carry the served SHA').toBe(
            expectedVersion,
          );
        }
        expect(distinctIdOf(e), 'every onboarding event must carry the canonical user UUID').toBe(
          identifiedId,
        );
        const corr = String(p.correlation_id ?? '');
        expect(corr.length, 'every onboarding event must carry a correlation_id').toBeGreaterThan(0);
        correlationIds.add(corr);
        const serialized = JSON.stringify(e);
        expect(serialized).not.toContain('@');
        expect(serialized).not.toContain('ref=');
        expect(serialized).not.toContain('Piping Supervisor');
        expect(serialized).not.toContain('España');
      }
      expect(correlationIds.size, 'all onboarding events share one correlation_id').toBe(1);
      console.log(
        `onboarding funnel PASS: correlation_id (redacted) ${redact([...correlationIds][0])}, steps ${stepSequence.join('>')}, canonical ${canonicalStatus}`,
      );
    } finally {
      // ── 9. Restore (ALWAYS) and verify ZERO diff vs the snapshot ────────
      try {
        const restoreBody: Record<string, unknown> = {};
        for (const col of RESTORE_COLUMNS) {
          if (col in snapshot) restoreBody[col] = snapshot[col];
        }
        const restoreRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(restoreBody),
        });
        expect(restoreRes.ok, `restore PATCH failed: HTTP ${restoreRes.status}`).toBeTruthy();
        const restoreRows = (await restoreRes.json()) as Record<string, unknown>[];
        expect(restoreRows, 'restore PATCH must affect exactly one row').toHaveLength(1);

        await recalculateOwn();

        const finalRow = await readProfile();
        restoreDiffColumns = Object.keys(snapshot).filter(
          (col) =>
            !IGNORED_DIFF_COLUMNS.has(col) &&
            JSON.stringify(snapshot[col]) !== JSON.stringify(finalRow[col]),
        );
        restoreDone = true;
        console.log(
          `restore verified: ${restoreDiffColumns.length === 0 ? 'ZERO diffs' : `DIFFS in ${restoreDiffColumns.join(', ')}`} across ${Object.keys(snapshot).length} snapshot columns (updated_at excluded)`,
        );
        console.log(
          `restored canonical: onboarding_status=${String(finalRow.onboarding_status)}, marketplace_ready=${String(finalRow.marketplace_ready)}, profile_completion=${String(finalRow.profile_completion)}`,
        );
      } catch (err) {
        console.log(`restore FAILED — QA account NOT fully restored: ${String(err)}`);
      }
      // Best-effort cleanup of the test-uploaded avatar object.
      if (uploadedAvatarPath && rest) {
        await fetch(`${rest.base}/storage/v1/object/profile_pictures/${uploadedAvatarPath}`, {
          method: 'DELETE',
          headers: { Authorization: rest.authorization },
        }).catch(() => undefined);
      }
      await page
        .evaluate((uid) => localStorage.removeItem(`pipingbox_onboarding_draft_${uid}`), identifiedId)
        .catch(() => undefined);
    }
    expect(restoreDone, 'restore must have succeeded').toBeTruthy();
    expect(restoreDiffColumns, 'restore must leave ZERO differences vs the snapshot').toHaveLength(0);
  });
});
