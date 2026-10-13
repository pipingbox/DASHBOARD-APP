/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 (rev.3, observación 4) — server-enforced
 * compare-and-set (CAS) guard for onboarding profile writes.
 *
 * Demonstrated defect (empirical probe against real Supabase QA PostgreSQL,
 * synthetic account): `ProfileWriteCoordinator` aborts a superseded write on
 * the CLIENT, but an aborted fetch may already be on the wire. The server can
 * receive and COMMIT that stale UPDATE after a newer write has landed —
 * clobbering newer state and even leaving the row internally incoherent
 * (stale title/skills + fresh location from two different writes).
 *
 * Fix: a monotonic per-tab sequence (`profile_write_seq` column, migration
 * sql/029) plus a CAS predicate on every wizard UPDATE:
 *
 *   UPDATE ... SET profile_write_seq = :next
 *   WHERE user_id = :uid AND profile_write_seq < :next
 *   RETURNING profile_write_seq;
 *
 * Semantics:
 *   - The seq is consumed per write INTENT: `lastSeq` advances when the write
 *     STARTS, not when it settles. A newer write in the same tab therefore
 *     always carries a higher seq than any aborted/late write before it —
 *     even if the aborted request is still in flight and lands last.
 *   - 0 updated rows = superseded on the SERVER (another tab advanced the
 *     seq, or the stale write landed first). This is NOT success: the guard
 *     resyncs (SELECT seq) and retries ONCE with a fresh payload+seq. Losing
 *     twice surfaces a recoverable error — never a false success.
 *   - Legacy databases without the column (migration not yet applied) fail
 *     with PostgREST PGRST204: the guard degrades to an UNGUARDED update —
 *     exactly the pre-fix behavior of main, so the deploy ordering can never
 *     break saving. (Safe order is still migration-first.)
 *
 * Pure dependency-free logic (adapter-injected) so the ordering semantics are
 * unit-testable deterministically and integration-testable against real
 * PostgreSQL via the real supabase-js adapter below.
 */

/** PostgREST-style result slice the guard needs. */
export interface GuardQueryResult {
  data?: unknown;
  error?: unknown;
}

/** Primitives the guard needs to talk to the profile row. */
export interface ProfileUpdateAdapter {
  /** SELECT profile_write_seq (single row or null). */
  readSeq(signal: AbortSignal): PromiseLike<GuardQueryResult>;
  /** CAS UPDATE ({...payload, profile_write_seq: nextSeq} WHERE seq < nextSeq, RETURNING seq). */
  writeWithSeq(
    payload: Record<string, unknown>,
    nextSeq: number,
    signal: AbortSignal,
  ): PromiseLike<GuardQueryResult>;
  /** Legacy unguarded UPDATE (column missing in the database). */
  writeUnguarded(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): PromiseLike<GuardQueryResult>;
}

export interface GuardedUpdateOutcome {
  /** null on success; truthy otherwise (caller treats as recoverable error). */
  error: unknown | null;
  /** 'cas' when the guard ran; 'legacy' when it degraded (missing column). */
  mode: 'cas' | 'legacy';
}

function isPostgrestMissingColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST204') return true;
  return typeof e.message === 'string' && e.message.includes('profile_write_seq');
}

function extractSeq(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const seq = (data as { profile_write_seq?: unknown }).profile_write_seq;
  return typeof seq === 'number' && Number.isFinite(seq) ? seq : null;
}

export class ProfileWriteGuard {
  /** Last seq this tab has consumed (advanced per write INTENT). */
  private lastSeq: number | null = null;
  /** true after PGRST204 — database without the column; degrade to legacy. */
  private legacyMode = false;

  constructor(private readonly adapter: ProfileUpdateAdapter) {}

  /**
   * Guarded profile UPDATE. Resolves `{ error: null }` only when the server
   * confirmed the CAS write (RETURNING row present) or — in legacy mode —
   * when the unguarded update returned success.
   */
  async update(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<GuardedUpdateOutcome> {
    if (this.legacyMode) return this.legacyUpdate(payload, signal);

    if (this.lastSeq === null) {
      const read = await this.adapter.readSeq(signal);
      if (read.error) {
        if (isPostgrestMissingColumn(read.error)) {
          this.legacyMode = true;
          return this.legacyUpdate(payload, signal);
        }
        return { error: read.error, mode: 'cas' };
      }
      const seq = extractSeq(read.data);
      if (seq === null) {
        // No row (or malformed): the wizard only ever updates an existing
        // own profile (ensureProfile); report a recoverable error.
        return { error: new Error('profile row not found for write guard'), mode: 'cas' };
      }
      this.lastSeq = seq;
    }

    // Single retry on cross-tab supersede: attempt 0 = first try, attempt 1
    // = after one resync. Losing twice is a real error, never a false success.
    for (let attempt = 0; ; attempt++) {
      const nextSeq = this.lastSeq + 1;
      // Consume the seq per INTENT: even if this write is aborted mid-flight
      // and lands late, any later write from this tab carries a higher seq.
      this.lastSeq = nextSeq;

      const write = await this.adapter.writeWithSeq(payload, nextSeq, signal);
      if (write.error) {
        if (isPostgrestMissingColumn(write.error)) {
          this.legacyMode = true;
          return this.legacyUpdate(payload, signal);
        }
        return { error: write.error, mode: 'cas' };
      }
      const rows = Array.isArray(write.data) ? write.data : [];
      if (rows.length > 0) return { error: null, mode: 'cas' };

      // 0 rows = superseded on the server (another tab, or our own aborted
      // write landed first). Resync and retry ONCE with the same payload.
      if (attempt >= 1) {
        return {
          error: new Error('profile write superseded twice (cross-tab contention)'),
          mode: 'cas',
        };
      }
      const resync = await this.adapter.readSeq(signal);
      if (resync.error) return { error: resync.error, mode: 'cas' };
      const seq = extractSeq(resync.data);
      if (seq === null) {
        return { error: new Error('profile row not found on guard resync'), mode: 'cas' };
      }
      this.lastSeq = seq;
    }
  }

  private async legacyUpdate(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<GuardedUpdateOutcome> {
    const write = await this.adapter.writeUnguarded(payload, signal);
    return { error: write.error ?? null, mode: 'legacy' };
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Adapter over the real supabase-js client. Type-only import above: this
 * module stays runtime-dependency-free for unit tests.
 */
export function createSupabaseProfileUpdateAdapter(
  client: SupabaseClient,
  table: string,
  userId: string,
): ProfileUpdateAdapter {
  return {
    readSeq: (signal) =>
      client
        .from(table)
        .select('profile_write_seq')
        .eq('user_id', userId)
        .abortSignal(signal)
        .maybeSingle(),
    writeWithSeq: (payload, nextSeq, signal) =>
      client
        .from(table)
        .update({ ...payload, profile_write_seq: nextSeq })
        .eq('user_id', userId)
        .lt('profile_write_seq', nextSeq)
        .select('profile_write_seq')
        .abortSignal(signal),
    writeUnguarded: (payload, signal) =>
      client
        .from(table)
        .update(payload)
        .eq('user_id', userId)
        .abortSignal(signal),
  };
}
