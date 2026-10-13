/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.3 (observación 4) — INTEGRATION test
 * against REAL Supabase QA PostgreSQL (project uqfbilyfpflrlthnyijj, synthetic
 * throwaway accounts only, zero PII).
 *
 * Requirement under proof (from the PR #68 review): an obsolete UPDATE that
 * was ABORTED on the client must not be able to overwrite a later write, EVEN
 * IF the server received the aborted request before processing the abort.
 *
 * Method: the empirical probe (2026-10-13, delaying proxy + password-grant
 * synthetic account) demonstrated the DEFECT against the unguarded write path
 * — the aborted stale PATCH committed AFTER the fresh write, leaving the row
 * with mixed fields. This spec replays the EXACT same wire-reorder scenario
 * through the REAL production guard (`ProfileWriteGuard` + real supabase-js
 * client + real PostgREST/PostgreSQL) and asserts the server now rejects the
 * stale write (0 rows under the profile_write_seq CAS predicate).
 *
 * Environment (QA only; the test skips without them):
 *   SUPABASE_URL=https://<qa-ref>.supabase.co
 *   SUPABASE_ANON_KEY=<qa anon key>
 *   SUPABASE_SERVICE_KEY=<qa service_role key — throwaway account admin only>
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import https from 'node:https';
import { ProfileWriteGuard, createSupabaseProfileUpdateAdapter } from '../app/frontend/src/lib/profileWriteGuard';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const PROFILES = 'app_14da0f1941_profiles';

const hasEnv = SUPABASE_URL && ANON_KEY && SERVICE_KEY;
test.skip(!hasEnv, 'requires SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (QA integration)');

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn: () => boolean, ms = 10_000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: condition never met');
    await sleep(20);
  }
};

/**
 * Local delaying proxy: forwards everything to the Supabase project but
 * HOLDS the first `holdBudget` PATCH requests until explicitly released —
 * full control over server-side delivery order (the network reorder).
 */
class HoldingProxy {
  private server: http.Server;
  private heldForward: Array<() => void> = [];
  private holdBudget: number;
  port: number;

  constructor(target: URL, holdBudget: number) {
    this.holdBudget = holdBudget;
    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('error', () => {});
      res.on('error', () => {});
      req.on('end', () => {
        const forward = () =>
          new Promise<void>((resolve) => {
            const preq = https.request(
              {
                method: req.method,
                hostname: target.hostname,
                path: req.url,
                headers: { ...req.headers, host: target.host },
              },
              (pres) => {
                if (res.destroyed) {
                  pres.resume();
                  resolve();
                  return;
                }
                res.writeHead(pres.statusCode, pres.headers);
                pres.pipe(res);
                pres.on('end', resolve);
              },
            );
            preq.on('error', () => resolve());
            preq.end(body);
          });
        if (req.method === 'PATCH' && this.heldForward.length < this.holdBudget) {
          this.heldForward.push(forward);
        } else {
          forward();
        }
      });
    });
  }

  get held(): number {
    return this.heldForward.length;
  }

  release(index: number): Promise<void> {
    const fwd = this.heldForward[index];
    if (!fwd) throw new Error(`no held request #${index}`);
    return fwd();
  }

  async start(): Promise<void> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as { port: number }).port;
  }

  close(): void {
    this.server.close();
  }
}

interface ThrowawayAccount {
  uid: string;
  access_token: string;
  refresh_token: string;
}

/** Synthetic throwaway account + own profile row (never a real user). */
async function createThrowawayAccount(): Promise<ThrowawayAccount> {
  const email = `pb-guard-int-${Date.now()}-${Math.floor(Math.random() * 1e4)}@pipingbox-test.example`;
  const password = 'PbGuardInt!2026x';

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const { id: uid } = (await createRes.json()) as { id: string };
  expect(uid).toBeTruthy();

  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = (await loginRes.json()) as { access_token: string; refresh_token: string };
  expect(session.access_token).toBeTruthy();

  // Equivalent starting state to ensureProfile: the row exists before the
  // wizard ever writes (the guard only updates existing rows).
  const rowRes = await fetch(`${SUPABASE_URL}/rest/v1/${PROFILES}?user_id=eq.${uid}&select=title`, {
    headers: adminHeaders,
  });
  const rows = (await rowRes.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${PROFILES}`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: uid, role: 'worker', title: 'baseline' }),
    });
    expect(ins.status).toBeLessThan(300);
  }

  return { uid, access_token: session.access_token, refresh_token: session.refresh_token };
}

async function deleteThrowawayAccount(uid: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${PROFILES}?user_id=eq.${uid}`, {
    method: 'DELETE',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
  });
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
}

async function readServerRow(uid: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${PROFILES}?user_id=eq.${uid}&select=title,skills,location,profile_write_seq`,
    { headers: adminHeaders },
  );
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** Real supabase-js client routed through the holding proxy. */
async function proxiedClient(proxyPort: number, account: ThrowawayAccount) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(`http://127.0.0.1:${proxyPort}`, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  expect(error).toBeNull();
  return client;
}

test.describe('ProfileWriteGuard — integration vs real PostgreSQL QA (wire reorder)', () => {
  test.setTimeout(120_000);

  test('an ABORTED stale UPDATE received by the server BEFORE the abort cannot overwrite the later write', async () => {
    const account = await createThrowawayAccount();
    const proxy = new HoldingProxy(new URL(SUPABASE_URL), 1);
    await proxy.start();
    try {
      const client = await proxiedClient(proxy.port, account);
      const guard = new ProfileWriteGuard(
        createSupabaseProfileUpdateAdapter(client, PROFILES, account.uid),
      );

      // Write #1 — stale autosave payload. Held at the proxy (already on the
      // wire); the client ABORTS it, exactly like ProfileWriteCoordinator on
      // supersede.
      const ctrlStale = new AbortController();
      const staleP = guard.update(
        { title: 'STALE-int-autosave', skills: ['stale'] },
        ctrlStale.signal,
      );
      await waitFor(() => proxy.held === 1);
      ctrlStale.abort();
      // supabase-js resolves (not rejects) aborted requests with an
      // AbortError payload — the guard surfaces it as a truthy error, never
      // as success. (The coordinator maps it to 'superseded' via
      // signal.aborted on its side.)
      const staleOutcome = await staleP;
      expect(staleOutcome.error).toBeTruthy();
      expect(staleOutcome.mode).toBe('cas');

      // Write #2 — fresh Finish payload. Passes the proxy normally and
      // commits BEFORE the server ever sees the stale request.
      const fresh = await guard.update(
        { title: 'FRESH-int-finish', skills: ['fresh'], location: 'Madrid, Spain' },
        new AbortController().signal,
      );
      expect(fresh.error).toBeNull();
      expect(fresh.mode).toBe('cas');

      // Release the held stale request: the server receives the ABORTED
      // write AFTER the fresh one. The CAS predicate must reject it.
      await proxy.release(0);
      await sleep(700); // let the reordered write commit (or not)

      const row = await readServerRow(account.uid);
      // THE assertion of observación 4: the fresh write survives.
      expect(row.title).toBe('FRESH-int-finish');
      expect(row.skills).toEqual(['fresh']);
      expect(row.location).toBe('Madrid, Spain');
      expect(row.profile_write_seq).toBe(2);
    } finally {
      proxy.close();
      await deleteThrowawayAccount(account.uid);
    }
  });

  test('two tabs racing on the same seq: the server arbitrates cleanly — the loser resyncs, retries and wins; no mixed row', async () => {
    const account = await createThrowawayAccount();
    const proxy = new HoldingProxy(new URL(SUPABASE_URL), 2);
    await proxy.start();
    try {
      // Two independent clients = two tabs; both read profile_write_seq = 0
      // and both issue nextSeq = 1.
      const clientA = await proxiedClient(proxy.port, account);
      const clientB = await proxiedClient(proxy.port, account);
      const guardA = new ProfileWriteGuard(
        createSupabaseProfileUpdateAdapter(clientA, PROFILES, account.uid),
      );
      const guardB = new ProfileWriteGuard(
        createSupabaseProfileUpdateAdapter(clientB, PROFILES, account.uid),
      );

      const pA = guardA.update(
        { title: 'TAB-A-payload', location: 'A city' },
        new AbortController().signal,
      );
      await waitFor(() => proxy.held === 1);
      const pB = guardB.update(
        { title: 'TAB-B-payload', location: 'B city' },
        new AbortController().signal,
      );
      await waitFor(() => proxy.held === 2);

      // Tab B's write reaches the server first and commits (seq 0 -> 1).
      await proxy.release(1);
      const outcomeB = await pB;
      expect(outcomeB.error).toBeNull();

      // Tab A's write arrives second: WHERE profile_write_seq < 1 matches 0
      // rows (NOT success) — guard A resyncs, retries once with seq=2 and
      // commits its full payload.
      await proxy.release(0);
      const outcomeA = await pA;
      expect(outcomeA.error).toBeNull();
      expect(outcomeA.mode).toBe('cas');

      // Clean last-writer-wins: every field from ONE write, never a mix of
      // A and B (the pre-fix defect left exactly such mixed rows).
      const row = await readServerRow(account.uid);
      expect(row.title).toBe('TAB-A-payload');
      expect(row.location).toBe('A city');
      expect(row.profile_write_seq).toBe(2);
    } finally {
      proxy.close();
      await deleteThrowawayAccount(account.uid);
    }
  });
});
