import { test, expect } from '@playwright/test';

/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 — unit tests for the bounded auth lock
 * (`app/frontend/src/lib/resilientAuthLock.ts`) and the timeout race helper
 * (`app/frontend/src/lib/withTimeout.ts`).
 *
 * Demonstrated incident (QA, synthetic accounts, Chromium): a
 * `navigator.locks` request queued by a document destroyed mid-flight leaves
 * a PERMANENT queue entry on `lock:sb-<ref>-auth-token`; both normal
 * acquisition and the auth-js `steal:true` recovery queue behind it, so
 * `supabase.auth.getSession()` never resolves. The app boot used to misread
 * that hang as "no session" (silent logout of real users) and TUS uploads
 * stalled at 0% before any watchdog was armed.
 *
 * Covered contract:
 *   - normal exclusive acquisition: unchanged semantics, no bypass telemetry
 *   - hung exclusive acquisition: steal recovery runs the operation
 *   - hung acquire + hung steal (zombie queue entry): LAST-RESORT bypass
 *     runs the operation exactly once and emits `auth_lock_bypassed`
 *   - run-once guarantee: a late grant of the abandoned request must never
 *     execute the operation a second time (token-refresh safety)
 *   - LockManager unavailable: no-op fallback (auth-js parity)
 *   - withTimeout: resolves with value before deadline; reports timedOut on
 *     hang AND on rejection; never rejects
 *
 * No browser, no network: LockManager, timers and telemetry are injected.
 */

import {
  createResilientAuthLock,
  AUTH_LOCK_STEAL_TIMEOUT_MS,
} from '../app/frontend/src/lib/resilientAuthLock';
import { withTimeout } from '../app/frontend/src/lib/withTimeout';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type LockCallback = (lock: { name: string } | null) => Promise<unknown>;

interface RequestRecord {
  name: string;
  options: { mode: string; signal?: AbortSignal; steal?: boolean };
}

/** A LockManager that grants immediately (healthy browser). */
function healthyLocks(calls: RequestRecord[]) {
  return {
    async request(
      name: string,
      options: { mode: 'exclusive'; signal?: AbortSignal; steal?: boolean },
      cb: LockCallback,
    ) {
      calls.push({ name, options });
      return cb({ name });
    },
  };
}

/**
 * A LockManager whose exclusive acquisition never settles unless aborted
 * (queues forever), exactly like the zombie queue entry; steal requests are
 * served immediately (spec preemption path).
 */
function hungAcquireLocks(calls: RequestRecord[]) {
  return {
    request(
      name: string,
      options: { mode: 'exclusive'; signal?: AbortSignal; steal?: boolean },
      cb: LockCallback,
    ) {
      calls.push({ name, options });
      if (options.steal) return cb({ name });
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    },
  };
}

/** Both exclusive and steal requests queue forever: the full zombie state. */
function fullyHungLocks(calls: RequestRecord[], grants: Array<() => void>) {
  return {
    request(
      name: string,
      options: { mode: 'exclusive'; signal?: AbortSignal; steal?: boolean },
      cb: LockCallback,
    ) {
      calls.push({ name, options });
      return new Promise((resolve, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }
        // Let tests simulate a LATE browser grant to prove run-once safety.
        grants.push(() => {
          void cb({ name }).then(resolve);
        });
      });
    },
  };
}

/**
 * The PRODUCTION zombie shape (Chromium, demonstrated in QA): the queue
 * entry left by a destroyed document never settles — the AbortSignal is
 * ignored too. This is why auth-js 2.106's own acquire-timeout recovery
 * (which relies on the signal + its own timer rejecting `_acquireLock`)
 * still ends in a hung steal, and why every step of the resilient lock is
 * bounded by an independent timer race.
 */
function abortProofZombieLocks(calls: RequestRecord[], grants: Array<() => void>) {
  return {
    request(
      name: string,
      options: { mode: 'exclusive'; signal?: AbortSignal; steal?: boolean },
      cb: LockCallback,
    ) {
      calls.push({ name, options });
      return new Promise((resolve) => {
        grants.push(() => {
          void cb({ name }).then(resolve);
        });
      });
    },
  };
}

function isolatedCrossTab() {
  return {
    crossTabFactory: () => ({
      runWithHolder: <T>(fn: () => Promise<T>) => fn(),
      waitForHolder: async () => ({ hadHolder: false, remoteAlive: false, localAlive: false, cleared: true }),
      contendBypass: async () => 'run' as const,
      close: () => {},
    }),
  };
}

function makeDeps(locks: unknown, bypassed: string[]) {
  return {
    locks: locks as never,
    onBypass: (name: string) => {
      bypassed.push(name);
    },
    // Isolated cross-tab coordinator: no BroadcastChannel, no holders — the
    // single-tab ladder behavior under test stays identical to rev.1.
    // Cross-tab coordination itself is covered by auth-lock-cross-tab.spec.
    ...isolatedCrossTab(),
  };
}

// ---------------------------------------------------------------------------
// resilientAuthLock
// ---------------------------------------------------------------------------

test.describe('resilientAuthLock — bounded cross-tab auth lock', () => {
  test('healthy LockManager: fn runs once inside the exclusive lock, no bypass', async () => {
    const calls: RequestRecord[] = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(healthyLocks(calls), bypassed));

    let runs = 0;
    const result = await lock('lock:sb-ref-auth-token', 50, async () => {
      runs += 1;
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(runs).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].options.mode).toBe('exclusive');
    expect(bypassed).toHaveLength(0);
  });

  test('hung exclusive acquisition recovers via steal (auth-js parity, bounded)', async () => {
    const calls: RequestRecord[] = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(hungAcquireLocks(calls), bypassed));

    const result = await lock('lock:sb-ref-auth-token', 20, async () => 'recovered');

    expect(result).toBe('recovered');
    expect(calls).toHaveLength(2);
    expect(calls[0].options.steal).toBeUndefined();
    expect(calls[1].options.steal).toBe(true);
    expect(bypassed).toHaveLength(0);
  });

  test('zombie queue entry (acquire + steal hang): bypass runs fn once and reports it', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(fullyHungLocks(calls, grants), bypassed));

    let runs = 0;
    const result = await lock('lock:sb-ref-auth-token', 20, async () => {
      runs += 1;
      return 'bypassed';
    });

    expect(result).toBe('bypassed');
    expect(runs).toBe(1);
    expect(calls).toHaveLength(2);
    expect(bypassed).toEqual(['lock:sb-ref-auth-token']);
  });

  test('abort-proof zombie (production shape, signal ignored): independent timers still bound it', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(abortProofZombieLocks(calls, grants), bypassed));

    const t0 = Date.now();
    let runs = 0;
    const result = await lock('lock:sb-ref-auth-token', 30, async () => {
      runs += 1;
      return 'recovered';
    });

    expect(result).toBe('recovered');
    expect(runs).toBe(1);
    // 30 ms acquire + 3 s steal cap — the abort being ignored must not matter.
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(bypassed).toEqual(['lock:sb-ref-auth-token']);
  });

  test('late grant DURING the bypass: fn still runs once and the caller gets its result', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(abortProofZombieLocks(calls, grants), bypassed));

    let runs = 0;
    const lockPromise = lock('lock:sb-ref-auth-token', 20, async () => {
      runs += 1;
      // Simulate a slow token refresh: the browser grants the queued steal
      // request while the bypass path is already running fn.
      setTimeout(() => grants.forEach((g) => g()), 10);
      await new Promise((r) => setTimeout(r, 60));
      return 'rotated-token';
    });

    const result = await lockPromise;
    expect(result).toBe('rotated-token');
    await new Promise((r) => setTimeout(r, 80));
    expect(runs).toBe(1);
    expect(bypassed).toHaveLength(1);
  });

  test('circuit breaker: nested acquisitions bypass instantly after the first bypass (the QA blow-up)', async () => {
    // Demonstrated in QA: getSession's own ladder (~8 s) resolved, but the
    // NESTED token refresh paid another ~8 s and the 12 s app bootstrap
    // deadline fired. After the fix, the second call must be ~instant.
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(abortProofZombieLocks(calls, grants), bypassed));

    const first = await lock('lock:sb-ref-auth-token', 20, async () => 'first');
    expect(first).toBe('first');
    expect(bypassed).toHaveLength(1);

    const t0 = Date.now();
    const second = await lock('lock:sb-ref-auth-token', 20, async () => 'second');
    const third = await lock('lock:sb-ref-auth-token', 20, async () => 'third');
    expect(second).toBe('second');
    expect(third).toBe('third');
    expect(Date.now() - t0).toBeLessThan(200);
    // Telemetry fires on the state transition only, not per instant bypass.
    expect(bypassed).toHaveLength(1);
    // No new lock requests were queued for the poisoned calls.
    expect(calls).toHaveLength(2);
  });

  test('circuit breaker: after the cooldown a healthy probe closes the circuit', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    let now = 1_000_000;
    let hung = true;
    const dynamicLocks = {
      request(name: string, options: RequestRecord['options'], cb: LockCallback) {
        calls.push({ name, options });
        if (!hung) return cb({ name });
        return new Promise((resolve) => {
          grants.push(() => void cb({ name }).then(resolve));
        });
      },
    };
    const lock = createResilientAuthLock({
      locks: dynamicLocks as never,
      onBypass: (n) => bypassed.push(n),
      nowFn: () => now,
      poisonCooldownMs: 60_000,
      ...isolatedCrossTab(),
    });

    await lock('lock:sb-ref-auth-token', 20, async () => 'poisoned');
    expect(bypassed).toHaveLength(1);

    // Inside the cooldown: instant bypass.
    now += 30_000;
    await lock('lock:sb-ref-auth-token', 20, async () => 'instant');
    expect(calls).toHaveLength(2);

    // After the cooldown, the browser recovered: full probe, normal path.
    now += 31_000;
    hung = false;
    const t0 = Date.now();
    const result = await lock('lock:sb-ref-auth-token', 20, async () => 'healthy-again');
    expect(result).toBe('healthy-again');
    expect(Date.now() - t0).toBeLessThan(200);
    expect(calls).toHaveLength(3);

    // Circuit closed: subsequent calls use the lock normally, no more bypass.
    await lock('lock:sb-ref-auth-token', 20, async () => 'normal');
    expect(bypassed).toHaveLength(1);
    expect(calls).toHaveLength(4);
  });

  test('circuit breaker: a still-hung re-probe re-poisons the lock', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    let now = 1_000_000;
    const lock = createResilientAuthLock({
      locks: abortProofZombieLocks(calls, grants) as never,
      onBypass: (n) => bypassed.push(n),
      nowFn: () => now,
      poisonCooldownMs: 60_000,
      ...isolatedCrossTab(),
    });

    await lock('lock:sb-ref-auth-token', 20, async () => 'first');
    now += 61_000; // cooldown expired, still zombie
    await lock('lock:sb-ref-auth-token', 20, async () => 're-probed');
    expect(bypassed).toHaveLength(2);

    const t0 = Date.now();
    await lock('lock:sb-ref-auth-token', 20, async () => 'instant-again');
    expect(Date.now() - t0).toBeLessThan(200);
  });

  test('run-once: a LATE grant of the abandoned request never re-runs fn', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(fullyHungLocks(calls, grants), bypassed));

    let runs = 0;
    const result = await lock('lock:sb-ref-auth-token', 20, async () => {
      runs += 1;
      return 'token-refresh';
    });
    expect(result).toBe('token-refresh');
    expect(runs).toBe(1);

    // The browser finally serves the queued steal request (or the aborted
    // acquire somehow settles): fn must NOT execute again — a duplicated
    // token refresh would rotate credentials underneath a live session.
    for (const grant of grants) grant();
    await new Promise((r) => setTimeout(r, 50));
    expect(runs).toBe(1);
  });

  test('no LockManager in the environment: no-op fallback (auth-js parity)', async () => {
    const bypassed: string[] = [];
    const lock = createResilientAuthLock({ locks: undefined, onBypass: (n) => bypassed.push(n) });

    let runs = 0;
    const result = await lock('lock:sb-ref-auth-token', 20, async () => {
      runs += 1;
      return 42;
    });

    expect(result).toBe(42);
    expect(runs).toBe(1);
    expect(bypassed).toHaveLength(0);
  });

  test('non-positive acquireTimeout falls back to a sane default and still bounds the wait', async () => {
    const calls: RequestRecord[] = [];
    const grants: Array<() => void> = [];
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(fullyHungLocks(calls, grants), bypassed));

    const t0 = Date.now();
    const result = await lock('lock:sb-ref-auth-token', 0, async () => 'bounded');
    // Default acquire (5 s) + steal cap (3 s): must resolve well under 12 s.
    expect(Date.now() - t0).toBeLessThan(12_000);
    expect(result).toBe('bounded');
    expect(bypassed).toHaveLength(1);
  });

  test('LockManager throws synchronously (SecurityError in sandboxed iframe): bypasses, fn runs', async () => {
    const calls: RequestRecord[] = [];
    const brokenLocks = {
      request(name: string, options: RequestRecord['options']) {
        calls.push({ name, options });
        if (options.steal) return new Promise(() => {});
        return Promise.reject(Object.assign(new Error('denied'), { name: 'SecurityError' }));
      },
    };
    const bypassed: string[] = [];
    const lock = createResilientAuthLock(makeDeps(brokenLocks, bypassed));

    const result = await lock('lock:sb-ref-auth-token', 20, async () => 'ran');
    expect(result).toBe('ran');
    expect(bypassed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

test.describe('withTimeout — bounded critical operations', () => {
  test('resolves with the value when the promise settles before the deadline', async () => {
    const race = await withTimeout(Promise.resolve('done'), 50);
    expect(race.timedOut).toBe(false);
    expect(race.value).toBe('done');
  });

  test('reports timedOut when the promise never settles (zombie lock shape)', async () => {
    const race = await withTimeout(new Promise(() => {}), 20);
    expect(race.timedOut).toBe(true);
    expect(race.value).toBeUndefined();
  });

  test('a rejection is surfaced as an uncompleted operation, never as a throw', async () => {
    const race = await withTimeout(Promise.reject(new Error('boom')), 50);
    expect(race.timedOut).toBe(true);
    expect(race.value).toBeUndefined();
  });

  test('a late settlement after the deadline is ignored (single resolution)', async () => {
    let resolveLate!: (v: string) => void;
    const slow = new Promise<string>((r) => {
      resolveLate = r;
    });
    const racePromise = withTimeout(slow, 20);
    const race = await racePromise;
    expect(race.timedOut).toBe(true);
    resolveLate('too-late');
    await new Promise((r) => setTimeout(r, 10));
    // Still the original single resolution; no unhandled rejection, no crash.
    await expect(racePromise).resolves.toEqual({ value: undefined, timedOut: true });
  });

  test('steal cap constant stays below every caller deadline (defense-in-depth budget)', () => {
    // Callers budget 8 s for the lock ladder (5 s acquire + 3 s steal) and
    // place their own deadlines at 12 s+. Guard the constant from drifting.
    expect(AUTH_LOCK_STEAL_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });
});
