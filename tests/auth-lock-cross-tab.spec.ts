/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.2 (observación 2) — tests for the
 * cross-tab coordination layer (heartbeat, steal guard, bypass contention)
 * and its integration with resilientAuthLock.
 *
 * Deterministic: fake BroadcastChannel bus (microtask delivery, no
 * self-delivery per spec) + real timers with small injected timing
 * constants. The REAL two-tab browser scenario is covered by
 * tests/auth-lock-multi-tab-e2e.spec.ts.
 */
import { test, expect } from '@playwright/test';
import {
  createCrossTabLock,
  type CrossTabChannelLike,
  type CrossTabMessage,
} from '../app/frontend/src/lib/authLockCrossTab';
import { createResilientAuthLock } from '../app/frontend/src/lib/resilientAuthLock';

// Small timing constants for real-timer tests.
const T = { heartbeatIntervalMs: 50, heartbeatTimeoutMs: 200, claimWindowMs: 40 };
const POLL_MS = 100; // waitForHolder poll cadence (module-internal)

// ---------------------------------------------------------------------------
// Fake BroadcastChannel bus (spec: no delivery back to the posting channel)
// ---------------------------------------------------------------------------

function createFakeBus() {
  const byName = new Map<string, Map<number, Set<(msg: CrossTabMessage) => void>>>();
  let nextId = 1;
  return {
    factory: (name: string): CrossTabChannelLike => {
      const channelId = nextId++;
      let subs = byName.get(name);
      if (!subs) {
        subs = new Map();
        byName.set(name, subs);
      }
      const mySubs = new Set<(msg: CrossTabMessage) => void>();
      subs.set(channelId, mySubs);
      return {
        post: (msg) => {
          for (const [cid, set] of subs!) {
            if (cid === channelId) continue; // spec: no self-delivery
            for (const cb of [...set]) queueMicrotask(() => cb(msg));
          }
        },
        subscribe: (cb) => {
          mySubs.add(cb);
          return () => mySubs.delete(cb);
        },
        close: () => {
          subs!.delete(channelId);
        },
      };
    },
  };
}

const LOCK_NAME = 'lock:sb-ref-auth-token';

function crossTabFactoryFor(bus: ReturnType<typeof createFakeBus>, tabId: string) {
  return (name: string) => createCrossTabLock(name, { channelFactory: bus.factory, tabId, ...T });
}

/** navigator.locks mock where every request hangs forever (zombie). */
function hungLocks() {
  return {
    request: () => new Promise(() => {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// createCrossTabLock
// ---------------------------------------------------------------------------

test.describe('createCrossTabLock — advisory cross-tab coordination', () => {
  test('runWithHolder announces a live holder; a peer waits for the release', async () => {
    const bus = createFakeBus();
    const a = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-A', ...T });
    const b = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-B', ...T });

    let releaseA!: (v: string) => void;
    const aRun = a.runWithHolder(() => new Promise<string>((r) => (releaseA = r)));
    await sleep(20); // first heartbeat travels

    const probePromise = b.waitForHolder(2_000);
    await sleep(POLL_MS + 20); // probe observes the holder
    releaseA('done');
    const probe = await probePromise;

    expect(probe.hadHolder).toBe(true);
    expect(probe.cleared).toBe(true);
    expect(await aRun).toBe('done');
  });

  test('contendBypass: two concurrent tabs — exactly one runs, the other is superseded', async () => {
    const bus = createFakeBus();
    const a = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-A', ...T });
    const b = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-B', ...T });

    const events: string[] = [];
    const run = async (label: string, ct: typeof a) => {
      const verdict = await ct.contendBypass(5_000);
      if (verdict === 'run') {
        await ct.runWithHolder(async () => {
          events.push(`${label}:start`);
          await sleep(120);
          events.push(`${label}:end`);
        });
      }
      return `${label}:${verdict}`;
    };

    const [resA, resB] = await Promise.all([run('A', a), run('B', b)]);
    expect([resA, resB].sort()).toEqual(['A:run', 'B:superseded'].sort());
    // Exactly one tab executed the continuation.
    expect(events.filter((e) => e.endsWith(':start'))).toHaveLength(1);
  });

  test('contendBypass: a lone tab runs right after the claim window', async () => {
    const bus = createFakeBus();
    const a = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-A', ...T });
    expect(await a.contendBypass(2_000)).toBe('run');
  });

  test('contendBypass: crashed holder (no release) — superseded, but a later call recovers', async () => {
    const bus = createFakeBus();
    const b = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-B', ...T });

    // A dead tab's last heartbeat is still fresh: B must NOT run its
    // (potentially stale) continuation.
    const corpse = bus.factory(`pb-authlock:${LOCK_NAME}`);
    corpse.post({ k: 'pb-authlock', n: LOCK_NAME, t: 'held', tab: 'tab-C', id: 'tab-C:x', ts: Date.now() });
    await sleep(20);

    const verdict = await b.contendBypass(T.heartbeatTimeoutMs + 1_000);
    expect(verdict).toBe('superseded');

    // After the corpse's heartbeat expired, a NEW call contends cleanly.
    await sleep(T.heartbeatTimeoutMs + POLL_MS + 50);
    expect(await b.contendBypass(2_000)).toBe('run');
  });

  test('contendBypass: same-tab parallel calls are serialized, never superseded', async () => {
    const bus = createFakeBus();
    // Two coordinators with the SAME tabId (same realm, two lock calls).
    const a = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-A', ...T });
    const b = createCrossTabLock(LOCK_NAME, { channelFactory: bus.factory, tabId: 'tab-A', ...T });

    const order: string[] = [];
    const first = (async () => {
      const v = await a.contendBypass(5_000);
      if (v === 'run') {
        await a.runWithHolder(async () => {
          order.push('first:start');
          await sleep(150);
          order.push('first:end');
        });
      }
      return v;
    })();
    const second = (async () => {
      const v = await b.contendBypass(5_000);
      if (v === 'run') {
        await b.runWithHolder(async () => {
          order.push('second:start');
          order.push('second:end');
        });
      }
      return v;
    })();

    const [v1, v2] = await Promise.all([first, second]);
    expect(v1).toBe('run');
    expect(v2).toBe('run');
    // Serialized in ONE deterministic order (the claim winner goes first);
    // no interleaving, both executed, neither superseded.
    const seq = order.join(',');
    expect(
      seq === 'first:start,first:end,second:start,second:end' ||
        seq === 'second:start,second:end,first:start,first:end',
    ).toBe(true);
  });

  test('no BroadcastChannel: degraded mode runs immediately (documented residual)', async () => {
    const a = createCrossTabLock(LOCK_NAME, { channelFactory: () => null, tabId: 'tab-A', ...T });
    expect(await a.contendBypass(1_000)).toBe('run');
    const probe = await a.waitForHolder(1_000);
    expect(probe.cleared).toBe(true);
    expect(probe.hadHolder).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resilientAuthLock integration (observación 2)
// ---------------------------------------------------------------------------

test.describe('resilientAuthLock — cross-tab safety of the bypass', () => {
  test('two zombie tabs: one runs, the other throws AuthRetryableFetchError (no stale refresh, no session wipe)', async () => {
    const bus = createFakeBus();
    const lockA = createResilientAuthLock({
      locks: hungLocks() as never,
      onBypass: () => {},
      crossTabFactory: crossTabFactoryFor(bus, 'tab-A'),
    });
    const lockB = createResilientAuthLock({
      locks: hungLocks() as never,
      onBypass: () => {},
      crossTabFactory: crossTabFactoryFor(bus, 'tab-B'),
    });

    let runs = 0;
    const callA = lockA(LOCK_NAME, 30, async () => {
      runs += 1;
      return 'fresh-session';
    }).then((v) => ({ ok: v as string }));
    const callB = lockB(LOCK_NAME, 30, async () => {
      runs += 1;
      return 'stale-continuation';
    }).then(
      (v) => ({ ok: v as string }),
      (err: unknown) => ({ err: err as Error }),
    );

    const [resA, resB] = await Promise.all([callA, callB]);

    // Exactly ONE continuation executed — the loser's stale continuation
    // never ran, so it can never overwrite the winner's newer tokens.
    expect(runs).toBe(1);
    const winner = [resA, resB].find((r) => 'ok' in r);
    const loser = [resA, resB].find((r) => 'err' in r);
    expect(winner && 'ok' in winner && winner.ok).toBe('fresh-session');
    expect(loser && 'err' in loser && loser.err.name).toBe('AuthRetryableFetchError');
  });

  test('steal guard: a tab never preempts a live remote holder — it waits and acts strictly after the release', async () => {
    const bus = createFakeBus();
    const lockA = createResilientAuthLock({
      locks: hungLocks() as never,
      onBypass: () => {},
      crossTabFactory: crossTabFactoryFor(bus, 'tab-A'),
    });
    const lockB = createResilientAuthLock({
      locks: hungLocks() as never,
      onBypass: () => {},
      crossTabFactory: crossTabFactoryFor(bus, 'tab-B'),
    });

    const order: string[] = [];
    const callA = lockA(LOCK_NAME, 30, async () => {
      order.push('A:start');
      await sleep(300);
      order.push('A:end');
      return 'A';
    });
    await sleep(10); // A reaches the ladder first
    const callB = lockB(LOCK_NAME, 30, async () => {
      order.push('B:run');
      return 'B';
    });

    const [resA, resB] = await Promise.all([
      callA.then((v) => ({ ok: v as string })),
      callB.then(
        (v) => ({ ok: v as string }),
        (err: unknown) => ({ err: err as Error }),
      ),
    ]);

    // A completed WITHOUT being preempted; B never overlapped it: either B
    // ran strictly after A released, or it was superseded (retryable).
    expect(resA).toEqual({ ok: 'A' });
    if ('ok' in resB) {
      expect(order).toEqual(['A:start', 'A:end', 'B:run']);
    } else {
      expect(resB.err.name).toBe('AuthRetryableFetchError');
      expect(order).toEqual(['A:start', 'A:end']);
    }
  });

  test('single zombie tab (no peers): bypass still runs — no liveness regression', async () => {
    const bus = createFakeBus();
    const lock = createResilientAuthLock({
      locks: hungLocks() as never,
      onBypass: () => {},
      crossTabFactory: crossTabFactoryFor(bus, 'tab-A'),
    });
    expect(await lock(LOCK_NAME, 30, async () => 'recovered')).toBe('recovered');
  });
});
