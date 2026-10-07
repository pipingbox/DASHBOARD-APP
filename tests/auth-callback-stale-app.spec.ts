import { expect, test } from '@playwright/test';
import {
  safeAuthNextPath,
} from '../app/frontend/src/lib/authFlow';
import {
  AUTH_CALLBACK_TIMEOUT_MS,
  AUTH_CALLBACK_FINAL_CHECK_MS,
  processAuthCallbackOnce,
  probeSession,
  resetAuthCallbackRun,
  type AuthCallbackDeps,
  type AuthCallbackResultLike,
} from '../app/frontend/src/lib/authCallbackFlow';
import {
  normalizeContaminatedPath,
  stripBoundaryFormatChars,
} from '../app/frontend/src/lib/pathNormalize';
import {
  clearReloadMarker,
  consumePendingUpdateEvent,
  fetchRemoteVersion,
  isMismatchPersistent,
  isVersionMismatch,
  parseVersionPayload,
  readReloadMarker,
  shouldCheckVersion,
  writePendingUpdateEvent,
  writeReloadMarker,
} from '../app/frontend/src/lib/appVersion';
import {
  buildEventProps,
  OBS_EVENT_NAMES,
} from '../app/frontend/src/lib/observability';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = { user: { id: 'u' } };
const NO_SESSION: AuthCallbackResultLike = { data: { session: null }, error: null };
const WITH_SESSION: AuthCallbackResultLike = { data: { session: SESSION }, error: null };
const FAILED: AuthCallbackResultLike = { data: { session: null }, error: { message: 'Invalid request: both auth code and code verifier should be provided' } };

/** Virtual clock: deterministic timers for the timeout paths. */
class ManualClock {
  private now = 0;
  private seq = 0;
  private tasks: { id: number; at: number; fn: () => void }[] = [];

  nowFn = () => this.now;

  setTimeoutFn = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.tasks.push({ id, at: this.now + Math.max(0, ms), fn });
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeoutFn = (id: ReturnType<typeof setTimeout>) => {
    this.tasks = this.tasks.filter((t) => t.id !== (id as unknown as number));
  };

  advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const due = this.tasks.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.now = due.at;
      this.tasks = this.tasks.filter((t) => t.id !== due.id);
      due.fn();
    }
    this.now = target;
  }
}

/** Flush pending microtasks after virtual timer callbacks fire. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Advance the virtual clock in small steps, flushing microtasks between
 * steps, until the promise settles (timers scheduled by microtask chains
 * become reachable). Never exceeds maxMs of virtual time.
 */
async function advanceUntilSettled<T>(promise: Promise<T>, clock: ManualClock, maxMs: number): Promise<T> {
  let settled = false;
  const guarded = promise.then((value) => {
    settled = true;
    return value;
  });
  for (let t = 0; t < maxMs && !settled; t += 250) {
    await flush();
    clock.advance(250);
  }
  for (let i = 0; i < 5 && !settled; i++) {
    await flush();
    clock.advance(250);
  }
  return guarded;
}

function makeDeps(overrides: Partial<AuthCallbackDeps> = {}): AuthCallbackDeps {
  return {
    getSession: async () => NO_SESSION,
    exchangeCodeForSession: async () => FAILED,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fase 2 — deterministic callback
// ---------------------------------------------------------------------------

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 — callback flow', () => {
  test.beforeEach(() => {
    resetAuthCallbackRun();
  });

  test('1. existing session navigates to /dashboard without any exchange', async () => {
    const exchange = async () => { throw new Error('must not be called'); };
    const outcome = await processAuthCallbackOnce(
      { nextPath: safeAuthNextPath(null), code: null, provider: 'google' },
      makeDeps({ getSession: async () => WITH_SESSION, exchangeCodeForSession: exchange }),
    );
    expect(outcome.status).toBe('navigating');
    if (outcome.status === 'navigating') {
      expect(outcome.nextPath).toBe('/dashboard');
      expect(outcome.exchanged).toBe(false);
    }
  });

  test('2. valid code is exchanged exactly once and navigates', async () => {
    let exchanges = 0;
    const deps = makeDeps({
      getSession: async () => NO_SESSION,
      exchangeCodeForSession: async () => {
        exchanges++;
        return WITH_SESSION;
      },
    });
    const outcome = await processAuthCallbackOnce(
      { nextPath: '/profile', code: 'abc123', provider: 'google' },
      deps,
    );
    expect(exchanges).toBe(1);
    expect(outcome.status).toBe('navigating');
    if (outcome.status === 'navigating') expect(outcome.exchanged).toBe(true);
  });

  test('3. StrictMode double-mount: zero duplicate exchanges, one shared outcome', async () => {
    let exchanges = 0;
    const deps = makeDeps({
      getSession: async () => NO_SESSION,
      exchangeCodeForSession: async () => {
        exchanges++;
        return WITH_SESSION;
      },
    });
    const input = { nextPath: '/dashboard', code: 'abc123', provider: 'google' };
    const [a, b] = await Promise.all([
      processAuthCallbackOnce(input, deps),
      processAuthCallbackOnce(input, deps),
    ]);
    expect(exchanges).toBe(1);
    expect(a).toBe(b); // same memoized execution
  });

  test('4. timeout with hanging getSession but session in final check still navigates', async () => {
    const clock = new ManualClock();
    let calls = 0;
    const deps = makeDeps({
      getSession: () => {
        calls++;
        if (calls === 1) return new Promise<AuthCallbackResultLike>(() => {}); // hangs forever
        return Promise.resolve(WITH_SESSION);
      },
      now: clock.nowFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    const promise = processAuthCallbackOnce(
      { nextPath: '/dashboard', code: null, provider: 'email' },
      deps,
    );
    const outcome = await advanceUntilSettled(promise, clock, AUTH_CALLBACK_TIMEOUT_MS + AUTH_CALLBACK_FINAL_CHECK_MS + 2000);
    expect(calls).toBe(2); // initial (hang) + final re-check
    expect(outcome.status).toBe('navigating');
    if (outcome.status === 'navigating') expect(outcome.recoveredOnTimeout).toBe(true);
  });

  test('5. timeout without session fails closed with a bounded duration (no infinite spinner)', async () => {
    const clock = new ManualClock();
    const deps = makeDeps({
      getSession: () => new Promise<AuthCallbackResultLike>(() => {}), // always hangs
      now: clock.nowFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    const promise = processAuthCallbackOnce(
      { nextPath: '/dashboard', code: null, provider: 'google' },
      deps,
    );
    const outcome = await advanceUntilSettled(promise, clock, AUTH_CALLBACK_TIMEOUT_MS + AUTH_CALLBACK_FINAL_CHECK_MS + 2000);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.errorCategory).toBe('callback_timeout');
      // Bounded: deadline + final check, never infinity.
      expect(outcome.durationMs).toBeLessThanOrEqual(
        AUTH_CALLBACK_TIMEOUT_MS + AUTH_CALLBACK_FINAL_CHECK_MS,
      );
    }
  });

  test('6. Supabase error maps to a closed category and leaks no internal message', async () => {
    const outcome = await processAuthCallbackOnce(
      { nextPath: '/dashboard', code: 'abc123', provider: 'email' },
      makeDeps({
        getSession: async () => NO_SESSION,
        exchangeCodeForSession: async () => FAILED,
      }),
    );
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.errorCategory).toBe('exchange_failed');
      // The outcome carries NO error message surface at all — the UI can
      // only render closed categories, never Supabase internals.
      expect(Object.keys(outcome).sort()).toEqual(['durationMs', 'errorCategory', 'provider', 'status']);
    }
  });

  test('6b. code consumed by the client itself still resolves via canonical re-check', async () => {
    // detectSessionInUrl race: exchange fails because the code was already
    // used, but a subsequent getSession finds the session.
    let calls = 0;
    const deps = makeDeps({
      getSession: () => {
        calls++;
        return Promise.resolve(calls >= 2 ? WITH_SESSION : NO_SESSION);
      },
      exchangeCodeForSession: async () => FAILED,
    });
    const outcome = await processAuthCallbackOnce(
      { nextPath: '/dashboard', code: 'abc123', provider: 'google' },
      deps,
    );
    expect(outcome.status).toBe('navigating');
  });

  test('6c. no code and no session fails as session_missing after a grace re-check', async () => {
    const clock = new ManualClock();
    const deps = makeDeps({
      getSession: async () => NO_SESSION,
      now: clock.nowFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    const promise = processAuthCallbackOnce(
      { nextPath: '/dashboard', code: null, provider: 'email' },
      deps,
    );
    const outcome = await (async () => {
      await flush();
      clock.advance(5000);
      await flush();
      return promise;
    })();
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') expect(outcome.errorCategory).toBe('session_missing');
  });

  test('probeSession resolves true only with a session (recovery recheck)', async () => {
    expect(await probeSession({ getSession: async () => WITH_SESSION })).toBe(true);
    expect(await probeSession({ getSession: async () => NO_SESSION })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// next allowlist
// ---------------------------------------------------------------------------

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 — next path allowlist', () => {
  test('7. external and dangerous next values are rejected', () => {
    expect(safeAuthNextPath('https://evil.example.com')).toBe('/dashboard');
    expect(safeAuthNextPath('//evil.example.com')).toBe('/dashboard');
    expect(safeAuthNextPath('javascript:alert(1)')).toBe('/dashboard');
    expect(safeAuthNextPath('mailto:x@y.test')).toBe('/dashboard');
    expect(safeAuthNextPath('/nonexistent-internal-route')).toBe('/dashboard');
    // Loop prevention: the callback must never bounce back to auth surfaces.
    expect(safeAuthNextPath('/auth/callback')).toBe('/dashboard');
    expect(safeAuthNextPath('/login')).toBe('/dashboard');
  });

  test('8. internal next values are allowed, query strings preserved', () => {
    expect(safeAuthNextPath('/profile')).toBe('/profile');
    expect(safeAuthNextPath('/profile?tab=skills')).toBe('/profile?tab=skills');
    expect(safeAuthNextPath('/dashboard')).toBe('/dashboard');
    expect(safeAuthNextPath('/company/jobs')).toBe('/company/jobs');
    expect(safeAuthNextPath(null)).toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — path normalization
// ---------------------------------------------------------------------------

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 — invisible character normalization', () => {
  test('9. exact incident regression: /profile%E2%81%A0 redirects to /profile', () => {
    // U+2060 WORD JOINER, percent-encoded exactly as WhatsApp delivered it.
    expect(normalizeContaminatedPath('/profile%E2%81%A0')).toBe('/profile');
    // And the raw decoded form too.
    expect(normalizeContaminatedPath('/profile\u2060')).toBe('/profile');
  });

  test('9b. other known routes with boundary format chars normalize', () => {
    expect(normalizeContaminatedPath('/dashboard\u2060')).toBe('/dashboard');
    expect(normalizeContaminatedPath('\u200B/jobs')).toBe('/jobs');
    expect(normalizeContaminatedPath('/community\uFEFF')).toBe('/community');
    expect(normalizeContaminatedPath('/tools/%E2%80%8Bflange-dimensions')).toBe('/tools/flange-dimensions');
  });

  test('10. arbitrary contaminated paths are NOT transformed into valid routes', () => {
    // Unknown route: stays a 404.
    expect(normalizeContaminatedPath('/totally-unknown\u2060')).toBeNull();
    expect(normalizeContaminatedPath('/foo%E2%81%A0/bar')).toBeNull();
    // Format character INSIDE a segment is never stripped — "/pro\u2060file"
    // is not "/profile".
    expect(normalizeContaminatedPath('/pro\u2060file')).toBeNull();
    // Already canonical: nothing to do.
    expect(normalizeContaminatedPath('/profile')).toBeNull();
    expect(normalizeContaminatedPath('/')).toBeNull();
    // Traversal attempts stay invalid.
    expect(normalizeContaminatedPath('/profile\u2060/../../etc')).toBeNull();
  });

  test('10b. stripBoundaryFormatChars only touches boundaries', () => {
    expect(stripBoundaryFormatChars('/profile\u2060')).toBe('/profile');
    expect(stripBoundaryFormatChars('\u2060/profile\u2060')).toBe('/profile');
    expect(stripBoundaryFormatChars('/a\u2060/b')).toBe('/a/b');
    expect(stripBoundaryFormatChars('/pro\u2060file')).toBe('/pro\u2060file');
  });
});

// ---------------------------------------------------------------------------
// Fase 3 — version checks
// ---------------------------------------------------------------------------

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 — version detection', () => {
  test('11. local = remote: no action', () => {
    expect(isVersionMismatch('51c3f1815b902a0502fbec2ef7bc930e4940eae3', '51c3f1815b902a0502fbec2ef7bc930e4940eae3')).toBe(false);
    expect(isVersionMismatch('', '51c3f18')).toBe(false);
    expect(isVersionMismatch('dev', '')).toBe(false);
  });

  test('12. local ≠ remote: mismatch (the Aldo ab34728 vs 51c3f18 case)', () => {
    expect(isVersionMismatch('ab34728ca08e8cd8730cffa59ab12a791dbdb8bd', '51c3f1815b902a0502fbec2ef7bc930e4940eae3')).toBe(true);
  });

  test('12b. remote payload parsing is closed — junk is rejected', () => {
    expect(parseVersionPayload('{"version":"51c3f1815b902a0502fbec2ef7bc930e4940eae3"}')?.version).toBe('51c3f1815b902a0502fbec2ef7bc930e4940eae3');
    expect(parseVersionPayload('{"version":"dev"}')?.version).toBe('dev');
    expect(parseVersionPayload('{"version":"https://evil.test"}')).toBeNull();
    expect(parseVersionPayload('{"version":"x@y.test"}')).toBeNull();
    expect(parseVersionPayload('{"version":""}')).toBeNull();
    expect(parseVersionPayload('not json')).toBeNull();
    expect(parseVersionPayload('{"other":1}')).toBeNull();
    expect(parseVersionPayload('{"version":{"a":1}}')).toBeNull();
  });

  test('12c. fetchRemoteVersion uses no-store and cache busting, fails open', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return new Response('{"version":"abc1234"}', { status: 200 });
    }) as unknown as typeof fetch;
    const payload = await fetchRemoteVersion(fakeFetch);
    expect(payload?.version).toBe('abc1234');
    expect(calls[0].url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(calls[0].init.cache).toBe('no-store');
    // Network failure → null (fail-open, no crash).
    const failing = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await fetchRemoteVersion(failing)).toBeNull();
  });

  test('13. user-initiated update writes one marker; no repeated auto reloads', () => {
    const now = 1_000_000;
    writeReloadMarker('51c3f1815b902a0502fbec2ef7bc930e4940eae3', now);
    const marker = readReloadMarker(now + 1_000);
    expect(marker).toEqual({ targetVersion: '51c3f1815b902a0502fbec2ef7bc930e4940eae3', at: now });
    // The ONLY storage touched is the single sessionStorage marker key.
    expect(Object.keys(sessionStorageStub.store)).toEqual(['pb_app_update_reload_marker']);
  });

  test('14. persistent mismatch after reload never reloads again — instructions instead', () => {
    const now = 2_000_000;
    writeReloadMarker('51c3f1815b902a0502fbec2ef7bc930e4940eae3', now);
    const marker = readReloadMarker(now + 5_000);
    expect(isMismatchPersistent(marker, '51c3f1815b902a0502fbec2ef7bc930e4940eae3')).toBe(true);
    // A different remote version (new deploy mid-recovery) is not "persistent".
    expect(isMismatchPersistent(marker, 'edf46d1c86518d1d9fdff7cd655bc80f4feae0a9')).toBe(false);
    expect(isMismatchPersistent(null, 'edf46d1c86518d1d9fdff7cd655bc80f4feae0a9')).toBe(false);
    // Successful update clears the marker.
    clearReloadMarker();
    expect(readReloadMarker(now + 6_000)).toBeNull();
  });

  test('14b. corrupt or stale markers are ignored and removed', () => {
    sessionStorageStub.store['pb_app_update_reload_marker'] = '{corrupt';
    expect(readReloadMarker(5_000_000)).toBeNull();
    expect(sessionStorageStub.store['pb_app_update_reload_marker']).toBeUndefined();
    sessionStorageStub.store['pb_app_update_reload_marker'] = JSON.stringify({ targetVersion: 'abc', at: 1 });
    expect(readReloadMarker(10_000_000_000)).toBeNull(); // too old
  });

  test('15. focus recovery re-checks with a 60s throttle', () => {
    expect(shouldCheckVersion(null, 1_000)).toBe(true);
    expect(shouldCheckVersion(1_000, 1_500)).toBe(false);
    expect(shouldCheckVersion(1_000, 61_000)).toBe(true);
  });

  test('16. auth session and drafts storage remain untouched by the update flow', () => {
    // The appVersion module references localStorage NOWHERE (structural
    // guarantee) and writes exactly one sessionStorage key. Simulate a
    // populated browser storage and run the full marker lifecycle.
    sessionStorageStub.store['sb-mwdauubztjxkbrefirbg-auth-token'] = '{"access_token":"x"}';
    sessionStorageStub.store['pipingbox_drafts'] = 'keep-me';
    writeReloadMarker('abc1234', 42);
    expect(sessionStorageStub.store['sb-mwdauubztjxkbrefirbg-auth-token']).toBe('{"access_token":"x"}');
    expect(sessionStorageStub.store['pipingbox_drafts']).toBe('keep-me');
    clearReloadMarker();
    expect(sessionStorageStub.store['pipingbox_drafts']).toBe('keep-me');
    expect(sessionStorageStub.store['pb_app_update_reload_marker']).toBeUndefined();
  });

  test('16b. pending update-event relay: written once, consumed exactly once', () => {
    // posthog-js cannot deliver an event captured right before
    // location.reload(): the request is relayed through sessionStorage and
    // emitted exactly once on the next boot.
    expect(consumePendingUpdateEvent()).toBe(false); // nothing pending
    expect(writePendingUpdateEvent()).toBe(true);
    expect(consumePendingUpdateEvent()).toBe(true); // first consume: true
    expect(consumePendingUpdateEvent()).toBe(false); // second consume: false
    expect(sessionStorageStub.store['pb_app_update_pending_event']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — observability: exact events, dedupe, zero PII
// ---------------------------------------------------------------------------

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 — observability', () => {
  test('17a. the seven new events exist in the closed taxonomy', () => {
    for (const name of [
      'auth_callback_started',
      'auth_callback_completed',
      'auth_callback_failed',
      'auth_callback_timeout',
      'stale_app_version_detected',
      'app_update_requested',
      'invalid_path_normalized',
    ]) {
      expect(OBS_EVENT_NAMES).toContain(name);
    }
  });

  test('17b. props are allowlisted and sanitized — no PII, no URL, no code', () => {
    const out = buildEventProps('auth_callback_failed', {
      route: '/auth/callback',
      correlation_id: 'corr-9f8e7d21',
      provider: 'google',
      duration_ms: 9100,
      error_category: 'callback_timeout',
      recovery_action: 'recheck_or_relogin',
      ...({
        email: 'aldo@evil.test',
        oauth_code: 'abc123',
        access_token: 'secret',
        url: 'https://pipingbox.com/auth/callback?code=SECRET',
        user_id: '11111111-1111-4111-8111-111111111111',
        contaminated_path: '/profile%E2%81%A0',
      } as never),
    });
    expect(out).toEqual({
      route: '/auth/callback',
      correlation_id: 'corr-9f8e7d21',
      provider: 'google',
      duration_ms: 9100,
      error_category: 'callback_timeout',
      recovery_action: 'recheck_or_relogin',
    });
  });

  test('17c. scoped error_category enums: auth vs document taxonomies', () => {
    // Auth callback categories accepted on auth events…
    expect(buildEventProps('auth_callback_failed', { error_category: 'session_missing' }).error_category).toBe('session_missing');
    expect(buildEventProps('auth_callback_timeout', { error_category: 'callback_timeout' }).error_category).toBe('callback_timeout');
    // …rejected on auth events…
    expect(buildEventProps('auth_callback_failed', { error_category: 'network' }).error_category).toBeUndefined();
    // …document categories still valid on document events (no regression)…
    expect(buildEventProps('cert_upload_failed', { error_category: 'no_bytes_started' }).error_category).toBe('no_bytes_started');
    expect(buildEventProps('document_upload_failed', { error_category: 'storage_5xx' }).error_category).toBe('storage_5xx');
    // …and auth categories rejected on document events.
    expect(buildEventProps('cert_upload_failed', { error_category: 'session_missing' }).error_category).toBeUndefined();
  });

  test('17d. target_version: valid SHAs pass through raw, junk is dropped', () => {
    expect(
      buildEventProps('stale_app_version_detected', {
        route: '/profile',
        target_version: '51c3f1815b902a0502fbec2ef7bc930e4940eae3',
      }),
    ).toEqual({ route: '/profile', target_version: '51c3f1815b902a0502fbec2ef7bc930e4940eae3' });
    expect(buildEventProps('stale_app_version_detected', { target_version: 'https://evil.test' }).target_version).toBeUndefined();
    expect(buildEventProps('stale_app_version_detected', { target_version: 'x@y.test' }).target_version).toBeUndefined();
  });

  test('17e. recovery_action and provider closed enums', () => {
    expect(buildEventProps('app_update_requested', { route: '/profile', recovery_action: 'update_app' }).recovery_action).toBe('update_app');
    expect(buildEventProps('app_update_requested', { recovery_action: 'destroy_everything' }).recovery_action).toBeUndefined();
    expect(buildEventProps('auth_callback_started', { provider: 'google' }).provider).toBe('google');
    expect(buildEventProps('auth_callback_started', { provider: 'facebook' }).provider).toBeUndefined();
  });

  test('17f. invalid_path_normalized carries ONLY the clean route', () => {
    expect(buildEventProps('invalid_path_normalized', { route_normalized: '/profile' })).toEqual({ route_normalized: '/profile' });
    const contaminated = buildEventProps('invalid_path_normalized', {
      route_normalized: '/profile\u2060',
    } as never);
    // The contaminated original must never survive sanitization as a route.
    expect(JSON.stringify(contaminated)).not.toContain('profile\\u2060');
  });

  test('17g. duration_ms bounds and dedupe surface', () => {
    expect(buildEventProps('auth_callback_completed', { duration_ms: 9100 }).duration_ms).toBe(9100);
    expect(buildEventProps('auth_callback_completed', { duration_ms: -1 }).duration_ms).toBeUndefined();
    expect(buildEventProps('auth_callback_completed', { duration_ms: 999999 }).duration_ms).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sessionStorage stub for Node (appVersion module guards all access)
// ---------------------------------------------------------------------------

const sessionStorageStub = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] ?? null;
  },
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

test.beforeEach(() => {
  sessionStorageStub.clear();
  (globalThis as Record<string, unknown>).sessionStorage = sessionStorageStub;
});

test.afterEach(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage;
});
