/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 — bounded auth lock with circuit breaker.
 *
 * Demonstrated failure (QA, synthetic accounts, Chromium): a
 * `navigator.locks` request queued by a document that is destroyed mid-flight
 * (popup of a signed URL closed, full-page navigation while auth work is in
 * flight) can leave a PERMANENT queue entry that blocks every later
 * acquisition of `lock:sb-<ref>-auth-token`. Even the auth-js 2.106 recovery
 * (5 s acquire timeout + `steal: true`) hangs, because the steal request
 * itself queues behind the zombie entry. `supabase.auth.getSession()` then
 * never resolves: the app boot races it against a timeout and misreads the
 * hang as "no session" (silent logout), uploads stall at 0 % before any
 * watchdog is armed, and onboarding saves wait forever.
 *
 * This lock keeps the normal protection fully intact and adds a bounded
 * ladder:
 *
 *   1. EXCLUSIVE acquire with an abortable deadline (the auth-js supplied
 *      `acquireTimeout`, 5 s by default). Normal path: unchanged semantics.
 *   2. STEAL recovery (spec-compliant preemption of a genuinely orphaned
 *      holder), itself bounded by a hard race, because the zombie entry can
 *      block steal requests too.
 *   3. LAST-RESORT BYPASS: run the operation WITHOUT the lock, guarded by a
 *      run-once flag so the still-queued request can never execute `fn` a
 *      second time if it is eventually granted. Emits `auth_lock_bypassed`
 *      telemetry (no PII).
 *
 * CIRCUIT BREAKER (memory): the zombie state is permanent for the tab's
 * lifetime, and auth operations nest (getSession → token refresh acquires
 * the lock again). Without memory, every nested acquisition would pay the
 * full ~8 s ladder again and blow past the app's bootstrap deadline (12 s) —
 * demonstrated in QA: the first bypass worked, but the SECOND lock call
 * (refresh inside getSession) paid another 8 s and the boot timed out. Once
 * a bypass fires, the lock name is marked POISONED for a cooldown window:
 * subsequent acquisitions bypass immediately (run-once still applies), and
 * the first acquisition after the cooldown re-probes the full ladder; a
 * successful acquisition closes the circuit and restores normal locking.
 *
 * Security posture: the cross-tab exclusive lock remains the normal path —
 * nothing is disabled. The bypass only fires after the browser's lock
 * facility has proven itself unresponsive beyond two deadlines, i.e. in the
 * exact state where the alternative is a permanently bricked tab. Token
 * storage is never read directly; every session decision still goes through
 * supabase-js.
 */

import { trackEvent, getCorrelationId } from './observability';

/** Hard cap for the steal attempt (step 2) before bypassing the lock. */
export const AUTH_LOCK_STEAL_TIMEOUT_MS = 3_000;
/** Fallback acquire deadline when the caller passes a non-positive timeout. */
export const AUTH_LOCK_DEFAULT_ACQUIRE_MS = 5_000;
/**
 * How long a lock name stays poisoned after a bypass (instant bypass window)
 * before the next acquisition re-probes the full ladder. The zombie state is
 * permanent per tab; the re-probe exists for browsers that flush the queue.
 */
export const AUTH_LOCK_POISON_COOLDOWN_MS = 60_000;

export interface LockManagerLike {
  request: (
    name: string,
    options: { mode: 'exclusive'; signal?: AbortSignal; steal?: boolean },
    callback: (lock: { name: string } | null) => Promise<unknown>,
  ) => Promise<unknown>;
}

export interface ResilientAuthLockDeps {
  locks?: LockManagerLike;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  onBypass?: (name: string) => void;
  /** Injectable clock (ms epoch) for deterministic circuit-breaker tests. */
  nowFn?: () => number;
  /** Cooldown override (ms) for tests. */
  poisonCooldownMs?: number;
}

function defaultOnBypass(name: string): void {
  try {
    trackEvent('auth_lock_bypassed', {
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      correlation_id: getCorrelationId(),
    });
  } catch {
    /* telemetry must never break auth */
  }
  try {
    console.warn(
      `[auth-lock] "${name}" unresponsive beyond acquire+steal deadlines; ` +
        'running this auth operation without the cross-tab lock (zombie lock recovery).',
    );
  } catch {
    /* noop */
  }
}

/**
 * Create a supabase-js compatible `lock(name, acquireTimeout, fn)`.
 * Deps are injectable for deterministic unit tests.
 */
export function createResilientAuthLock(deps: ResilientAuthLockDeps = {}) {
  const locks =
    deps.locks ??
    (typeof navigator !== 'undefined' && navigator.locks
      ? (navigator.locks as unknown as LockManagerLike)
      : undefined);
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((id: unknown) => clearTimeout(id as never));
  const onBypass = deps.onBypass ?? defaultOnBypass;
  const nowFn = deps.nowFn ?? (() => Date.now());
  const poisonCooldownMs = deps.poisonCooldownMs ?? AUTH_LOCK_POISON_COOLDOWN_MS;

  // Circuit breaker state, per lock name. A poisoned lock bypasses instantly
  // until `poisonedUntil`; the first acquisition after that re-probes the
  // full ladder and either re-poisons or closes the circuit.
  const poisonedUntilByName = new Map<string, number>();

  return async function resilientAuthLock<T>(
    name: string,
    acquireTimeout: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Environment without the LockManager API: auth-js would use a no-op
    // lock; mirror that (single-tab assumption is the platform fallback).
    if (!locks) return fn();

    // -- Step 0: circuit breaker ------------------------------------------
    // The zombie state is permanent for the tab's lifetime and auth
    // operations NEST (getSession → refresh re-acquires the lock). Paying
    // the ~8 s ladder per nested call blows past the app's bootstrap
    // deadline; bypass instantly while poisoned instead.
    const poisonedUntil = poisonedUntilByName.get(name) ?? 0;
    if (poisonedUntil > nowFn()) {
      return fn();
    }

    // Run-once guard + shared result: the abandoned acquire/steal request
    // may STILL be granted later by the browser. `fn` (e.g. a token refresh)
    // must execute at most once, and whichever path observed the start must
    // be able to await the SAME result — including the bypass path when a
    // late grant won the race microseconds earlier.
    let fnStarted = false;
    let fnPromise: Promise<T | undefined> | null = null;
    const runOnce = (): Promise<T | undefined> => {
      if (fnStarted) return fnPromise ?? Promise.resolve(undefined);
      fnStarted = true;
      fnPromise = (async () => fn())();
      // Prevent an unhandled-rejection if only an abandoned late-grant path
      // remains attached when fn rejects.
      fnPromise.catch(() => {});
      return fnPromise;
    };

    const acquireMs = acquireTimeout > 0 ? acquireTimeout : AUTH_LOCK_DEFAULT_ACQUIRE_MS;

    // -- Step 1: bounded exclusive acquire --------------------------------
    // The AbortSignal alone is NOT a sufficient bound: in the demonstrated
    // zombie state (request queued by a document destroyed mid-flight),
    // Chromium never settles the poisoned queue entry — not even on abort.
    // Race the attempt against an independent timer, exactly like auth-js
    // does for its own acquire timeout.
    const ac = new AbortController();
    const acquireAttempt = (async (): Promise<{ done: boolean; value?: T }> => {
      try {
        const value = (await locks.request(name, { mode: 'exclusive', signal: ac.signal }, async (lock) => {
          if (!lock) return runOnce(); // non-spec browser: run unlocked
          return runOnce();
        })) as T | undefined;
        return fnStarted ? { done: true, value } : { done: false };
      } catch {
        // AbortError (own deadline) or a lock-facility error (SecurityError
        // in sandboxed iframes): both mean "acquire did not happen".
        return { done: false };
      }
    })();

    const step1Race = await new Promise<{ done: boolean; value?: T; hung: boolean }>((resolve) => {
      const acquireTimer = setTimeoutFn(() => {
        try {
          ac.abort();
        } catch {
          /* noop */
        }
        resolve({ done: false, hung: true });
      }, acquireMs);
      acquireAttempt.then((r) => {
        clearTimeoutFn(acquireTimer);
        resolve({ ...r, hung: false });
      });
    });

    if (!step1Race.hung && step1Race.done) {
      // A successful acquisition after a cooldown re-probe closes the
      // circuit: the browser's lock facility is healthy again.
      if (poisonedUntilByName.has(name)) poisonedUntilByName.delete(name);
      return step1Race.value as T;
    }
    if (fnStarted) return (await runOnce()) as T;

    // -- Step 2: bounded steal --------------------------------------------
    // Spec-compliant preemption of a genuinely orphaned holder. The steal
    // request itself can queue behind the zombie entry, so it is raced
    // against a hard cap too.
    const stealAttempt = (async (): Promise<{ done: boolean; value?: T }> => {
      try {
        const value = (await locks.request(name, { mode: 'exclusive', steal: true }, async (lock) => {
          if (!lock) return runOnce();
          return runOnce();
        })) as T | undefined;
        return fnStarted ? { done: true, value } : { done: false };
      } catch {
        return { done: false };
      }
    })();

    const stealRace = await new Promise<{ done: boolean; value?: T; hung: boolean }>((resolve) => {
      const stealTimer = setTimeoutFn(() => resolve({ done: false, hung: true }), AUTH_LOCK_STEAL_TIMEOUT_MS);
      stealAttempt.then((r) => {
        clearTimeoutFn(stealTimer);
        resolve({ ...r, hung: false });
      });
    });

    if (!stealRace.hung && stealRace.done) return stealRace.value as T;
    if (fnStarted) return (await runOnce()) as T;

    // -- Step 3: last-resort bypass ---------------------------------------
    // runOnce (NOT fn directly): a late grant of the abandoned steal/acquire
    // request must never execute fn a second time; if it already did, we
    // await that same result. Poison the name so NESTED acquisitions (e.g.
    // the token refresh inside getSession) bypass instantly instead of
    // paying the ladder again.
    poisonedUntilByName.set(name, nowFn() + poisonCooldownMs);
    onBypass(name);
    return (await runOnce()) as T;
  };
}

/** Shared production instance (single telemetry/consistency point). */
export const resilientAuthLock = createResilientAuthLock();
