/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 rev.2 (observación 4) — unit tests for
 * the serialized, abortable profile-write coordinator.
 *
 * Core scenario under test: a bounded write that exceeds its deadline (or is
 * superseded by a newer write) must NOT be allowed to land LATE and overwrite
 * newer state — the coordinator aborts the underlying request and ignores
 * its late settlement.
 */
import { test, expect } from '@playwright/test';
import { ProfileWriteCoordinator } from '../app/frontend/src/lib/profileWriteCoordinator';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('ProfileWriteCoordinator — no late write overwrites newer state', () => {
  test('saved: a clean 2xx is reported as saved', async () => {
    const c = new ProfileWriteCoordinator();
    const outcome = await c.runAuto({ run: async () => ({ error: null }) }, 1_000);
    expect(outcome.status).toBe('saved');
  });

  test('error: a PostgREST error is reported, never swallowed', async () => {
    const c = new ProfileWriteCoordinator();
    const pgError = { message: 'permission denied', code: '42501' };
    const outcome = await c.runAuto({ run: async () => ({ error: pgError }) }, 1_000);
    expect(outcome.status).toBe('error');
    expect(outcome.status === 'error' && outcome.error).toBe(pgError);
  });

  test('timeout: the underlying request is ABORTED (no late commit possible)', async () => {
    const c = new ProfileWriteCoordinator();
    let aborted = false;
    const outcome = await c.runAuto({
      run: (signal) =>
        new Promise<{ error: unknown }>(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    }, 40);
    expect(outcome.status).toBe('timeout');
    expect(aborted).toBe(true);
  });

  test('supersede: a newer autosave aborts the previous one; its late success is ignored', async () => {
    const c = new ProfileWriteCoordinator();
    const signals: AbortSignal[] = [];
    const resolvers: Array<(r: { error: unknown }) => void> = [];

    const first = c.runAuto({
      run: (signal) =>
        new Promise<{ error: unknown }>((resolve) => {
          signals.push(signal);
          resolvers.push(resolve);
        }),
    }, 5_000);
    await sleep(10);
    const second = c.runAuto({ run: async () => ({ error: null }) }, 5_000);

    // The first write was really cancelled...
    expect(signals[0].aborted).toBe(true);
    // ...and even if its thenable resolves LATE with success, the outcome is
    // NOT 'saved' — a late write can never be reported as persisted.
    resolvers[0]({ error: null });
    expect((await first).status).toBe('superseded');
    expect((await second).status).toBe('saved');
  });

  test('explicit write (Finish/Postpone) aborts an in-flight stale autosave before writing', async () => {
    const c = new ProfileWriteCoordinator();
    let autosaveAborted = false;
    let explicitStarted = false;

    const autosave = c.runAuto({
      run: (signal) =>
        new Promise<{ error: unknown }>(() => {
          signal.addEventListener('abort', () => {
            autosaveAborted = true;
          });
        }),
    }, 5_000);
    await sleep(10);

    const finish = c.runExplicit({
      run: async () => {
        explicitStarted = true;
        // The stale autosave must already be cancelled BEFORE the explicit
        // write touches the network.
        expect(autosaveAborted).toBe(true);
        return { error: null };
      },
    }, 5_000);

    expect(explicitStarted).toBe(true);
    expect((await autosave).status).toBe('superseded');
    expect((await finish).status).toBe('saved');
  });

  test('autosave during an explicit write is DROPPED, never sent', async () => {
    const c = new ProfileWriteCoordinator();
    let autosaveSent = false;
    let releaseExplicit!: (r: { error: unknown }) => void;

    const finish = c.runExplicit({
      run: () => new Promise<{ error: unknown }>((r) => (releaseExplicit = r)),
    }, 5_000);
    await sleep(10);

    const autosave = await c.runAuto({
      run: async () => {
        autosaveSent = true;
        return { error: null };
      },
    }, 5_000);
    expect(autosave.status).toBe('dropped');
    expect(autosaveSent).toBe(false);

    releaseExplicit({ error: null });
    expect((await finish).status).toBe('saved');
  });

  test('a synchronous throw from the builder is an error outcome, never a crash', async () => {
    const c = new ProfileWriteCoordinator();
    const outcome = await c.runAuto({
      run: () => {
        throw new Error('builder exploded');
      },
    }, 1_000);
    expect(outcome.status).toBe('error');
  });

  test('a rejected write promise is an error outcome', async () => {
    const c = new ProfileWriteCoordinator();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const outcome = await c.runAuto({ run: () => Promise.reject({ message: 'network down' }) as Promise<{ error: unknown }> }, 1_000);
    expect(outcome.status).toBe('error');
  });
});
