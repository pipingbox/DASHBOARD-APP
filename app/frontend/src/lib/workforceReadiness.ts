/**
 * Workforce Readiness — canonical D11 predicates.
 *
 * SINGLE SOURCE OF TRUTH for the workforce maturity funnel:
 *
 *   REGISTERED → COMPLETE → WORKFORCE READY → MATCHABLE
 *
 * Brain reference: brain/growth/federation-network/D11_PROFILE_MATURITY_MODEL.md
 * Workstream: PB-WORKFORCE-ACTIVATION (D18, approved 2026-09-10)
 * Ticket: WFA-007
 *
 * Rules:
 * - The canonical workforce cohort is role === 'worker' (D14). Never 'user'.
 * - years_experience is a summary field; it does NOT replace structured
 *   experience rows in app_worker_experiences.
 * - availability must be explicitly specified; NULL / 'not_specified' / ''
 *   count as UNKNOWN.
 * - PROFILE MATURITY, VISIBILITY and AVAILABILITY are independent dimensions.
 *   MATCHABLE = WORKFORCE_READY + PUBLIC + AVAILABLE.
 *
 * The SQL funnel view (supabase read-only view) MUST replicate these
 * predicates verbatim. Do not duplicate divergent logic in components.
 */

export type ProfileMaturity = 'REGISTERED' | 'COMPLETE' | 'WORKFORCE_READY';
export type AvailabilityState = 'UNKNOWN' | 'AVAILABLE' | 'NOT_AVAILABLE';
export type VisibilityState = 'PUBLIC' | 'PRIVATE';

export interface WorkforceReadinessInput {
  role: string | null;
  full_name: string | null;
  title: string | null;
  location: string | null;
  years_experience: number | null;
  bio: string | null;
  skills: string[] | null;
  availability_status: string | null;
  profile_visibility: string | null;
  cv_visible: boolean | null;
  /** Rows in app_worker_experiences for this user. */
  experience_count: number;
  /** Rows in worker certifications for this user. */
  certification_count: number;
  /** Certification rows with verified evidence. */
  verified_certification_count: number;
}

/**
 * Availability values that count as explicitly specified.
 * Any other value (NULL, '', 'not_specified', unknown strings) is UNKNOWN.
 */
export const AVAILABILITY_SPECIFIED = [
  'available_immediately',
  'available_soon',
  'available_from_date',
  'not_currently_available',
] as const;

/** Availability values that count as AVAILABLE (vs NOT_AVAILABLE). */
export const AVAILABILITY_AVAILABLE = [
  'available_immediately',
  'available_soon',
  'available_from_date',
] as const;

/** D14: canonical workforce cohort is role === 'worker'. */
export function isCanonicalWorker(i: { role: string | null }): boolean {
  return i.role === 'worker';
}

/**
 * COMPLETE (D11): canonical worker with core professional fields filled.
 * - full_name non-empty
 * - title non-empty
 * - location non-empty
 * - years_experience set (summary field)
 * - bio longer than 10 chars (trimmed)
 * - at least one skill
 */
export function isComplete(i: WorkforceReadinessInput): boolean {
  return (
    isCanonicalWorker(i) &&
    !!i.full_name?.trim() &&
    !!i.title?.trim() &&
    !!i.location?.trim() &&
    i.years_experience != null &&
    !!i.bio &&
    i.bio.trim().length > 10 &&
    Array.isArray(i.skills) &&
    i.skills.length > 0
  );
}

/**
 * AVAILABILITY dimension (D11).
 * - UNKNOWN: not specified (NULL / '' / 'not_specified' / unrecognized)
 * - NOT_AVAILABLE: explicitly declared not available
 * - AVAILABLE: explicitly declared available (immediately / soon / from date)
 */
export function availabilityState(i: WorkforceReadinessInput): AvailabilityState {
  const s = i.availability_status;
  if (!s || s === 'not_specified') return 'UNKNOWN';
  if (s === 'not_currently_available') return 'NOT_AVAILABLE';
  if ((AVAILABILITY_AVAILABLE as readonly string[]).includes(s)) return 'AVAILABLE';
  return 'UNKNOWN';
}

/**
 * WORKFORCE_READY (D11): COMPLETE + structured experience + known availability.
 * - experience_count >= 1 (app_worker_experiences rows; years_experience does
 *   NOT substitute)
 * - availability explicitly specified (AVAILABLE or NOT_AVAILABLE)
 */
export function isWorkforceReady(i: WorkforceReadinessInput): boolean {
  return (
    isComplete(i) &&
    i.experience_count >= 1 &&
    availabilityState(i) !== 'UNKNOWN'
  );
}

/**
 * VISIBILITY dimension (D11).
 * PUBLIC = profile_visibility === 'public' OR cv_visible === true.
 */
export function isPublic(i: WorkforceReadinessInput): boolean {
  return i.profile_visibility === 'public' || i.cv_visible === true;
}

export function visibilityState(i: WorkforceReadinessInput): VisibilityState {
  return isPublic(i) ? 'PUBLIC' : 'PRIVATE';
}

/**
 * MATCHABLE (D11): WORKFORCE_READY + PUBLIC + AVAILABLE.
 * Represents supply that could reasonably enter a hiring process today.
 */
export function isMatchable(i: WorkforceReadinessInput): boolean {
  return (
    isWorkforceReady(i) &&
    isPublic(i) &&
    availabilityState(i) === 'AVAILABLE'
  );
}

/** Credential evidence: at least one certification row (uploaded, not verified). */
export function hasCredentialEvidence(i: WorkforceReadinessInput): boolean {
  return i.certification_count >= 1;
}

/** Credential verified: at least one certification row with verified evidence. */
export function hasCredentialVerified(i: WorkforceReadinessInput): boolean {
  return i.verified_certification_count >= 1;
}

/**
 * Highest maturity state reached for display purposes.
 * MATCHABLE implies WORKFORCE_READY implies COMPLETE.
 */
export function maturityState(
  i: WorkforceReadinessInput,
): ProfileMaturity | 'MATCHABLE' {
  if (isWorkforceReady(i)) return 'WORKFORCE_READY';
  if (isComplete(i)) return 'COMPLETE';
  return 'REGISTERED';
}

/**
 * Ordered list of the next actions a worker can take to progress through the
 * funnel. Each entry names the exact gap so the UI can show precisely which
 * datum is missing and what it unlocks (PB-WORKFORCE-ACTIVATION P0-B).
 */
export interface ReadinessGap {
  key:
    | 'cohort'
    | 'full_name'
    | 'title'
    | 'location'
    | 'years_experience'
    | 'bio'
    | 'skills'
    | 'experience'
    | 'availability'
    | 'visibility';
  unlocks: 'COMPLETE' | 'WORKFORCE_READY' | 'MATCHABLE';
}

export function readinessGaps(i: WorkforceReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  if (!isCanonicalWorker(i)) {
    gaps.push({ key: 'cohort', unlocks: 'COMPLETE' });
    return gaps;
  }
  if (!i.full_name?.trim()) gaps.push({ key: 'full_name', unlocks: 'COMPLETE' });
  if (!i.title?.trim()) gaps.push({ key: 'title', unlocks: 'COMPLETE' });
  if (!i.location?.trim()) gaps.push({ key: 'location', unlocks: 'COMPLETE' });
  if (i.years_experience == null) gaps.push({ key: 'years_experience', unlocks: 'COMPLETE' });
  if (!i.bio || i.bio.trim().length <= 10) gaps.push({ key: 'bio', unlocks: 'COMPLETE' });
  if (!Array.isArray(i.skills) || i.skills.length === 0) {
    gaps.push({ key: 'skills', unlocks: 'COMPLETE' });
  }

  if (gaps.length === 0) {
    if (i.experience_count < 1) gaps.push({ key: 'experience', unlocks: 'WORKFORCE_READY' });
    if (availabilityState(i) === 'UNKNOWN') {
      gaps.push({ key: 'availability', unlocks: 'WORKFORCE_READY' });
    }
  }

  if (isWorkforceReady(i)) {
    if (!isPublic(i)) gaps.push({ key: 'visibility', unlocks: 'MATCHABLE' });
    if (availabilityState(i) !== 'AVAILABLE') {
      gaps.push({ key: 'availability', unlocks: 'MATCHABLE' });
    }
  }

  return gaps;
}
