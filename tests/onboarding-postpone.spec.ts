/**
 * PB-GROWTH-GATE-ONBOARDING-001 — unit tests for the onboarding
 * complete / postponed / in-progress state model (the "Completar después"
 * gate trap fix).
 *
 * Contract under test:
 *   A. postponed users are never gated by the wizard
 *   B. postponed is NOT completed (marketplace/readiness semantics untouched)
 *   C. never-started / in-progress users keep the pre-existing gate behavior
 *   G. legacy PROFILE_STARTED users behave deterministically (no loop)
 *   9. onboarding_completed only means completed; postponed has its own
 *      dedicated, sanitized event in the closed taxonomy
 */
import { test, expect } from '@playwright/test';
import {
  ONBOARDING_STATUS,
  hasCompletedOnboarding,
  shouldShowOnboardingWizard,
} from '../app/frontend/src/lib/onboarding';
import { OBS_EVENT_NAMES } from '../app/frontend/src/lib/observability';

const STATUSES = [
  ONBOARDING_STATUS.AUTH_ONLY,
  ONBOARDING_STATUS.PROFILE_STARTED,
  ONBOARDING_STATUS.PROFILE_COMPLETED,
  ONBOARDING_STATUS.MARKETPLACE_READY,
] as const;

test('A: a postponed user is never gated, regardless of status or profile emptiness', () => {
  for (const status of [...STATUSES, null, undefined] as const) {
    for (const hasBasicInfo of [true, false]) {
      for (const needsRoleSelection of [true, false]) {
        expect(
          shouldShowOnboardingWizard({
            onboardingStatus: status,
            hasBasicInfo,
            needsRoleSelection,
            postponedAt: '2026-10-08T10:00:00Z',
          }),
        ).toBe(false);
      }
    }
  }
});

test('B: postponed is NOT completed — hasCompletedOnboarding semantics unchanged', () => {
  expect(hasCompletedOnboarding(ONBOARDING_STATUS.PROFILE_COMPLETED)).toBe(true);
  expect(hasCompletedOnboarding(ONBOARDING_STATUS.MARKETPLACE_READY)).toBe(true);
  // PROFILE_STARTED (the state a postponed user typically keeps) must NOT
  // count as completed: postponement must never fake readiness.
  expect(hasCompletedOnboarding(ONBOARDING_STATUS.PROFILE_STARTED)).toBe(false);
  expect(hasCompletedOnboarding(ONBOARDING_STATUS.AUTH_ONLY)).toBe(false);
  expect(hasCompletedOnboarding(null)).toBe(false);
  expect(hasCompletedOnboarding(undefined)).toBe(false);
});

test('C: never-started users keep the pre-existing gate behavior', () => {
  // New user, empty profile -> wizard (the normal signup -> onboarding path).
  expect(
    shouldShowOnboardingWizard({
      onboardingStatus: ONBOARDING_STATUS.AUTH_ONLY,
      hasBasicInfo: false,
      needsRoleSelection: false,
      postponedAt: null,
    }),
  ).toBe(true);
  // Incomplete but with basic info + role -> not gated (pre-existing rule).
  expect(
    shouldShowOnboardingWizard({
      onboardingStatus: ONBOARDING_STATUS.PROFILE_STARTED,
      hasBasicInfo: true,
      needsRoleSelection: false,
      postponedAt: null,
    }),
  ).toBe(false);
  // Missing role/account type -> gated even with basic info.
  expect(
    shouldShowOnboardingWizard({
      onboardingStatus: ONBOARDING_STATUS.PROFILE_STARTED,
      hasBasicInfo: true,
      needsRoleSelection: true,
      postponedAt: null,
    }),
  ).toBe(true);
});

test('G: legacy PROFILE_STARTED trap state is deterministic and loop-free', () => {
  // Before the fix this user was re-gated forever after "Completar después".
  // Now: not postponed yet -> gated once (they see the wizard with a working
  // postpone button); once postponed -> never gated again.
  const legacy = {
    onboardingStatus: ONBOARDING_STATUS.PROFILE_STARTED,
    hasBasicInfo: false,
    needsRoleSelection: false,
  };
  expect(shouldShowOnboardingWizard({ ...legacy, postponedAt: null })).toBe(true);
  expect(
    shouldShowOnboardingWizard({ ...legacy, postponedAt: '2026-10-08T10:00:00Z' }),
  ).toBe(false);
});

test('F: fully completed users are never gated (no regression)', () => {
  for (const status of [ONBOARDING_STATUS.PROFILE_COMPLETED, ONBOARDING_STATUS.MARKETPLACE_READY]) {
    expect(
      shouldShowOnboardingWizard({
        onboardingStatus: status,
        hasBasicInfo: false,
        needsRoleSelection: true,
        postponedAt: null,
      }),
    ).toBe(false);
  }
});

test('9/obs: onboarding_postponed exists in the closed taxonomy as its own event', () => {
  expect(OBS_EVENT_NAMES).toContain('onboarding_postponed');
  expect(OBS_EVENT_NAMES).toContain('onboarding_completed');
  // Distinct events: postponed must never be an alias of completed.
  expect(new Set(OBS_EVENT_NAMES).size).toBe(OBS_EVENT_NAMES.length);
});
