/**
 * Wraps a promise with a timeout. If the promise doesn't settle within `ms`,
 * the returned promise rejects with an Error.
 *
 * Designed for Supabase queries that can hang on slow mobile networks.
 * The original promise keeps running in the background but its result is
 * discarded once the timeout fires — existing try-catch-finally blocks
 * will handle the thrown Error normally.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

export function withQueryTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Query timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() =>
    clearTimeout(timeoutId),
  );
}
