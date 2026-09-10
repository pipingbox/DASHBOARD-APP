import { test, expect } from '@playwright/test';

/**
 * Workforce readiness GA4 transitions — unit tests.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-007 (D18 conditions 4 and 5):
 * - the 8 D18 events with params from CLOSED enums only (no PII);
 * - events represent REAL D11 state transitions — identical snapshots
 *   (re-renders) must produce zero events.
 */

import {
  readinessSnapshot,
  diffReadinessEvents,
  withAvailabilityStatus,
} from '../app/frontend/src/lib/workforceReadinessEvents';
import { trackWorkforceEvent } from '../app/frontend/src/lib/analytics';
import type { WorkforceReadinessInput } from '../app/frontend/src/lib/workforceReadiness';

function base(overrides: Partial<WorkforceReadinessInput> = {}): WorkforceReadinessInput {
  return {
    role: 'worker',
    full_name: 'Jane Doe',
    title: 'Pipefitter',
    location: 'Antwerp',
    years_experience: 8,
    bio: 'Industrial pipefitter with petrochemical experience.',
    skills: ['pipefitting', 'isometrics'],
    availability_status: 'available_immediately',
    profile_visibility: 'public',
    cv_visible: false,
    qualifying_experience_count: 1,
    certification_count: 0,
    verified_certification_count: 0,
    ...overrides,
  };
}

test.describe('readinessSnapshot', () => {
  test('captures all D11 dimensions', () => {
    const s = readinessSnapshot(base());
    expect(s.isWorker).toBe(true);
    expect(s.isComplete).toBe(true);
    expect(s.isWorkforceReady).toBe(true);
    expect(s.isMatchable).toBe(true);
    expect(s.availability).toBe('AVAILABLE');
  });
  test('not_specified availability maps to UNKNOWN snapshot', () => {
    const s = readinessSnapshot(base({ availability_status: 'not_specified' }));
    expect(s.availability).toBe('UNKNOWN');
    expect(s.isWorkforceReady).toBe(false);
  });
});

test.describe('diffReadinessEvents — no duplicates on re-render', () => {
  test('identical snapshots produce zero events', () => {
    const a = readinessSnapshot(base());
    const b = readinessSnapshot(base({ ...base() })); // fresh object, same values
    expect(diffReadinessEvents(a, b)).toHaveLength(0);
  });
  test('unchanged maturity produces zero events even with fresh objects', () => {
    const prev = readinessSnapshot(base());
    const next = readinessSnapshot(base({ full_name: 'Jane Doe ' })); // same after trim
    expect(diffReadinessEvents(prev, next)).toHaveLength(0);
  });
});

test.describe('diffReadinessEvents — real transitions', () => {
  test('field completion emits profile_field_completed with field param', () => {
    const prev = readinessSnapshot(base({ title: null }));
    const next = readinessSnapshot(base());
    const events = diffReadinessEvents(prev, next);
    expect(events).toContainEqual({
      name: 'profile_field_completed',
      params: { field: 'title' },
    });
  });
  test('first structured experience emits experience_added', () => {
    const prev = readinessSnapshot(base({ qualifying_experience_count: 0 }));
    const next = readinessSnapshot(base());
    expect(diffReadinessEvents(prev, next)).toContainEqual({ name: 'experience_added' });
  });
  test('UNKNOWN -> specified availability emits availability_set', () => {
    const prev = readinessSnapshot(base({ availability_status: null }));
    const next = readinessSnapshot(base());
    expect(diffReadinessEvents(prev, next)).toContainEqual({ name: 'availability_set' });
  });
  test('NOT_AVAILABLE -> AVAILABLE does NOT emit availability_set (only first set does)', () => {
    const prev = readinessSnapshot(base({ availability_status: 'not_currently_available' }));
    const next = readinessSnapshot(base());
    const names = diffReadinessEvents(prev, next).map((e) => e.name);
    expect(names).not.toContain('availability_set');
  });
  test('visibility opt-in emits visibility_public_set', () => {
    const prev = readinessSnapshot(base({ profile_visibility: 'private', cv_visible: false }));
    const next = readinessSnapshot(base());
    expect(diffReadinessEvents(prev, next)).toContainEqual({ name: 'visibility_public_set' });
  });
  test('first certification emits certification_uploaded', () => {
    const prev = readinessSnapshot(base({ certification_count: 0 }));
    const next = readinessSnapshot(base({ certification_count: 1 }));
    expect(diffReadinessEvents(prev, next)).toContainEqual({ name: 'certification_uploaded' });
  });
  test('maturity transitions emit reached events', () => {
    const prev = readinessSnapshot(
      base({ title: null, qualifying_experience_count: 0, availability_status: null }),
    );
    const next = readinessSnapshot(base());
    const names = diffReadinessEvents(prev, next).map((e) => e.name);
    expect(names).toContain('profile_complete_reached');
    expect(names).toContain('workforce_ready_reached');
    expect(names).toContain('matchable_reached');
  });
  test('non-worker cohort emits nothing', () => {
    const prev = readinessSnapshot(base({ role: 'user', title: null }));
    const next = readinessSnapshot(base({ role: 'user' }));
    expect(diffReadinessEvents(prev, next)).toHaveLength(0);
  });
});

test.describe('withAvailabilityStatus', () => {
  test('attaches allowlisted raw status', () => {
    const e = withAvailabilityStatus(
      { name: 'availability_set' },
      'available_immediately',
    );
    expect(e.params?.status).toBe('available_immediately');
  });
  test('omits param for non-allowlisted raw values (no free-form strings)', () => {
    const e = withAvailabilityStatus({ name: 'availability_set' }, 'whenever_i_feel_like_it');
    expect(e.params).toBeUndefined();
  });
});

test.describe('trackWorkforceEvent — PII guard', () => {
  test('drops params outside the closed allowlists', () => {
    const calls: unknown[][] = [];
    const g = globalThis as unknown as {
      window?: { gtag?: (...a: unknown[]) => void };
    };
    g.window = {
      gtag: (...a: unknown[]) => calls.push(a),
    };
    try {
      trackWorkforceEvent('profile_field_completed', {
        // @ts-expect-error deliberately malformed param (PII attempt)
        field: 'Jane Doe CV final.pdf',
      });
    } finally {
      delete g.window;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('profile_field_completed');
    expect(calls[0][2]).toEqual({});
  });
  test('no-op when gtag is unavailable', () => {
    expect(() =>
      trackWorkforceEvent('matchable_reached', undefined),
    ).not.toThrow();
  });
});
