import { test, expect, request as pwRequest, type BrowserContext } from '@playwright/test';

/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.2 (observación 2) — REAL two-tab E2E
 * for the cross-tab safety of the auth-lock bypass.
 *
 * Scenario (both tabs zombie-locked, session expired in BOTH):
 *   - `navigator.locks` is stubbed to hang forever in both tabs (the
 *     demonstrated Chromium zombie state), so every auth-lock acquisition
 *     falls through the ladder into the advisory bypass contention.
 *   - The stored session's `expires_at` is in the past, so BOTH tabs decide
 *     to refresh the SAME refresh token.
 *
 * Without rev.2 coordination both tabs would run their refresh
 * continuations: one succeeds (rotating the token) and the other's stale
 * refresh fails 400 → auth-js `_removeSession()` WIPES the fresh tokens —
 * "a later write overwrote newer tokens".
 *
 * Asserts:
 *   1. EXACTLY ONE refresh POST hits the network across both tabs.
 *   2. The losing tab surfaces the RECOVERABLE auth-unavailable state (or
 *      recovers directly) — never a silent logout.
 *   3. After the loser's retry, both tabs are authenticated.
 *   4. The session in localStorage was never wiped (access_token present in
 *      both tabs at the end).
 *
 * Requires: E2E_TEST_EMAIL / E2E_TEST_PASSWORD / VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY (skipped otherwise).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const hasCreds = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

const TEST_BUDGET_MS = 120_000;

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: unknown;
}

async function passwordGrant(): Promise<SessionPayload> {
  const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  try {
    const res = await api.post('/auth/v1/token?grant_type=password', {
      headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(res.status(), 'QA account must authenticate').toBe(200);
    return (await res.json()) as SessionPayload;
  } finally {
    await api.dispose();
  }
}

/** True when the page shows the recoverable auth-unavailable screen. */
async function isAuthUnavailable(page: import('@playwright/test').Page): Promise<boolean> {
  return page
    .getByRole('button', { name: /retry|reintentar/i })
    .isVisible()
    .catch(() => false);
}

/** True when the page reached ANY authenticated state (app shell or the
 * onboarding wizard the gate shows for incomplete profiles). */
async function isAuthenticatedUI(page: import('@playwright/test').Page): Promise<boolean> {
  if (/\/login/.test(page.url())) return false;
  const checks = [
    page.getByRole('button', { name: /sign out|cerrar sesi/i }).isVisible(),
    page.getByRole('link', { name: /dashboard/i }).first().isVisible(),
    page.getByRole('heading', { name: /set up your profile|configura tu perfil/i }).isVisible(),
  ];
  const results = await Promise.all(checks.map((c) => c.catch(() => false)));
  return results.some(Boolean);
}

async function waitForSettled(page: import('@playwright/test').Page, budgetMs: number): Promise<'authed' | 'unavailable'> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await isAuthUnavailable(page)) return 'unavailable';
    if (await isAuthenticatedUI(page)) return 'authed';
    await page.waitForTimeout(500);
  }
  throw new Error(`tab did not settle within ${budgetMs} ms (url=${page.url()})`);
}

test.describe('Auth lock — two zombie tabs, one expired session (obs.2)', () => {
  test.skip(!hasCreds, 'Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD + Supabase QA config');

  test('exactly one refresh across tabs, no session wipe, loser recovers via retry', async ({ browser }) => {
    test.setTimeout(240_000);

    const session = await passwordGrant();
    const ref = new URL(SUPABASE_URL!).host.split('.')[0];
    const storageKey = `sb-${ref}-auth-token`;
    const expiredSession = JSON.stringify({
      ...session,
      expires_at: Math.floor(Date.now() / 1000) - 60,
    });

    let refreshPosts = 0;
    const context = await browser.newContext();
    try {
      // Count refresh-token POSTs across BOTH tabs (shared context route).
      await context.route('**/auth/v1/token**', async (route) => {
        if ((route.request().postData() ?? '').includes('refresh_token')) refreshPosts += 1;
        await route.continue();
      });

      // Seed an EXPIRED session (once) and stub navigator.locks to hang
      // forever — the demonstrated zombie state — in every tab.
      await context.addInitScript(
        ({ storageKey: key, expiredSession: raw }) => {
          try {
            if (!localStorage.getItem('pb-lock-test-seeded')) {
              localStorage.setItem(key, raw);
              localStorage.setItem('pb-lock-test-seeded', '1');
            }
            localStorage.setItem('pipingbox_beta_dismissed', 'true');
          } catch {
            /* storage unavailable */
          }
          const zombie = {
            request: () => new Promise(() => {}),
            query: async () => ({ held: [], pending: [] }),
          };
          Object.defineProperty(window.navigator, 'locks', { value: zombie, configurable: true });
        },
        { storageKey, expiredSession },
      );

      // Open both tabs back-to-back: both bootstrap with the expired
      // session and a hanging lock facility at the same time.
      const tabA = await context.newPage();
      const tabB = await context.newPage();
      await Promise.all([tabA.goto('/profile'), tabB.goto('/profile')]);

      // Both tabs must settle: authenticated, or the RECOVERABLE
      // auth-unavailable state — never a silent redirect to /login.
      const [stateA, stateB] = await Promise.all([
        waitForSettled(tabA, TEST_BUDGET_MS),
        waitForSettled(tabB, TEST_BUDGET_MS),
      ]);
      expect([stateA, stateB]).toContain('authed');

      // The losing tab retries (full reload) and must authenticate WITHOUT
      // a second refresh POST — the winner's fresh tokens are reused.
      const loser = stateA === 'unavailable' ? tabA : stateB === 'unavailable' ? tabB : null;
      if (loser) {
        await loser.getByRole('button', { name: /retry|reintentar/i }).click();
        expect(await waitForSettled(loser, TEST_BUDGET_MS)).toBe('authed');
      }

      // 1) Exactly ONE refresh across both tabs — no concurrent rotation.
      expect(refreshPosts, 'only one tab may refresh the token').toBe(1);

      // 2) The session was never wiped: a readable session with an
      // access_token exists in BOTH tabs' shared storage.
      for (const tab of [tabA, tabB]) {
        const stored = await tab.evaluate((key) => {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { access_token?: string };
            return typeof parsed.access_token === 'string' && parsed.access_token.length > 0;
          } catch {
            return null;
          }
        }, storageKey);
        expect(stored, 'session must survive (no stale-continuation wipe)').toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  test('a FROZEN background peer never wedges the active tab: coordination completes, session survives, frozen tab recovers on resume', async ({ browser }) => {
    test.setTimeout(240_000);

    const session = await passwordGrant();
    const ref = new URL(SUPABASE_URL!).host.split('.')[0];
    const storageKey = `sb-${ref}-auth-token`;
    const expiredSession = JSON.stringify({
      ...session,
      expires_at: Math.floor(Date.now() / 1000) - 60,
    });

    let refreshPosts = 0;
    const context = await browser.newContext();
    try {
      await context.route('**/auth/v1/token**', async (route) => {
        if ((route.request().postData() ?? '').includes('refresh_token')) refreshPosts += 1;
        await route.continue();
      });

      await context.addInitScript(
        ({ storageKey: key, expiredSession: raw }) => {
          try {
            if (!localStorage.getItem('pb-lock-test-seeded')) {
              localStorage.setItem(key, raw);
              localStorage.setItem('pb-lock-test-seeded', '1');
            }
            localStorage.setItem('pipingbox_beta_dismissed', 'true');
          } catch {
            /* storage unavailable */
          }
          const zombie = {
            request: () => new Promise(() => {}),
            query: async () => ({ held: [], pending: [] }),
          };
          Object.defineProperty(window.navigator, 'locks', { value: zombie, configurable: true });
        },
        { storageKey, expiredSession },
      );

      // Tab A loads and is IMMEDIATELY frozen (Chrome page freeze: timers
      // suspended, no heartbeats, no claim echoes — the worst background
      // state a peer can be in).
      const tabA = await context.newPage();
      await tabA.goto('/profile', { waitUntil: 'commit' });
      const cdpA = await tabA.context().newCDPSession(tabA);
      await cdpA.send('Page.setWebLifecycleState', { state: 'frozen' });

      // The ACTIVE tab must coordinate and authenticate on its own — the
      // frozen peer cannot answer claims, so contention must complete
      // within its budget instead of wedging.
      const tabB = await context.newPage();
      await tabB.goto('/profile');
      expect(await waitForSettled(tabB, TEST_BUDGET_MS)).toBe('authed');

      // Sequential (never concurrent) refreshes only: the frozen tab did
      // nothing while suspended.
      expect(refreshPosts, 'only the active tab may refresh while the peer is frozen').toBe(1);

      // Resume the frozen tab: it reboots into the session the active tab
      // refreshed (shared localStorage) and must authenticate WITHOUT
      // another token rotation and WITHOUT a session wipe.
      await cdpA.send('Page.setWebLifecycleState', { state: 'active' });
      await tabA.reload({ waitUntil: 'domcontentloaded' });
      expect(await waitForSettled(tabA, TEST_BUDGET_MS)).toBe('authed');
      expect(refreshPosts, 'resume must reuse the fresh session, not re-refresh').toBe(1);

      const stored = await tabA.evaluate((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as { access_token?: string };
          return typeof parsed.access_token === 'string' && parsed.access_token.length > 0;
        } catch {
          return null;
        }
      }, storageKey);
      expect(stored, 'session must survive the freeze/resume cycle').toBe(true);
    } finally {
      await context.close();
    }
  });
});
