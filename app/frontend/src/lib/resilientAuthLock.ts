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

import { AuthRetryableFetchError } from '@supabase/auth-js';
import { trackEvent, getCorrelationId } from './observability';
import {
  createCrossTabLock,
  HOLDER_WAIT_MS,
  BYPASS_CONTENTION_BUDGET_MS,
  type CrossTabLock,
} from './authLockCrossTab';

/** Hard cap for the steal attempt (step 2) before bypassing the lock. */
export const AUTH_LOCK_STEAL_TIMEOUT_MS = 3_000;
/** Fallback acquire deadline when the caller passes a non-positive timeout. */
export const AUTH_LOCK_DEFAULT_ACQUIRE_MS = 5_000;
/** Short re-acquire probe after a legitimate holder released the lock. */
export const AUTH_LOCK_HOLDER_RETRY_MS = 1_000;
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
  /**
   * Cross-tab coordination factory (heartbeat + steal guard + bypass
   * contention). Injectable for tests; defaults to BroadcastChannel-backed
   * coordination using the same injected timers/clock.
   */
  crossTabFactory?: (lockName: string) => CrossTabLock;
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

  // Cross-tab coordinators, one per lock name (heartbeat + contention).
  const crossTabByName = new Map<string, CrossTabLock>();
  const crossTabFor = (name: string): CrossTabLock => {
    let ct = crossTabByName.get(name);
    if (!ct) {
      ct =
        deps.crossTabFactory?.(name) ??
        createCrossTabLock(name, {
          setTimeoutFn: deps.setTimeoutFn,
          clearTimeoutFn: deps.clearTimeoutFn,
          nowFn: deps.nowFn,
        });
      crossTabByName.set(name, ct);
    }
    return ct;
  };

  /**
   * Bypass execution guarded by cross-tab contention (observación 2): only
   * ONE tab runs its continuation; a superseded tab throws a synthetic
   * AuthRetryableFetchError so auth-js treats the attempt as retryable and
   * NEVER reacts with `_removeSession()` — a stale continuation (e.g. a
   * refresh holding an already-rotated token) can therefore never wipe the
   * newer tokens written by the winning tab.
   */
  const runBypass = async <T>(name: string, run: () => Promise<T | undefined>): Promise<T> => {
    const ct = crossTabFor(name);
    const verdict = await ct.contendBypass(BYPASS_CONTENTION_BUDGET_MS);
    if (verdict === 'superseded') {
      throw new AuthRetryableFetchError(
        'pb-auth-lock: superseded by a concurrent tab (its fresher auth result wins)',
        0,
      );
    }
    if (verdict === 'uncoordinated') {
      // FAIL CLOSED (rev.3, observación 3): without BroadcastChannel there is
      // no way to serialize bypasses across tabs, and an uncoordinated
      // refresh is exactly the concurrent-refresh wipe this layer prevents.
      // Degrade to a RECOVERABLE retryable error — auth-js retries without
      // removing the session; the user sees the auth-unavailable screen with
      // Reintentar instead of a silent logout or a wiped session. (Browsers
      // WITHOUT navigator.locks never reach the bypass at all, so this only
      // affects the near-empty set that has Web Locks but no BroadcastChannel.)
      trackEvent('auth_lock_bypass_denied_uncoordinated', {
        correlation_id: getCorrelationId(),
        lock_path: name,
      });
      throw new AuthRetryableFetchError(
        'pb-auth-lock: bypass denied — no cross-tab coordination channel available (fail-closed)',
        0,
      );
    }
    return (await ct.runWithHolder(run)) as T;
  };

  return async function resilientAuthLock<T>(
    name: string,
    acquireTimeout: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Environment without the LockManager API: auth-js would use a no-op
    // lock; mirror that (single-tab assumption is the platform fallback).
    if (!locks) return fn();

    const ct = crossTabFor(name);

    // -- Step 0: circuit breaker ------------------------------------------
    // The zombie state is permanent for the tab's lifetime and auth
    // operations NEST (getSession → refresh re-acquires the lock). Paying
    // the ~8 s ladder per nested call blows past the app's bootstrap
    // deadline; bypass instantly while poisoned instead — still serialized
    // across tabs by the advisory contention protocol.
    const poisonedUntil = poisonedUntilByName.get(name) ?? 0;
    if (poisonedUntil > nowFn()) {
      return runBypass(name, fn);
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

    // Bounded exclusive acquire, reusable (step 1 and the holder retry).
    // The AbortSignal alone is NOT a sufficient bound: in the demonstrated
    // zombie state (request queued by a document destroyed mid-flight),
    // Chromium never settles the poisoned queue entry — not even on abort.
    // Race the attempt against an independent timer, exactly like auth-js
    // does for its own acquire timeout. The granted execution heartbeats so
    // other tabs can distinguish a live holder from a zombie (steal guard).
    const boundedAcquire = (budgetMs: number) => {
      const ac = new AbortController();
      const attempt = (async (): Promise<{ done: boolean; value?: T }> => {
        try {
          const value = (await locks.request(name, { mode: 'exclusive', signal: ac.signal }, async (lock) => {
            if (!lock) return runOnce(); // non-spec browser: run unlocked
            return ct.runWithHolder(runOnce);
          })) as T | undefined;
          return fnStarted ? { done: true, value } : { done: false };
        } catch {
          // AbortError (own deadline) or a lock-facility error (SecurityError
          // in sandboxed iframes): both mean "acquire did not happen".
          return { done: false };
        }
      })();
      return new Promise<{ done: boolean; value?: T; hung: boolean }>((resolve) => {
        const timer = setTimeoutFn(() => {
          try {
            ac.abort();
          } catch {
            /* noop */
          }
          resolve({ done: false, hung: true });
        }, budgetMs);
        attempt.then((r) => {
          clearTimeoutFn(timer);
          resolve({ ...r, hung: false });
        });
      });
    };

    // -- Step 1: bounded exclusive acquire --------------------------------
    const step1Race = await boundedAcquire(acquireMs);

    if (!step1Race.hung && step1Race.done) {
      // A successful acquisition after a cooldown re-probe closes the
      // circuit: the browser's lock facility is healthy again.
      if (poisonedUntilByName.has(name)) poisonedUntilByName.delete(name);
      return step1Race.value as T;
    }
    if (fnStarted) return (await runOnce()) as T;

    // -- Step 1b: steal guard ----------------------------------------------
    // A failed acquire has TWO possible causes: a zombie queue entry (steal
    // is appropriate) or a LEGITIMATE holder that is merely slow (steal
    // would preempt it mid-flight — e.g. a refresh POST >5 s on a bad
    // mobile network). Distinguish them via the advisory heartbeat: while a
    // live holder exists, wait for its release and retry the NORMAL acquire
    // instead of stealing. With no live holder, fall through immediately.
    const probe = await ct.waitForHolder(HOLDER_WAIT_MS);
    if (probe.hadHolder && probe.cleared) {
      const retryRace = await boundedAcquire(AUTH_LOCK_HOLDER_RETRY_MS);
      if (!retryRace.hung && retryRace.done) {
        if (poisonedUntilByName.has(name)) poisonedUntilByName.delete(name);
        return retryRace.value as T;
      }
      if (fnStarted) return (await runOnce()) as T;
    } else if (!probe.cleared && probe.remoteAlive) {
      // A remote tab is STILL running auth work under this lock: stealing
      // would abort it, and running our continuation uncoordinated could
      // overwrite its fresher result. Go straight to the serialized bypass
      // contention, which will supersede us (retryable, no session wipe).
      poisonedUntilByName.set(name, nowFn() + poisonCooldownMs);
      return runBypass(name, runOnce);
    }

    // -- Step 2: bounded steal --------------------------------------------
    // Spec-compliant preemption of a genuinely orphaned holder — only
    // reached when no live holder heartbeat exists. The steal request itself
    // can queue behind the zombie entry, so it is raced against a hard cap.
    const stealAttempt = (async (): Promise<{ done: boolean; value?: T }> => {
      try {
        const value = (await locks.request(name, { mode: 'exclusive', steal: true }, async (lock) => {
          if (!lock) return runOnce();
          return ct.runWithHolder(runOnce);
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
    // paying the ladder again. The execution itself is serialized across
    // tabs by the advisory contention protocol (observación 2).
    poisonedUntilByName.set(name, nowFn() + poisonCooldownMs);
    onBypass(name);
    return runBypass(name, runOnce);
  };
}

/** Shared production instance (single telemetry/consistency point). */
export const resilientAuthLock = createResilientAuthLock();
