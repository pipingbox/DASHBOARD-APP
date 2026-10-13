/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 (rev.2, observación 4) — serialized,
 * abortable profile writes.
 *
 * Problem statement (demonstrated risk): a bounded write that exceeds its
 * deadline was previously left IN FLIGHT. The abandoned write could land
 * LATER and silently overwrite newer state — e.g. a slow autosave (stale
 * payload) committing after the explicit "Finish"/"Postpone" write, leaving
 * PostgreSQL inconsistent with what the user confirmed.
 *
 * Contract of this coordinator:
 *
 *   1. SINGLE-FLIGHT per lane: starting a write in a lane ABORTS the lane's
 *      previous in-flight write (AbortController) — superseded writes never
 *      commit late. PostgREST builders receive the signal via
 *      `.abortSignal()`, so the underlying fetch is really cancelled.
 *   2. EXPLICIT lane priority: an explicit write (Finish / Postpone) aborts
 *      and suppresses autosaves until it settles. An autosave that fires
 *      while an explicit write runs is DROPPED (its payload is stale by
 *      definition; the debounce re-arms from the next user edit).
 *   3. BOUNDED: every write races its deadline; a timeout ABORTS the
 *      underlying request and reports 'timeout'. The caller keeps the local
 *      draft and shows the recoverable error state — the coordinator never
 *      throws and never reports a write as saved without server 2xx.
 *   4. GENERATION GUARD: results are delivered through per-call generation
 *      checks, so a late settlement of an aborted write is ignored even if
 *      the underlying thenable resolves anyway.
 *
 * Pure TypeScript with injectable timers — no DOM, no supabase imports — so
 * the late-write and supersede scenarios are unit-testable deterministically.
 */

export type ProfileWriteOutcome =
  | { status: 'saved'; error: null }
  | { status: 'error'; error: unknown }
  | { status: 'timeout'; error: null }
  /** Aborted because a newer write (or an explicit write) superseded it. */
  | { status: 'superseded'; error: null }
  /** Autosave dropped while an explicit write was in flight. */
  | { status: 'dropped'; error: null };

export interface ProfileWriteOp {
  /**
   * Build the write. The coordinator hands over the AbortSignal that the
   * builder MUST wire into `.abortSignal(signal)` (or equivalent fetch
   * cancellation). Must resolve with the PostgREST-style result
   * `{ error }`; a rejection is treated as 'error'.
   */
  run: (signal: AbortSignal) => PromiseLike<{ error: unknown }>;
}

export interface ProfileWriteCoordinatorDeps {
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
}

type Lane = 'auto' | 'explicit';

interface InFlight {
  controller: AbortController;
  generation: number;
  lane: Lane;
  /** Resolve the superseded call immediately (idempotent). */
  settle: (outcome: ProfileWriteOutcome) => void;
}

export class ProfileWriteCoordinator {
  private inFlight: InFlight | null = null;
  private generation = 0;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (id: unknown) => void;

  constructor(deps: ProfileWriteCoordinatorDeps = {}) {
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((id) => clearTimeout(id as never));
  }

  /** True while an explicit (Finish / Postpone) write is in flight. */
  get explicitInFlight(): boolean {
    return this.inFlight?.lane === 'explicit';
  }

  /**
   * Run an AUTOSAVE write. Dropped when an explicit write is in flight
   * (stale by definition); supersedes any previous autosave.
   */
  runAuto(op: ProfileWriteOp, timeoutMs: number): Promise<ProfileWriteOutcome> {
    if (this.explicitInFlight) return Promise.resolve({ status: 'dropped', error: null });
    return this.start('auto', op, timeoutMs);
  }

  /**
   * Run an EXPLICIT write (Finish / Postpone). Aborts any in-flight write
   * (autosave or explicit) and blocks autosaves until settled.
   */
  runExplicit(op: ProfileWriteOp, timeoutMs: number): Promise<ProfileWriteOutcome> {
    return this.start('explicit', op, timeoutMs);
  }

  private start(lane: Lane, op: ProfileWriteOp, timeoutMs: number): Promise<ProfileWriteOutcome> {
    // Single-flight: supersede the previous in-flight write — cancel its
    // underlying request AND settle its caller immediately as 'superseded'
    // (its late settlement is also ignored via the generation guard below).
    if (this.inFlight) {
      try {
        this.inFlight.controller.abort();
      } catch {
        /* noop */
      }
      this.inFlight.settle({ status: 'superseded', error: null });
    }
    const generation = ++this.generation;
    const controller = new AbortController();

    return new Promise<ProfileWriteOutcome>((resolve) => {
      let settled = false;
      const finish = (outcome: ProfileWriteOutcome) => {
        if (settled) return;
        settled = true;
        this.clearTimeoutFn(timer);
        if (this.inFlight?.generation === generation) this.inFlight = null;
        resolve(outcome);
      };
      this.inFlight = { controller, generation, lane, settle: finish };

      const timer = this.setTimeoutFn(() => {
        // Bounded: timeout CANCELS the underlying request — no late commit.
        try {
          controller.abort();
        } catch {
          /* noop */
        }
        finish({ status: 'timeout', error: null });
      }, timeoutMs);

      let result: PromiseLike<{ error: unknown }>;
      try {
        result = op.run(controller.signal);
      } catch (err) {
        finish({ status: 'error', error: err });
        return;
      }

      result.then(
        ({ error }) => {
          // Generation guard: this write was superseded/aborted — even if
          // the thenable resolves late, it is NOT reported as saved.
          if (this.generation !== generation || controller.signal.aborted) {
            finish({ status: 'superseded', error: null });
            return;
          }
          if (error) finish({ status: 'error', error });
          else finish({ status: 'saved', error: null });
        },
        (err) => {
          if (this.generation !== generation || controller.signal.aborted) {
            finish({ status: 'superseded', error: null });
            return;
          }
          finish({ status: 'error', error: err });
        },
      );
    });
  }
}
