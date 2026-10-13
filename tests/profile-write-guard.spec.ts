/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.3 (observación 4) — unit tests for
 * the server-side CAS write guard (`profileWriteGuard.ts`).
 *
 * Core defect under test (demonstrated against real QA PostgreSQL with the
 * delaying-proxy probe): a client-side ABORT does not stop a request already
 * on the wire. The stale UPDATE can reach the server AFTER a newer write and
 * commit over it (even leaving the row with mixed fields from both writes).
 * The guard's answer is a compare-and-set predicate on profile_write_seq:
 * a superseded write matches 0 rows and is never reported as success.
 *
 * The fake adapter below simulates the SERVER (seq + row state) and the
 * NETWORK (delivery order control, abort rejections) — the same reordering
 * the empirical probe exercised against real PostgreSQL.
 */
import { test, expect } from '@playwright/test';
import {
  ProfileWriteGuard,
  type ProfileUpdateAdapter,
  type GuardQueryResult,
} from '../app/frontend/src/lib/profileWriteGuard';

interface HeldWrite {
  payload: Record<string, unknown>;
  nextSeq: number;
  deliver: () => void;
}

const abortError = () => {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
};

/** Fake PostgREST server + network with controlled delivery order. */
class FakeServerAdapter implements ProfileUpdateAdapter {
  serverSeq = 0;
  row: Record<string, unknown> = {};
  held: HeldWrite[] = [];
  readSeqCalls = 0;
  unguardedCalls: Array<Record<string, unknown>> = [];

  readSeq(_signal: AbortSignal): PromiseLike<GuardQueryResult> {
    this.readSeqCalls += 1;
    return Promise.resolve({ data: { profile_write_seq: this.serverSeq } });
  }

  writeWithSeq(
    payload: Record<string, unknown>,
    nextSeq: number,
    signal: AbortSignal,
  ): PromiseLike<GuardQueryResult> {
    const entry: HeldWrite = {
      payload: { ...payload },
      nextSeq,
      deliver: () => {},
    };
    this.held.push(entry);
    return new Promise<GuardQueryResult>((resolve, reject) => {
      entry.deliver = () => {
        if (this.serverSeq < entry.nextSeq) {
          // CAS passes: the row is updated atomically.
          this.serverSeq = entry.nextSeq;
          Object.assign(this.row, entry.payload, { profile_write_seq: entry.nextSeq });
          resolve({ data: [{ profile_write_seq: entry.nextSeq }] });
        } else {
          // CAS rejects: a later write already advanced the seq — 0 rows.
          resolve({ data: [] });
        }
      };
      if (signal.aborted) reject(abortError());
      else signal.addEventListener('abort', () => reject(abortError()), { once: true });
    });
  }

  writeUnguarded(
    payload: Record<string, unknown>,
    _signal: AbortSignal,
  ): PromiseLike<GuardQueryResult> {
    this.unguardedCalls.push(payload);
    Object.assign(this.row, payload);
    return Promise.resolve({ data: [] });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitFor = async (fn: () => boolean, ms = 2_000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: condition never met');
    await sleep(5);
  }
};

test.describe('ProfileWriteGuard — server-side CAS ordering', () => {
  test('the exact wire-reorder scenario: an ABORTED stale write lands on the server AFTER the fresh write and CANNOT overwrite it', async () => {
    const adapter = new FakeServerAdapter();
    const guard = new ProfileWriteGuard(adapter);

    // Write #1 (stale autosave payload) — on the wire, client aborts it
    // (exactly what ProfileWriteCoordinator does on supersede).
    const ctrlStale = new AbortController();
    const staleP = guard.update({ title: 'STALE', skills: ['stale'] }, ctrlStale.signal);
    await waitFor(() => adapter.held.length === 1); // readSeq resolved, PATCH on the wire
    expect(adapter.held[0].nextSeq).toBe(1);
    ctrlStale.abort();
    await expect(staleP).rejects.toMatchObject({ name: 'AbortError' });

    // Write #2 (fresh Finish payload) — seq consumed per INTENT: it carries
    // a HIGHER seq than the aborted one, without re-reading the server.
    expect(adapter.readSeqCalls).toBe(1);
    const freshP = guard.update(
      { title: 'FRESH', skills: ['fresh'], location: 'Madrid, Spain' },
      new AbortController().signal,
    );
    await waitFor(() => adapter.held.length === 2);
    expect(adapter.readSeqCalls).toBe(1); // no extra round trip
    expect(adapter.held[1].nextSeq).toBe(2);
    adapter.held[1].deliver(); // fresh write reaches the server FIRST
    const fresh = await freshP;
    expect(fresh.error).toBeNull();
    expect(fresh.mode).toBe('cas');

    // The aborted write FINALLY reaches the server (network reorder) —
    // the CAS predicate must reject it: 0 rows, row keeps the fresh state.
    adapter.held[0].deliver();
    await sleep(10);
    expect(adapter.row.title).toBe('FRESH');
    expect(adapter.row.skills).toEqual(['fresh']);
    expect(adapter.row.location).toBe('Madrid, Spain');
    expect(adapter.row.profile_write_seq).toBe(2);
  });

  test('cross-tab supersede: 0 rows is not success — the guard resyncs and retries ONCE with a fresh seq', async () => {
    const adapter = new FakeServerAdapter();
    const guard = new ProfileWriteGuard(adapter);

    const p = guard.update({ title: 'MINE' }, new AbortController().signal);
    await waitFor(() => adapter.held.length === 1);

    // Another tab commits seq=3 while our write is in flight.
    adapter.serverSeq = 3;
    adapter.held[0].deliver(); // our seq=1 write matches 0 rows
    await waitFor(() => adapter.held.length === 2); // resync + retry issued
    // Resync happened (seq read after the conflict) and the retry carried
    // seq=4, committing our payload.
    expect(adapter.readSeqCalls).toBe(2);
    expect(adapter.held[1].nextSeq).toBe(4);
    adapter.held[1].deliver();
    const outcome = await p;
    expect(outcome.error).toBeNull();
    expect(outcome.mode).toBe('cas');
    expect(adapter.row.title).toBe('MINE');
    expect(adapter.row.profile_write_seq).toBe(4);
  });

  test('losing the cross-tab race TWICE surfaces a recoverable error — never a false success', async () => {
    const adapter = new FakeServerAdapter();
    const guard = new ProfileWriteGuard(adapter);

    const p = guard.update({ title: 'UNLUCKY' }, new AbortController().signal);
    await sleep(10);

    adapter.serverSeq = 10;
    adapter.held[0].deliver(); // first attempt: 0 rows
    await sleep(10);
    // The resync read already happened; the retry (seq=11) is in flight.
    expect(adapter.held.length).toBe(2);
    adapter.serverSeq = 20; // yet another tab jumps ahead again
    adapter.held[1].deliver(); // retry: 0 rows

    const outcome = await p;
    expect(outcome.error).toBeTruthy();
    expect(outcome.mode).toBe('cas');
    expect(adapter.row.title).not.toBe('UNLUCKY'); // nothing clobbered
  });

  test('PGRST204 (migration not applied yet): degrades to the LEGACY unguarded update and never breaks saving', async () => {
    let missing = true;
    const adapter = new FakeServerAdapter();
    adapter.readSeq = () =>
      missing
        ? Promise.resolve({
            error: {
              code: 'PGRST204',
              message: "Could not find the 'profile_write_seq' column of 'app_14da0f1941_profiles'",
            },
          })
        : Promise.resolve({ data: { profile_write_seq: adapter.serverSeq } });

    const guard = new ProfileWriteGuard(adapter);
    const first = await guard.update({ title: 'A' }, new AbortController().signal);
    expect(first.error).toBeNull();
    expect(first.mode).toBe('legacy');
    expect(adapter.unguardedCalls).toHaveLength(1);
    expect(adapter.unguardedCalls[0]).toEqual({ title: 'A' }); // no seq column sent

    // Sticky: subsequent writes stay in legacy mode without re-probing.
    const second = await guard.update({ title: 'B' }, new AbortController().signal);
    expect(second.mode).toBe('legacy');
    expect(adapter.unguardedCalls).toHaveLength(2);
  });

  test('a non-PGRST204 read error propagates as a recoverable error (and the next write retries the read)', async () => {
    const adapter = new FakeServerAdapter();
    let failRead = true;
    adapter.readSeq = () =>
      failRead
        ? Promise.resolve({ error: { code: '503', message: 'network down' } })
        : Promise.resolve({ data: { profile_write_seq: adapter.serverSeq } });

    const guard = new ProfileWriteGuard(adapter);
    const bad = await guard.update({ title: 'X' }, new AbortController().signal);
    expect(bad.error).toBeTruthy();

    failRead = false;
    const goodP = guard.update({ title: 'Y' }, new AbortController().signal);
    await waitFor(() => adapter.held.length === 1);
    adapter.held[0].deliver();
    const good = await goodP;
    expect(good.error).toBeNull();
    expect(good.mode).toBe('cas');
  });

  test('missing profile row (readSeq -> null) is a recoverable error, not a blind write', async () => {
    const adapter = new FakeServerAdapter();
    adapter.readSeq = () => Promise.resolve({ data: null });
    const guard = new ProfileWriteGuard(adapter);
    const outcome = await guard.update({ title: 'X' }, new AbortController().signal);
    expect(outcome.error).toBeTruthy();
    expect(adapter.held).toHaveLength(0); // nothing was written
  });

  test('sequential writes reuse the tracked seq (one read, monotonic writes)', async () => {
    const adapter = new FakeServerAdapter();
    const guard = new ProfileWriteGuard(adapter);

    const p1 = guard.update({ title: 'one' }, new AbortController().signal);
    await sleep(10);
    adapter.held[0].deliver();
    expect((await p1).error).toBeNull();

    const p2 = guard.update({ title: 'two' }, new AbortController().signal);
    await sleep(10);
    adapter.held[1].deliver();
    expect((await p2).error).toBeNull();

    const p3 = guard.update({ title: 'three' }, new AbortController().signal);
    await sleep(10);
    adapter.held[2].deliver();
    expect((await p3).error).toBeNull();

    expect(adapter.readSeqCalls).toBe(1);
    expect(adapter.held.map((w) => w.nextSeq)).toEqual([1, 2, 3]);
    expect(adapter.row.title).toBe('three');
  });
});
