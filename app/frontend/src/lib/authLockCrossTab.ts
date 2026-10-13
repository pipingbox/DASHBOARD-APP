/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.2 (observación 2) — cross-tab
 * coordination for the resilient auth lock.
 *
 * Two demonstrated gaps of the rev.1 bypass, both closed here:
 *
 *   (a) TWO TABS IN BYPASS could run auth work CONCURRENTLY. The losing
 *       tab's continuation may carry STALE state captured before the wait
 *       (auth-js `_recoverAndRefresh` reads the session BEFORE acquiring the
 *       lock): a late refresh with an already-rotated refresh token fails
 *       400, and auth-js reacts to the non-retryable error with
 *       `_removeSession()` — WIPING the fresher tokens the winning tab just
 *       wrote. "A later write overwrote newer tokens."
 *   (b) `steal: true` could preempt a LEGITIMATE holder that is merely slow
 *       (e.g. a refresh POST taking >5 s on a bad mobile network), aborting
 *       its work mid-flight.
 *
 * Mechanism (advisory, BroadcastChannel-based; degrades safely):
 *
 *   1. HEARTBEAT: every execution of the locked function — in ANY mode,
 *      healthy or bypass — announces itself on a per-lock channel and
 *      heartbeats once per second until it releases. Liveness is measured
 *      by LOCAL receipt time (no cross-tab clock skew).
 *   2. STEAL GUARD: before attempting `steal: true`, a tab that failed the
 *      bounded acquire checks for a live holder (same-realm registry or a
 *      fresh remote heartbeat). While a legitimate holder works, the tab
 *      waits for its release and re-tries the normal acquire — steal is
 *      only reached when NO live holder exists (zombie or crashed holder).
 *   3. BYPASS CONTENTION: bypass executions across tabs are serialized by a
 *      deterministic claim round (150 ms window, winner = lowest
 *      (timestamp, id)). A tab that observed ANOTHER TAB holding or winning
 *      during its call is SUPERSEDED: it does NOT run its (potentially
 *      stale) continuation at all. The caller translates 'superseded' into
 *      a synthetic `AuthRetryableFetchError`, which auth-js treats as
 *      retryable — crucially it does NOT remove the session, and the next
 *      attempt reads the fresh tokens written by the winner. Same-tab
 *      contention is safe (same realm, auth-js dedupes refreshes) and is
 *      serialized without superseding.
 *   4. LIVENESS: a crashed holder stops heartbeating and is considered dead
 *      after HEARTBEAT_TIMEOUT_MS; every wait is bounded by a budget, after
 *      which a superseded tab fails transiently (recoverable) instead of
 *      hanging. BACKGROUND-TAB THROTTLING is a non-issue by design: the
 *      FIRST heartbeat is posted synchronously when the holder starts (not
 *      a timer), and a holder whose later heartbeats get clamped by the
 *      browser (Chrome intensive throttling ≥1/min after 5 min background)
 *      is by definition stuck beyond any legitimate auth operation — peers
 *      treating it as dead after HEARTBEAT_TIMEOUT_MS is the intended
 *      recovery, not a regression. A throttled CONTENDER only runs slower
 *      (its claim window and poll stretch); determinism is preserved.
 *      When BroadcastChannel is unavailable the coordinator reports
 *      'uncoordinated' and the LOCK fails closed (rev.3, observación 3):
 *      an uncoordinated bypass is exactly the concurrent-refresh wipe this
 *      layer exists to prevent.
 *
 * Pure TypeScript with injectable channel/timers/clock — deterministic unit
 * tests; the real browser path is covered by a two-tab E2E.
 */

/** Heartbeat cadence while a holder runs the locked function. */
export const HEARTBEAT_INTERVAL_MS = 1_000;
/** A remote holder with no heartbeat for this long is considered dead. */
export const HEARTBEAT_TIMEOUT_MS = 2_500;
/** Claim window of a bypass contention round. */
export const CLAIM_WINDOW_MS = 150;
/** Overall budget of bypass contention before failing transiently. */
export const BYPASS_CONTENTION_BUDGET_MS = 12_000;
/** How long the steal guard waits for a live holder to release. */
export const HOLDER_WAIT_MS = 6_000;

export interface CrossTabMessage {
  k: 'pb-authlock';
  n: string;
  t: 'held' | 'release' | 'claim';
  tab: string;
  id: string;
  ts: number;
}

export interface CrossTabChannelLike {
  post(msg: CrossTabMessage): void;
  subscribe(cb: (msg: CrossTabMessage) => void): () => void;
  close(): void;
}

export interface CrossTabDeps {
  channelFactory?: (channelName: string) => CrossTabChannelLike | null;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
  nowFn?: () => number;
  randomFn?: () => number;
  /** Per-realm (per-tab) identity. One random value per page load. */
  tabId?: string;
  /** Timing overrides for tests (defaults are the module constants). */
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  claimWindowMs?: number;
}

export interface HolderProbe {
  /** A holder (same-realm or live remote) existed when probed. */
  hadHolder: boolean;
  /** Still alive after the wait (only when cleared=false). */
  remoteAlive: boolean;
  localAlive: boolean;
  /** True when no live holder remained (immediately or after waiting). */
  cleared: boolean;
}

export interface CrossTabLock {
  /** Run `fn` announcing a live holder (heartbeat + release). */
  runWithHolder<T>(fn: () => Promise<T>): Promise<T>;
  /** Wait (max `maxMs`) until no live holder remains. */
  waitForHolder(maxMs: number): Promise<HolderProbe>;
  /**
   * Contend for the single bypass slot across tabs.
   * 'run'           — this tab may execute the continuation.
   * 'superseded'    — ANOTHER TAB held/won during this call: our continuation
   *                   may be stale and must NOT run (caller throws retryable).
   * 'uncoordinated' — NO BroadcastChannel: cross-tab coordination is
   *                   impossible. The caller must FAIL CLOSED (retryable,
   *                   never session-wiping) instead of running an
   *                   uncoordinated refresh — two tabs bypassing with no
   *                   channel is exactly the concurrent-refresh wipe this
   *                   layer exists to prevent.
   */
  contendBypass(budgetMs: number): Promise<'run' | 'superseded' | 'uncoordinated'>;
  close(): void;
}

/** Same-realm holders: lockName → live holder ids (no channel needed). */
const localHolders = new Map<string, Set<string>>();

let realmTabId: string | null = null;
function defaultTabId(random: () => number): string {
  if (!realmTabId) realmTabId = `tab-${random().toString(36).slice(2)}-${random().toString(36).slice(2)}`;
  return realmTabId;
}

function defaultChannelFactory(channelName: string): CrossTabChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const bc = new BroadcastChannel(channelName);
    const subs = new Set<(msg: CrossTabMessage) => void>();
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as CrossTabMessage;
      for (const cb of subs) {
        try {
          cb(msg);
        } catch {
          /* noop */
        }
      }
    };
    return {
      post: (msg) => {
        try {
          bc.postMessage(msg);
        } catch {
          /* noop */
        }
      },
      subscribe: (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      close: () => {
        try {
          bc.close();
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}

export function createCrossTabLock(lockName: string, deps: CrossTabDeps = {}): CrossTabLock {
  const now = deps.nowFn ?? (() => Date.now());
  const random = deps.randomFn ?? Math.random;
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const setIntervalFn = deps.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearIntervalFn = deps.clearIntervalFn ?? ((id: unknown) => clearInterval(id as never));
  const tab = deps.tabId ?? defaultTabId(random);
  const channel = (deps.channelFactory ?? defaultChannelFactory)(`pb-authlock:${lockName}`);
  const heartbeatIntervalMs = deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const heartbeatTimeoutMs = deps.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  const claimWindowMs = deps.claimWindowMs ?? CLAIM_WINDOW_MS;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeoutFn(resolve, ms);
    });

  /** Remote holder id → LOCAL receipt time of its latest heartbeat. */
  const remoteHeld = new Map<string, number>();
  let holdingId: string | null = null;

  const heldMsg = (id: string): CrossTabMessage => ({ k: 'pb-authlock', n: lockName, t: 'held', tab, id, ts: now() });

  const unsubscribe = channel?.subscribe((msg) => {
    if (msg.k !== 'pb-authlock' || msg.n !== lockName || msg.tab === tab) return;
    if (msg.t === 'held') remoteHeld.set(msg.id, now());
    else if (msg.t === 'release') remoteHeld.delete(msg.id);
    else if (msg.t === 'claim' && holdingId) channel?.post(heldMsg(holdingId));
  });

  const localSet = (): Set<string> => {
    let s = localHolders.get(lockName);
    if (!s) {
      s = new Set();
      localHolders.set(lockName, s);
    }
    return s;
  };

  const remoteAlive = (): boolean => {
    const t = now();
    for (const receipt of remoteHeld.values()) {
      if (t - receipt < heartbeatTimeoutMs) return true;
    }
    return false;
  };
  const localAlive = (): boolean => (localHolders.get(lockName)?.size ?? 0) > 0;

  async function runWithHolder<T>(fn: () => Promise<T>): Promise<T> {
    const id = `${tab}:${random().toString(36).slice(2)}`;
    localSet().add(id);
    holdingId = id;
    const beat = () => channel?.post(heldMsg(id));
    beat();
    const iv = setIntervalFn(beat, heartbeatIntervalMs);
    try {
      return await fn();
    } finally {
      clearIntervalFn(iv);
      holdingId = null;
      localSet().delete(id);
      channel?.post({ k: 'pb-authlock', n: lockName, t: 'release', tab, id, ts: now() });
    }
  }

  async function waitForHolder(maxMs: number): Promise<HolderProbe> {
    if (!remoteAlive() && !localAlive()) {
      return { hadHolder: false, remoteAlive: false, localAlive: false, cleared: true };
    }
    const deadline = now() + maxMs;
    while (now() < deadline) {
      await sleep(100);
      if (!remoteAlive() && !localAlive()) {
        return { hadHolder: true, remoteAlive: false, localAlive: false, cleared: true };
      }
    }
    return { hadHolder: true, remoteAlive: remoteAlive(), localAlive: localAlive(), cleared: false };
  }

  async function contendBypass(budgetMs: number): Promise<'run' | 'superseded' | 'uncoordinated'> {
    // No channel: cross-tab coordination is impossible. Report honestly —
    // the LOCK decides policy (fail-closed); the coordinator must never
    // pretend it is safe to run uncoordinated (rev.3, observación 3).
    if (!channel) return 'uncoordinated';
    const deadline = now() + budgetMs;
    let crossTab = false;
    while (now() < deadline) {
      // A live remote holder means our continuation was already superseded.
      if (remoteAlive()) {
        crossTab = true;
        const probe = await waitForHolder(Math.max(0, deadline - now()));
        if (!probe.cleared) break;
        continue;
      }
      const myId = `${tab}:${random().toString(36).slice(2)}`;
      const myTs = now();
      const claims = new Map<string, { tab: string; ts: number }>([[myId, { tab, ts: myTs }]]);
      // Claim ECHO: a contender that posted before we subscribed would
      // otherwise be invisible to us (BroadcastChannel does not buffer),
      // letting both sides win their own round — the exact race this
      // protocol exists to prevent. Re-announce our claim (once per round)
      // whenever another contender appears during the window.
      let echoed = false;
      const myClaim: CrossTabMessage = { k: 'pb-authlock', n: lockName, t: 'claim', tab, id: myId, ts: myTs };
      const un = channel.subscribe((msg) => {
        if (msg.k === 'pb-authlock' && msg.n === lockName && msg.t === 'claim' && msg.id !== myId) {
          claims.set(msg.id, { tab: msg.tab, ts: msg.ts });
          if (!echoed) {
            echoed = true;
            channel.post(myClaim);
          }
        }
      });
      channel.post(myClaim);
      await sleep(claimWindowMs);
      un();
      if (remoteAlive()) {
        // Someone started holding during our claim window.
        crossTab = true;
        continue;
      }
      let winnerId = myId;
      let winnerTab = tab;
      let winnerTs = myTs;
      for (const [id, c] of claims) {
        if (c.ts < winnerTs || (c.ts === winnerTs && id < winnerId)) {
          winnerId = id;
          winnerTab = c.tab;
          winnerTs = c.ts;
        }
      }
      if (winnerId === myId) return crossTab ? 'superseded' : 'run';
      if (winnerTab !== tab) crossTab = true;
      // Wait for the winner to hold and release (bounded by the budget).
      const probe = await waitForHolder(Math.max(0, deadline - now()));
      if (!probe.cleared) break;
    }
    return crossTab ? 'superseded' : 'run';
  }

  return {
    runWithHolder,
    waitForHolder,
    contendBypass,
    close: () => {
      unsubscribe?.();
      channel?.close();
    },
  };
}
