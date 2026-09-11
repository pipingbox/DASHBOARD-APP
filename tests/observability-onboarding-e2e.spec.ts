import { test, expect } from '@playwright/test';
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
 *    onboarding_status confirms finalization — PROFILE_COMPLETED or
 *    MARKETPLACE_READY — per the gate-6 requirement)
 * with the same correlation_id, environment=preview and app_version equal to
 * the served SHA, no duplicates from re-render and no PII.
 *
 * Uses ONLY the dedicated disposable QA account (E2E_TEST_EMAIL, starts with
 * "qa.e2e" — NEVER a real user). Snapshots the profile before the run and
 * restores every wizard-writable column afterwards. The protected columns
 * (onboarding_status, marketplace_ready, profile_completion) are RPC-only
 * and cannot be user-restored; the QA account legitimately ends in a
 * canonically completed state and re-running this E2E requires an admin
 * reset of onboarding_status.
 *
 * Identity values are only ever logged REDACTED (first 8 chars). Credentials
 * come from env and are never printed. The profile snapshot is never logged.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redact = (v: unknown) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : v);

const COMPLETED_STATUSES = ['PROFILE_COMPLETED', 'MARKETPLACE_READY'];
const PROFILES_TABLE = 'app_14da0f1941_profiles';
// Columns the wizard itself writes (owner-writable). Restored after the run.
// onboarding_status / marketplace_ready / profile_completion are RPC-only
// (protected) and are deliberately NOT restored.
const WIZARD_WRITABLE_COLUMNS = [
  'account_type',
  'role',
  'title',
  'skills',
  'location',
  'availability_status',
  'willing_to_travel',
  'willing_to_relocate',
  'cv_visible',
  'profile_visibility',
] as const;

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

test.describe('PB-OBSERVABILITY-001 onboarding E2E (SHA-locked, isolated window)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping onboarding E2E');

  test('login → wizard → 8 steps → canonical completion → onboarding funnel on the wire', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Capture the raw PostHog wire traffic (gzip-compressed batches).
    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });

    // Capture the Supabase REST context (base URL + the owner session's
    // apikey/authorization headers) from the app's own requests. Used for the
    // pre-run snapshot and post-run restore. Never printed.
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

    // ── 3. The onboarding wizard must appear (gate decides from the
    //       canonical profile state). If it does not, the QA account is
    //       already past the gate and this E2E cannot re-trigger it without
    //       an admin reset of the protected onboarding_status column.
    await expect(
      page.getByText('¿Qué tipo de cuenta necesitas?'),
      'onboarding wizard must appear for the QA account (if it does not, an admin must reset onboarding_status before re-running this E2E)',
    ).toBeVisible({ timeout: 20_000 });

    // Wait for the $identify event to flush so we know the canonical user
    // UUID (also used to scope the REST snapshot/restore).
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

    // ── 4. Snapshot the QA profile BEFORE driving the wizard ───────────────
    // (autosave skips the mount/restore phase, so the row is still the
    // pre-test state at this point). Never logged.
    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;
    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${identifiedId}`;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };
    const snapRes = await fetch(profileUrl, { headers: restHeaders });
    expect(snapRes.ok, `profile snapshot fetch failed: HTTP ${snapRes.status}`).toBeTruthy();
    const snapRows = (await snapRes.json()) as Record<string, unknown>[];
    expect(snapRows.length, 'QA account must have exactly one profile row').toBe(1);
    const snapshot = snapRows[0];
    console.log(
      `snapshot: onboarding_status=${String(snapshot.onboarding_status)}, marketplace_ready=${String(snapshot.marketplace_ready)}, profile_completion=${String(snapshot.profile_completion)}`,
    );

    let restoreDone = false;
    try {
      // ── 5. Drive the 8-step wizard (worker, public visibility) ───────────
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
      await page.getByRole('button', { name: /Finalizar/ }).click();

      // Completion: RPC + canonical re-read + navigation. The wizard unmounts.
      await expect(
        page.getByText('¿Qué tipo de cuenta necesitas?'),
        'wizard must close after Finalizar (canonical completion)',
      ).toBeHidden({ timeout: 30_000 });
      await page.waitForTimeout(5000); // past the 3s batch flush

      // ── 6. Canonical state must confirm finalization (server-side) ──────
      const canonRes = await fetch(profileUrl, { headers: restHeaders });
      expect(canonRes.ok, `canonical profile fetch failed: HTTP ${canonRes.status}`).toBeTruthy();
      const canonRows = (await canonRes.json()) as Record<string, unknown>[];
      const canonicalStatus = String(canonRows[0]?.onboarding_status ?? '');
      expect(
        COMPLETED_STATUSES.includes(canonicalStatus),
        `canonical onboarding_status must confirm completion (got ${canonicalStatus})`,
      ).toBeTruthy();
      console.log(`canonical onboarding_status after completion: ${canonicalStatus}`);

      // ── 7. Wire assertions: the closed onboarding funnel ─────────────────
      const decoded = decodeAll();
      const onboardingEvents = decoded.filter((e) =>
        ['onboarding_started', 'onboarding_step_reached', 'onboarding_completed'].includes(
          String(e.event),
        ),
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
      expect(completed, 'onboarding_completed exactly once').toHaveLength(1);
      // Completion must be the LAST funnel event on the wire (it is emitted
      // only after the canonical status confirmed finalization).
      const funnelOrder = onboardingEvents.map((e) => String(e.event));
      expect(funnelOrder[funnelOrder.length - 1], 'onboarding_completed must close the funnel').toBe(
        'onboarding_completed',
      );

      // Shared context: correlation_id, environment, app_version, identity.
      const correlationIds = new Set<string>();
      for (const e of onboardingEvents) {
        const p = (e.properties ?? {}) as Record<string, unknown>;
        expect(String(p.environment), 'every onboarding event must be environment=preview').toBe(
          'preview',
        );
        if (expectedVersion) {
          expect(
            String(p.app_version),
            'every onboarding event must carry the served SHA',
          ).toBe(expectedVersion);
        }
        expect(
          distinctIdOf(e),
          'every onboarding event must carry the canonical user UUID',
        ).toBe(identifiedId);
        const corr = String(p.correlation_id ?? '');
        expect(corr.length, 'every onboarding event must carry a correlation_id').toBeGreaterThan(0);
        correlationIds.add(corr);
        // PII / leakage: no email, no referral codes, no profile free-text
        // (title, location) leaking into analytics.
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
      // ── 8. Restore the QA account's wizard-writable columns ─────────────
      try {
        const restoreBody: Record<string, unknown> = {};
        for (const col of WIZARD_WRITABLE_COLUMNS) {
          if (col in snapshot) restoreBody[col] = snapshot[col];
        }
        const restoreRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify(restoreBody),
        });
        expect(
          restoreRes.ok,
          `profile restore failed: HTTP ${restoreRes.status}`,
        ).toBeTruthy();
        restoreDone = true;
        console.log(
          `restore: ${Object.keys(restoreBody).length} wizard-writable columns restored from snapshot (protected onboarding_status/marketplace_ready/profile_completion remain canonical: ${canonicalStatusOf(snapshot)})`,
        );
      } catch (err) {
        console.log(`restore FAILED — QA account left with wizard values: ${String(err)}`);
      }
      // Clear any residual wizard draft so a re-run starts at step 1.
      await page
        .evaluate((uid) => localStorage.removeItem(`pipingbox_onboarding_draft_${uid}`), identifiedId)
        .catch(() => undefined);
    }
    expect(restoreDone, 'restore must have succeeded').toBeTruthy();
  });
});

function canonicalStatusOf(snapshot: Record<string, unknown>): string {
  return String(snapshot.onboarding_status ?? '?');
}
