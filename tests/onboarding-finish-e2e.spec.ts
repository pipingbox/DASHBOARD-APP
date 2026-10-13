import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.2 (observación 3) — canonical
 * "Finish onboarding" E2E against QA.
 *
 * Previously BLOCKED: the complete-onboarding edge function was not deployed
 * in QA (404). This branch's QA environment now has it deployed (verified
 * 200 + canonical RPC transition), so the REAL finish path is exercised
 * end to end with a fresh synthetic account per run:
 *
 *   1. Walk the 8 wizard steps with minimal valid data.
 *   2. Click Finish — success ONLY after the profile write 2xx AND the
 *      edge function 2xx (no false success).
 *   3. Server-side verification with the user's own token:
 *      onboarding_status AUTH_ONLY → PROFILE_COMPLETED, marketplace_ready
 *      stays backend-computed (false — synthetic data scores < 50),
 *      profile_completion ≥ 30.
 *   4. Reload: the onboarding gate does not trap the user again.
 *   5. No completion-error state is shown.
 *
 * Requires (skipped otherwise):
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * The account is created via the admin API and deleted afterwards.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY);

const EMAIL = `pb-onb-fin-${Date.now()}@pipingbox-test.example`;
const PASSWORD = 'PbE2e-Fin!2026x';

/** Finish must resolve well inside this window (edge cold start included). */
const FINISH_BUDGET_MS = 60_000;

async function adminApi(
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  try {
    const res = await api.fetch(path, {
      method,
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      data: body,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* empty body (DELETE) */
    }
    return { status: res.status(), json };
  } finally {
    await api.dispose();
  }
}

async function userToken(): Promise<string> {
  const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  try {
    const res = await api.post('/auth/v1/token?grant_type=password', {
      headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(res.status(), 'synthetic finish account must authenticate').toBe(200);
    return ((await res.json()) as { access_token: string }).access_token;
  } finally {
    await api.dispose();
  }
}

test.describe('Onboarding finish (canonical) — PB-AUTH-LOCK-ONBOARDING-STALL-001 obs.3', () => {
  test.skip(!hasCreds, 'Requires Supabase QA config + SUPABASE_SERVICE_ROLE_KEY');

  test('finish 8/8 persists the canonical transition and survives reload', async ({ page }) => {
    test.setTimeout(240_000);

    // Fresh synthetic AUTH_ONLY account.
    const createRes = await adminApi('POST', '/auth/v1/admin/users', {
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    expect(createRes.status, 'admin user creation must succeed').toBe(200);
    const uid = (createRes.json as { id: string }).id;

    try {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('pipingbox_beta_dismissed', 'true');
        } catch {
          /* storage unavailable */
        }
      });

      // Login → the onboarding gate routes the incomplete profile to the wizard.
      await page.goto('/login');
      await page.locator('#email').fill(EMAIL);
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
      await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });
      if (!page.url().includes('/onboarding')) await page.goto('/onboarding');
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

      const next = page.getByRole('button', { name: /^next$/i });

      // Step 1 (account type, default worker) → Next.
      await expect(next).toBeVisible({ timeout: 30_000 });
      await next.click();

      // Step 2 (main role) → pick one → Next.
      await page.getByRole('button', { name: /^pipefitter$/i }).click();
      await next.click();

      // Step 3 (specialties) → pick one → Next.
      await page.getByRole('button', { name: /^piping$/i }).click();
      await next.click();

      // Step 4 (location) → country + city → Next.
      const textInputs = page.locator('input:visible');
      await textInputs.nth(0).fill('Spain');
      await textInputs.nth(1).fill('Madrid');
      await next.click();

      // Step 5 (availability) → pick one → Next.
      await page.getByRole('button', { name: /available now/i }).click();
      await next.click();

      // Step 6 (bio, optional) → Next.
      await next.click();

      // Step 7 (visibility) → public → Next.
      await page.getByText(/public profile/i).first().click();
      await next.click();

      // Step 8 (photo + Finish) — upload a synthetic avatar. The QA
      // canonical RPC scores avatar +10; together with title 5 + location 5
      // + skills 10 the profile reaches completion ≥ 30 → PROFILE_COMPLETED.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      await page.locator('input[type="file"]').setInputFiles({
        name: 'e2e-avatar.png',
        mimeType: 'image/png',
        buffer: png,
      });

      // Finish: success requires BOTH the profile write 2xx AND the
      // complete-onboarding edge 2xx — otherwise the wizard stays open with
      // the recoverable completion-error state.
      const edgeResponse = page.waitForResponse(
        (r) => r.url().includes('/functions/v1/complete-onboarding'),
        { timeout: FINISH_BUDGET_MS },
      );
      await page.getByRole('button', { name: /^finish$/i }).click();
      expect((await edgeResponse).status(), 'complete-onboarding edge must answer 2xx in QA').toBe(200);

      // The wizard exits to the dashboard; no completion-error state.
      await expect(page).toHaveURL(/\/dashboard/, { timeout: FINISH_BUDGET_MS });
      await expect(page.getByTestId('onboarding-completion-error')).toHaveCount(0);

      // Server-side canonical verification with the user's own token.
      const token = await userToken();
      const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
      try {
        const res = await api.get(
          '/rest/v1/app_14da0f1941_profiles?select=onboarding_status,marketplace_ready,profile_completion,title,skills,location,avatar_url',
          { headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` } },
        );
        expect(res.status()).toBe(200);
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        expect(rows.length).toBe(1);
        // Canonical terminal state: with a public profile the wizard ASKS
        // for marketplace readiness and the backend RPC decides — with
        // completion ≥ 30 + public visibility the QA RPC grants
        // MARKETPLACE_READY; otherwise PROFILE_COMPLETED. Both are valid
        // terminal states of the canonical transition (AUTH_ONLY is gone).
        expect(
          ['PROFILE_COMPLETED', 'MARKETPLACE_READY'],
          'finish must leave AUTH_ONLY behind via the canonical RPC',
        ).toContain(rows[0].onboarding_status);
        expect(
          rows[0].marketplace_ready,
          'marketplace_ready must be coherent with the terminal status',
        ).toBe(rows[0].onboarding_status === 'MARKETPLACE_READY');
        expect(
          rows[0].profile_completion as number,
          'RPC-computed completion must reflect the wizard data (≥30)',
        ).toBeGreaterThanOrEqual(30);
        expect(rows[0].title).toBe('Pipefitter');
        expect(rows[0].location).toBe('Madrid, Spain');
        expect(rows[0].avatar_url, 'avatar upload must persist its URL').toBeTruthy();
      } finally {
        await api.dispose();
      }

      // Reload: the gate must NOT trap a PROFILE_COMPLETED user again.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    } finally {
      await adminApi('DELETE', `/auth/v1/admin/users/${uid}`);
    }
  });
});
