/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 2) — deterministic auth callback flow.
 *
 * Extracted from the AuthCallback component as a pure, dependency-injected
 * state machine so the exact production logic is unit-testable in Node.
 *
 * Contract:
 * - Processes the OAuth/email return EXACTLY ONCE per page lifecycle
 *   (in-flight promise memoization: React re-renders, StrictMode remounts and
 *   double effect runs all share the same execution — zero duplicate code
 *   exchanges).
 * - Overall deadline (~9 s). Any hanging dependency (supabase-js getSession /
 *   exchangeCodeForSession acquire navigator.locks with no timeout and can
 *   hang on flaky mobile networks even though the session was created
 *   server-side) is cut by the deadline.
 * - On timeout the session is re-checked once BEFORE declaring failure — a
 *   session that arrived late still navigates.
 * - Errors map to closed categories; Supabase internals never surface.
 */

export const AUTH_CALLBACK_TIMEOUT_MS = 9_000;
export const AUTH_CALLBACK_FINAL_CHECK_MS = 2_000;
/** Grace wait before failing fast with a resolved-but-missing session. */
export const AUTH_CALLBACK_GRACE_MS = 1_500;

export type AuthCallbackErrorCategory =
  | 'session_missing'
  | 'exchange_failed'
  | 'callback_timeout'
  | 'navigation_failed'
  | 'unknown';

export interface AuthCallbackSessionLike {
  user: unknown;
}

export interface AuthCallbackResultLike {
  data: { session: AuthCallbackSessionLike | null };
  error: unknown | null;
}

export interface AuthCallbackDeps {
  getSession: () => Promise<AuthCallbackResultLike>;
  exchangeCodeForSession: (code: string) => Promise<AuthCallbackResultLike>;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface AuthCallbackInput {
  nextPath: string;
  code: string | null;
  provider: 'email' | 'google';
}

export type AuthCallbackOutcome =
  | {
      status: 'navigating';
      nextPath: string;
      provider: 'email' | 'google';
      exchanged: boolean;
      recoveredOnTimeout: boolean;
      durationMs: number;
    }
  | {
      status: 'failed';
      errorCategory: AuthCallbackErrorCategory;
      provider: 'email' | 'google';
      durationMs: number;
    };

interface TimerControl {
  setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;
}

function defaultTimers(): TimerControl {
  return {
    setTimeoutFn: (fn, ms) => setTimeout(fn, ms),
    clearTimeoutFn: (id) => clearTimeout(id),
  };
}

function isSession(result: AuthCallbackResultLike | undefined | null): boolean {
  return Boolean(result && result.data && result.data.session);
}

/** Race a promise against a timeout. Never rejects. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timers: TimerControl,
): Promise<{ value: T; timedOut: false } | { value: undefined; timedOut: true }> {
  return new Promise((resolve) => {
    let settled = false;
    const id = timers.setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      resolve({ value: undefined, timedOut: true });
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        timers.clearTimeoutFn(id);
        resolve({ value, timedOut: false });
      },
      () => {
        if (settled) return;
        settled = true;
        timers.clearTimeoutFn(id);
        resolve({ value: undefined, timedOut: true });
      },
    );
  });
}

function wait(ms: number, timers: TimerControl): Promise<void> {
  return new Promise((resolve) => {
    timers.setTimeoutFn(resolve, ms);
  });
}

async function resolveSession(
  input: AuthCallbackInput,
  deps: AuthCallbackDeps,
  deadlineRemaining: () => number,
  exchangeAttempted: { done: boolean },
): Promise<
  | { session: true; exchanged: boolean; recoveredOnTimeout: boolean }
  | { session: false; errorCategory: AuthCallbackErrorCategory }
  | { timeout: true }
> {
  // 1. Canonical session first (covers: existing session, hash-token flow
  //    where detectSessionInUrl already parsed the tokens, and any code
  //    exchange the client performed automatically on init).
  const first = await withTimeout(deps.getSession(), deadlineRemaining(), depsTimers(deps));
  if (first.timedOut) return { timeout: true };
  if (isSession(first.value)) return { session: true, exchanged: false, recoveredOnTimeout: false };

  // 2. Single code exchange, exactly once.
  if (input.code && !exchangeAttempted.done) {
    exchangeAttempted.done = true;
    const exchange = await withTimeout(
      deps.exchangeCodeForSession(input.code),
      deadlineRemaining(),
      depsTimers(deps),
    );
    if (exchange.timedOut) return { timeout: true };
    if (isSession(exchange.value)) return { session: true, exchanged: true, recoveredOnTimeout: false };
    // The client's own detectSessionInUrl may have consumed the code
    // concurrently: re-check the canonical session before failing.
    const recheck = await withTimeout(deps.getSession(), deadlineRemaining(), depsTimers(deps));
    if (recheck.timedOut) return { timeout: true };
    if (isSession(recheck.value)) return { session: true, exchanged: false, recoveredOnTimeout: false };
    return { session: false, errorCategory: 'exchange_failed' };
  }

  return { session: false, errorCategory: 'session_missing' };
}

function depsTimers(deps: AuthCallbackDeps): TimerControl {
  if (deps.setTimeoutFn && deps.clearTimeoutFn) {
    return { setTimeoutFn: deps.setTimeoutFn, clearTimeoutFn: deps.clearTimeoutFn };
  }
  return defaultTimers();
}

async function runAuthCallback(
  input: AuthCallbackInput,
  deps: AuthCallbackDeps,
): Promise<AuthCallbackOutcome> {
  const timers = depsTimers(deps);
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const deadline = () => Math.max(0, AUTH_CALLBACK_TIMEOUT_MS - (now() - startedAt));
  const exchangeAttempted = { done: false };

  const result = await resolveSession(input, deps, deadline, exchangeAttempted);

  if ('timeout' in result && result.timeout) {
    // Deadline hit with hanging dependencies. Final canonical session check
    // BEFORE declaring failure: a session that arrived late still navigates.
    const finalCheck = await withTimeout(
      deps.getSession(),
      AUTH_CALLBACK_FINAL_CHECK_MS,
      timers,
    );
    if (isSession(finalCheck.value)) {
      return {
        status: 'navigating',
        nextPath: input.nextPath,
        provider: input.provider,
        exchanged: false,
        recoveredOnTimeout: true,
        durationMs: now() - startedAt,
      };
    }
    return {
      status: 'failed',
      errorCategory: 'callback_timeout',
      provider: input.provider,
      durationMs: now() - startedAt,
    };
  }

  if ('session' in result && result.session) {
    return {
      status: 'navigating',
      nextPath: input.nextPath,
      provider: input.provider,
      exchanged: result.exchanged,
      recoveredOnTimeout: result.recoveredOnTimeout,
      durationMs: now() - startedAt,
    };
  }

  // No session and no hang: give the client's async auto-detect a short
  // grace, re-check once, then fail with the closed category.
  if (deadline() > 0) {
    await wait(Math.min(AUTH_CALLBACK_GRACE_MS, deadline()), timers);
    const graceCheck = await withTimeout(deps.getSession(), deadline(), timers);
    if (isSession(graceCheck.value)) {
      return {
        status: 'navigating',
        nextPath: input.nextPath,
        provider: input.provider,
        exchanged: false,
        recoveredOnTimeout: false,
        durationMs: now() - startedAt,
      };
    }
  }

  return {
    status: 'failed',
    errorCategory: ('errorCategory' in result && result.errorCategory) || 'unknown',
    provider: input.provider,
    durationMs: now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Once-per-page-lifecycle guard. StrictMode remounts, effect re-runs and
// re-renders all share the same in-flight promise: the OAuth code is
// exchanged at most once and navigation happens at most once.
// ---------------------------------------------------------------------------

let inFlight: Promise<AuthCallbackOutcome> | null = null;

/** Process the callback once per page lifecycle (dedupe across remounts). */
export function processAuthCallbackOnce(
  input: AuthCallbackInput,
  deps: AuthCallbackDeps,
): Promise<AuthCallbackOutcome> {
  if (!inFlight) {
    inFlight = runAuthCallback(input, deps);
  }
  return inFlight;
}

/** Test/recovery hook: allow a fresh manual re-check from the recovery UI. */
export function resetAuthCallbackRun(): void {
  inFlight = null;
}

/** One-shot session probe used by the recovery screen's "recheck" button. */
export async function probeSession(
  deps: Pick<AuthCallbackDeps, 'getSession'>,
): Promise<boolean> {
  try {
    const result = await withTimeout(deps.getSession(), AUTH_CALLBACK_FINAL_CHECK_MS, defaultTimers());
    return isSession(result.value);
  } catch {
    return false;
  }
}
