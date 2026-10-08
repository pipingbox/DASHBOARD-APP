/**
 * Canonical onboarding model.
 *
 * The database column is `onboarding_status` (text) plus `marketplace_ready` (boolean).
 * There is no `onboarding_completed` column and one must never be reintroduced: writing it
 * makes PostgREST reject the *entire* statement, which silently drops `onboarding_status`
 * and `marketplace_ready` from the same UPDATE. That defect left every worker scoring 0 in
 * job matching. See PB-ADMIN-ONBOARDING-SCHEMA-001.
 */

export const ONBOARDING_STATUS = {
  AUTH_ONLY: 'AUTH_ONLY',
  PROFILE_STARTED: 'PROFILE_STARTED',
  PROFILE_COMPLETED: 'PROFILE_COMPLETED',
  MARKETPLACE_READY: 'MARKETPLACE_READY',
} as const;

export type OnboardingStatus =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

/**
 * Statuses that count as "the user finished the onboarding wizard".
 * `PROFILE_STARTED` deliberately does not qualify: the user skipped it.
 */
const COMPLETED_STATUSES: readonly string[] = [
  ONBOARDING_STATUS.PROFILE_COMPLETED,
  ONBOARDING_STATUS.MARKETPLACE_READY,
];

export function hasCompletedOnboarding(
  status: string | null | undefined,
): boolean {
  return !!status && COMPLETED_STATUSES.includes(status);
}

/**
 * PB-GROWTH-GATE-ONBOARDING-001 — gate decision, kept pure for unit tests.
 *
 * "Should the wizard block the app shell?" is NOT the same question as
 * "has the user finished onboarding?":
 *
 *   - COMPLETE  (hasCompletedOnboarding)      -> never gated.
 *   - POSTPONED (onboarding_postponed_at set) -> never gated; the user chose
 *     "Completar después". Still NOT completed for marketplace/readiness
 *     purposes: hasCompletedOnboarding is deliberately untouched.
 *   - IN PROGRESS / never started             -> gated only when the profile
 *     still lacks basic info or the account role was never chosen (the
 *     pre-existing OnboardingGate conditions, unchanged).
 */
export interface OnboardingGateInput {
  onboardingStatus: string | null | undefined;
  hasBasicInfo: boolean;
  needsRoleSelection: boolean;
  postponedAt: string | null | undefined;
}

export function shouldShowOnboardingWizard(input: OnboardingGateInput): boolean {
  if (hasCompletedOnboarding(input.onboardingStatus)) return false;
  if (input.postponedAt) return false;
  return !input.hasBasicInfo || input.needsRoleSelection;
}

/**
 * Canonical marketplace-readiness threshold.
 *
 * Mirrors the `recalculate-profiles` edge function, which is the source of truth:
 * a profile is marketplace-ready once its completion reaches 30%.
 */
export const MARKETPLACE_READY_MIN_COMPLETION = 30;

export function isMarketplaceReady(
  profileCompletion: number | null | undefined,
): boolean {
  return (profileCompletion ?? 0) >= MARKETPLACE_READY_MIN_COMPLETION;
}
