import { test, expect } from '@playwright/test';

/**
 * Canonical D11 workforce readiness predicates — unit tests.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-007.
 * These tests pin the exact predicate semantics so that no component
 * (MatchReadyBanner, ProfileCompletionCard, SQL funnel view, Edge Functions)
 * can silently drift from the canonical definition documented in
 * brain/growth/federation-network/D11_PROFILE_MATURITY_MODEL.md.
 */

import {
  isCanonicalWorker,
  isComplete,
  availabilityState,
  isWorkforceReady,
  isPublic,
  isMatchable,
  hasCredentialEvidence,
  hasCredentialVerified,
  maturityState,
  readinessGaps,
  type WorkforceReadinessInput,
} from '../app/frontend/src/lib/workforceReadiness';

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
    experience_count: 1,
    certification_count: 0,
    verified_certification_count: 0,
    ...overrides,
  };
}

test.describe('isCanonicalWorker (D14 cohort)', () => {
  test('role worker is canonical', () => {
    expect(isCanonicalWorker(base())).toBe(true);
  });
  test('role user is NOT canonical even with account_type worker legacy', () => {
    expect(isCanonicalWorker(base({ role: 'user' }))).toBe(false);
  });
  test('role company/admin are not canonical', () => {
    expect(isCanonicalWorker(base({ role: 'company' }))).toBe(false);
    expect(isCanonicalWorker(base({ role: 'admin' }))).toBe(false);
  });
});

test.describe('isComplete (D11)', () => {
  test('full profile is COMPLETE', () => {
    expect(isComplete(base())).toBe(true);
  });
  test('missing title is not COMPLETE', () => {
    expect(isComplete(base({ title: null }))).toBe(false);
    expect(isComplete(base({ title: '   ' }))).toBe(false);
  });
  test('missing location is not COMPLETE', () => {
    expect(isComplete(base({ location: null }))).toBe(false);
  });
  test('bio must be longer than 10 trimmed chars', () => {
    expect(isComplete(base({ bio: 'short' }))).toBe(false);
    expect(isComplete(base({ bio: '  short  ' }))).toBe(false);
    expect(isComplete(base({ bio: 'long enough bio' }))).toBe(true);
  });
  test('skills must be a non-empty array', () => {
    expect(isComplete(base({ skills: null }))).toBe(false);
    expect(isComplete(base({ skills: [] }))).toBe(false);
  });
  test('years_experience must be set', () => {
    expect(isComplete(base({ years_experience: null }))).toBe(false);
  });
  test('non-canonical cohort is never COMPLETE', () => {
    expect(isComplete(base({ role: 'user' }))).toBe(false);
  });
});

test.describe('availabilityState (D11)', () => {
  test('NULL and empty are UNKNOWN', () => {
    expect(availabilityState(base({ availability_status: null }))).toBe('UNKNOWN');
    expect(availabilityState(base({ availability_status: '' }))).toBe('UNKNOWN');
  });
  test('not_specified is UNKNOWN (explicit PO rule)', () => {
    expect(availabilityState(base({ availability_status: 'not_specified' }))).toBe('UNKNOWN');
  });
  test('unrecognized strings are UNKNOWN', () => {
    expect(availabilityState(base({ availability_status: 'maybe_later' }))).toBe('UNKNOWN');
  });
  test('explicit availability values are AVAILABLE', () => {
    for (const s of ['available_immediately', 'available_soon', 'available_from_date']) {
      expect(availabilityState(base({ availability_status: s }))).toBe('AVAILABLE');
    }
  });
  test('not_currently_available is NOT_AVAILABLE (specified, not UNKNOWN)', () => {
    expect(availabilityState(base({ availability_status: 'not_currently_available' }))).toBe(
      'NOT_AVAILABLE',
    );
  });
});

test.describe('isWorkforceReady (D11)', () => {
  test('COMPLETE + experience + availability is WORKFORCE READY', () => {
    expect(isWorkforceReady(base())).toBe(true);
  });
  test('no structured experience blocks WORKFORCE READY even with years_experience', () => {
    expect(isWorkforceReady(base({ experience_count: 0 }))).toBe(false);
  });
  test('UNKNOWN availability blocks WORKFORCE READY', () => {
    expect(isWorkforceReady(base({ availability_status: null }))).toBe(false);
    expect(isWorkforceReady(base({ availability_status: 'not_specified' }))).toBe(false);
  });
  test('NOT_AVAILABLE still counts as WORKFORCE READY (availability is declared)', () => {
    expect(isWorkforceReady(base({ availability_status: 'not_currently_available' }))).toBe(true);
  });
  test('incomplete profile is never WORKFORCE READY', () => {
    expect(isWorkforceReady(base({ title: null }))).toBe(false);
  });
});

test.describe('isPublic (D11 visibility)', () => {
  test('profile_visibility public is PUBLIC', () => {
    expect(isPublic(base())).toBe(true);
  });
  test('cv_visible true is PUBLIC even without profile_visibility', () => {
    expect(isPublic(base({ profile_visibility: 'private', cv_visible: true }))).toBe(true);
  });
  test('private + cv not visible is PRIVATE', () => {
    expect(isPublic(base({ profile_visibility: 'private', cv_visible: false }))).toBe(false);
  });
});

test.describe('isMatchable (D11)', () => {
  test('WORKFORCE READY + PUBLIC + AVAILABLE is MATCHABLE', () => {
    expect(isMatchable(base())).toBe(true);
  });
  test('PRIVATE blocks MATCHABLE', () => {
    expect(
      isMatchable(base({ profile_visibility: 'private', cv_visible: false })),
    ).toBe(false);
  });
  test('NOT_AVAILABLE blocks MATCHABLE', () => {
    expect(isMatchable(base({ availability_status: 'not_currently_available' }))).toBe(false);
  });
  test('no experience blocks MATCHABLE', () => {
    expect(isMatchable(base({ experience_count: 0 }))).toBe(false);
  });
});

test.describe('credential predicates', () => {
  test('evidence = at least one certification row', () => {
    expect(hasCredentialEvidence(base({ certification_count: 0 }))).toBe(false);
    expect(hasCredentialEvidence(base({ certification_count: 1 }))).toBe(true);
  });
  test('verified = at least one verified certification row', () => {
    expect(hasCredentialVerified(base({ verified_certification_count: 0 }))).toBe(false);
    expect(hasCredentialVerified(base({ verified_certification_count: 1 }))).toBe(true);
  });
});

test.describe('maturityState', () => {
  test('empty-ish profile is REGISTERED', () => {
    expect(maturityState(base({ title: null, bio: null, skills: null }))).toBe('REGISTERED');
  });
  test('COMPLETE without experience is COMPLETE', () => {
    expect(maturityState(base({ experience_count: 0 }))).toBe('COMPLETE');
  });
  test('ready profile is WORKFORCE_READY', () => {
    expect(maturityState(base())).toBe('WORKFORCE_READY');
  });
});

test.describe('readinessGaps', () => {
  test('non-canonical cohort reports only cohort gap', () => {
    const gaps = readinessGaps(base({ role: 'user' }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].key).toBe('cohort');
  });
  test('lists every missing core field with COMPLETE unlock', () => {
    const gaps = readinessGaps(base({ title: null, skills: [] }));
    expect(gaps.map((g) => g.key)).toEqual(['title', 'skills']);
    expect(gaps.every((g) => g.unlocks === 'COMPLETE')).toBe(true);
  });
  test('after COMPLETE, experience and availability gaps unlock WORKFORCE_READY', () => {
    const gaps = readinessGaps(base({ experience_count: 0, availability_status: null }));
    expect(gaps.map((g) => g.key)).toEqual(['experience', 'availability']);
    expect(gaps.every((g) => g.unlocks === 'WORKFORCE_READY')).toBe(true);
  });
  test('WORKFORCE READY but PRIVATE reports visibility gap for MATCHABLE', () => {
    const gaps = readinessGaps(base({ profile_visibility: 'private', cv_visible: false }));
    expect(gaps.map((g) => g.key)).toEqual(['visibility']);
    expect(gaps[0].unlocks).toBe('MATCHABLE');
  });
  test('MATCHABLE profile has no gaps', () => {
    expect(readinessGaps(base())).toHaveLength(0);
  });
});
