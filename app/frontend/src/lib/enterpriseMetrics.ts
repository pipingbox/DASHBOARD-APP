/**
 * PB-ENTERPRISE-TABLE-CONSTANTS-001 — derived metrics for the Enterprise Dashboard.
 *
 * Extracted from the page so the arithmetic can be tested without a browser. The page
 * keeps ownership of fetching and error handling; this module only turns rows into
 * numbers.
 *
 * Deliberately absent: any mapping between status vocabularies. Production applications
 * carry `applied` / `cancelled` / `rejected`, while the funnel below counts
 * `shortlisted` / `interviewed` / `offered` / `hired`. Those sets barely overlap, and
 * reconciling them is a product decision tracked in PB-ENTERPRISE-STATUS-VOCABULARY-001.
 * Inventing an equivalence here would hide the gap instead of surfacing it.
 */

/** One row of the single application fetch that feeds every application-derived metric. */
export interface EnterpriseApplicationRow {
  id: string;
  user_id: string | null;
  status: string;
}

export interface HiringFunnel {
  applications: number;
  shortlisted: number;
  interviewed: number;
  offered: number;
  hired: number;
}

export interface ApplicationMetrics {
  funnel: HiringFunnel;
  /** Distinct workers, not application rows. */
  distinctCandidates: number;
  /**
   * All-time, not month-to-date: the applications table records `previous_status` but no
   * transition timestamp, so a time window cannot be derived from it.
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
  const funnel: HiringFunnel = {
    applications: rows.length,
    shortlisted: rows.filter((row) => row.status === 'shortlisted').length,
    interviewed: rows.filter((row) => row.status === 'interviewed').length,
    offered: rows.filter((row) => row.status === 'offered').length,
    hired: rows.filter((row) => row.status === 'hired').length,
  };

  // One worker applying to three jobs is one candidate. Rows without a user_id are
  // skipped rather than collapsed into a single phantom candidate.
  const distinctCandidates = new Set(
    rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))
  ).size;

  return { funnel, distinctCandidates, hires: funnel.hired };
}
