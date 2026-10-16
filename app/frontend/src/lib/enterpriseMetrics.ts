/**
 * PB-ENTERPRISE-TABLE-CONSTANTS-001 / PB-ENTERPRISE-STATUS-VOCABULARY-001 —
 * derived metrics for the Enterprise Dashboard.
 *
 * Extracted from the page so the arithmetic can be tested without a browser. The page
 * keeps ownership of fetching and error handling; this module only turns rows into
 * numbers.
 *
 * PB-COMPANY-MVP-PHASE-0-001 (2026-10-16): the funnel now counts the CANONICAL
 * status vocabulary of `app_update_application_status` (sql/034) instead of
 * `shortlisted`/`interviewed`/`offered`/`hired`, where `interviewed` and `offered`
 * matched no row that can ever exist. Every application row lands in exactly one
 * bucket and the buckets sum to `applications` — reconciliation is structural, not
 * aspirational. Legacy `cancelled` rows (written before sql/034) and any future
 * unknown token get their own buckets instead of being silently dropped.
 */

/**
 * Status tokens the RPC `app_update_application_status` accepts (sql/034), in
 * pipeline order. `pending_profile_validation` is the entry state for candidates
 * whose profile is not Marketplace Ready at apply time; `applied` means the
 * application was born (or became) reviewable.
 */
export const APPLICATION_ENTRY_STATUS = 'pending_profile_validation';

export const APPLICATION_PIPELINE_STATUSES = [
  'applied',
  'reviewed',
  'shortlisted',
  'sent_to_client',
  'interview',
  'hired',
] as const;

/** Terminal or removed-from-pipeline states. `cancelled` is a legacy token. */
export const APPLICATION_CLOSED_STATUSES = ['rejected', 'withdrawn', 'cancelled'] as const;

/** One row of the single application fetch that feeds every application-derived metric. */
export interface EnterpriseApplicationRow {
  id: string;
  user_id: string | null;
  status: string;
  /** Present when the caller needs per-job or per-recruiter counts. */
  job_id?: string;
}

export interface HiringFunnel {
  /** Total application rows, independent of status. */
  applications: number;
  /** Born `pending_profile_validation`: not yet presentable for review. */
  pendingProfileValidation: number;
  /** `applied` — Marketplace Ready at apply time (or activated later). */
  qualified: number;
  reviewed: number;
  shortlisted: number;
  sentToClient: number;
  interview: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  /** Legacy token written before sql/034; still present in production data. */
  cancelled: number;
  /** Any token outside the canonical vocabulary. Surfaced, never dropped. */
  unknown: number;
}

export interface ApplicationMetrics {
  funnel: HiringFunnel;
  /** Distinct workers, not application rows. */
  distinctCandidates: number;
  /**
   * All-time, not month-to-date: the applications table records `previous_status` but
   * no transition timestamp, so a time window cannot be derived from it.
   * (PB-ENTERPRISE-STATUS-VOCABULARY-001 D7 remains open at schema level.)
   */
  hires: number;
}

/**
 * Derives every application-based metric from one dataset.
 *
 * An empty array is a legitimate result — a company with no jobs, or with jobs but no
 * applications — and yields zeros. It is the caller's job to keep that distinct from a
 * failed query.
 */
export function deriveApplicationMetrics(
  rows: readonly EnterpriseApplicationRow[]
): ApplicationMetrics {
  const byStatus = (token: string) =>
    rows.filter((row) => (row.status || '').toLowerCase() === token).length;

  const known = new Set<string>([
    APPLICATION_ENTRY_STATUS,
    ...APPLICATION_PIPELINE_STATUSES,
    ...APPLICATION_CLOSED_STATUSES,
  ]);

  const funnel: HiringFunnel = {
    applications: rows.length,
    pendingProfileValidation: byStatus(APPLICATION_ENTRY_STATUS),
    qualified: byStatus('applied'),
    reviewed: byStatus('reviewed'),
    shortlisted: byStatus('shortlisted'),
    sentToClient: byStatus('sent_to_client'),
    interview: byStatus('interview'),
    hired: byStatus('hired'),
    rejected: byStatus('rejected'),
    withdrawn: byStatus('withdrawn'),
    cancelled: byStatus('cancelled'),
    unknown: rows.filter((row) => !known.has((row.status || '').toLowerCase())).length,
  };

  // One worker applying to three jobs is one candidate. Rows without a user_id are
  // skipped rather than collapsed into a single phantom candidate.
  const distinctCandidates = new Set(
    rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))
  ).size;

  return { funnel, distinctCandidates, hires: funnel.hired };
}

/**
 * Structural reconciliation: every row must be counted exactly once. Kept as an
 * explicit function so tests and future callers can assert the invariant instead of
 * re-deriving it.
 */
export function funnelAccountsForAllApplications(funnel: HiringFunnel): boolean {
  const sum =
    funnel.pendingProfileValidation +
    funnel.qualified +
    funnel.reviewed +
    funnel.shortlisted +
    funnel.sentToClient +
    funnel.interview +
    funnel.hired +
    funnel.rejected +
    funnel.withdrawn +
    funnel.cancelled +
    funnel.unknown;
  return sum === funnel.applications;
}
