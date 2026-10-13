/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 — minimal timeout race helper.
 *
 * Every critical async operation in the auth / onboarding / upload paths must
 * be bounded: a hung promise (zombie navigator.locks entry, stalled PostgREST
 * request, dead connection) must surface as a RECOVERABLE error, never as an
 * indefinite spinner. This helper never rejects: the caller decides how to
 * classify a timeout. The abandoned promise keeps running in the background;
 * callers must only use it for operations that are safe to leave in flight
 * (idempotent reads / upserts).
 */

export interface TimeoutRace<T> {
  value: T | undefined;
  timedOut: boolean;
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<TimeoutRace<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const id = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: undefined, timedOut: true });
    }, ms);
    // PromiseLike: PostgREST builders are thenables, not native Promises —
    // required by the strict CI typecheck (tsconfig.app.json).
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(id);
        resolve({ value, timedOut: false });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(id);
        // A rejection is surfaced as a timeout-like failure: callers treat
        // both as "operation did not complete" recoverable states.
        resolve({ value: undefined, timedOut: true });
      },
    );
  });
}
