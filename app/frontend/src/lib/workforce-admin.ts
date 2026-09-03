/**
 * PB-ADMIN-WORKFORCE-001 — Internal Workforce Operations: domain logic.
 *
 * Single home for the workforce request state machine, the company-facing
 * projection, coverage maths and the audit vocabulary. Components must not
 * re-implement any of this.
 *
 * Production reality this module is built against (read-only diagnostic,
 * 43 rows in app_14da0f1941_workforce_requests):
 *   status   → new: 24 · cancelled: 19
 *   priority → normal: 41 · high: 2
 *   recruiter_assigned → NULL in all 43
 *
 * Nothing here migrates or rewrites those values. Legacy tokens are mapped on
 * READ only; no UPDATE is ever issued against existing data.
 */

import { supabase, TABLES } from '@/lib/supabase';

/* ─── Canonical state machine ─── */

export const WORKFORCE_STATUSES = [
  {
    value: 'new',
    label: 'New',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-400',
  },
  {
    value: 'reviewing',
    label: 'Reviewing',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    dotColor: 'bg-cyan-400',
  },
  {
    value: 'sourcing',
    label: 'Sourcing',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
  {
    value: 'candidates_proposed',
    label: 'Candidates Proposed',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    dotColor: 'bg-violet-400',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    dotColor: 'bg-indigo-400',
  },
  {
    value: 'completed',
    label: 'Completed',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dotColor: 'bg-emerald-400',
  },
  {
    value: 'on_hold',
    label: 'On Hold',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dotColor: 'bg-amber-400',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    color: 'bg-red-500/10 text-red-400 border-red-500/30',
    dotColor: 'bg-red-400',
  },
] as const;

export type WorkforceStatus = (typeof WORKFORCE_STATUSES)[number]['value'];

/**
 * Tokens written by earlier iterations of the app. Mapped on read so no row is
 * ever mis-rendered, and never written back.
 *
 * `archived` was historically overloaded as a status. It is treated as an
 * archive flag, not as a pipeline state — see `isArchivedStatus`.
 */
export const LEGACY_STATUS_ALIASES: Record<string, WorkforceStatus> = {
  recruiting: 'sourcing',
  partially_staffed: 'in_progress',
  fully_staffed: 'in_progress',
  candidates_sent: 'candidates_proposed',
  closed: 'completed',
  rejected: 'cancelled',
  canceled: 'cancelled',
};

/** Statuses that were never part of the canonical set but exist as data. */
export function isArchivedStatus(raw: string | null | undefined): boolean {
  return (raw || '').toLowerCase() === 'archived';
}

/**
 * Resolve any stored value to a canonical status.
 * Returns `null` for values we have never seen, so the UI can show the raw
 * token instead of silently pretending it is something else — the exact bug
 * that made 19 `cancelled` rows render as "New" in the company view.
 */
export function normalizeStatus(raw: string | null | undefined): WorkforceStatus | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (WORKFORCE_STATUSES.some((s) => s.value === key)) return key as WorkforceStatus;
  return LEGACY_STATUS_ALIASES[key] ?? null;
}

const UNKNOWN_STATUS_STYLE = {
  color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600',
  dotColor: 'bg-zinc-500',
};

/** Badge config for any stored value, including unknown ones. */
export function getWorkforceStatusConfig(raw: string | null | undefined): {
  value: string;
  label: string;
  color: string;
  dotColor: string;
  known: boolean;
} {
  if (isArchivedStatus(raw)) {
    return { value: 'archived', label: 'Archived', ...UNKNOWN_STATUS_STYLE, known: true };
  }
  const canonical = normalizeStatus(raw);
  if (canonical) {
    const cfg = WORKFORCE_STATUSES.find((s) => s.value === canonical)!;
    return { value: cfg.value, label: cfg.label, color: cfg.color, dotColor: cfg.dotColor, known: true };
  }
  return {
    value: raw || 'unknown',
    label: raw ? raw.replace(/_/g, ' ') : 'Unknown',
    ...UNKNOWN_STATUS_STYLE,
    known: false,
  };
}

/**
 * Allowed forward transitions. `on_hold` and `cancelled` are reachable from any
 * live state; `cancelled` is terminal, `completed` may only reopen to
 * `in_progress`.
 */
const BASE_TRANSITIONS: Record<WorkforceStatus, WorkforceStatus[]> = {
  new: ['reviewing', 'sourcing'],
  reviewing: ['sourcing', 'new'],
  sourcing: ['candidates_proposed', 'reviewing'],
  candidates_proposed: ['in_progress', 'sourcing'],
  in_progress: ['completed', 'candidates_proposed'],
  completed: ['in_progress'],
  on_hold: ['reviewing', 'sourcing', 'in_progress'],
  cancelled: ['new'],
};

const INTERRUPTIBLE: WorkforceStatus[] = ['new', 'reviewing', 'sourcing', 'candidates_proposed', 'in_progress'];

export function getAllowedTransitions(raw: string | null | undefined): WorkforceStatus[] {
  const current = normalizeStatus(raw);
  // Unknown or archived values: allow re-entry into the canonical machine
  // rather than trapping the record in a state the admin cannot leave.
  if (!current) return ['new', 'reviewing', 'sourcing', 'in_progress', 'completed', 'on_hold', 'cancelled'];

  const next = [...BASE_TRANSITIONS[current]];
  if (INTERRUPTIBLE.includes(current)) {
    if (!next.includes('on_hold')) next.push('on_hold');
    if (!next.includes('cancelled')) next.push('cancelled');
  }
  return next;
}

/* ─── Company-facing projection ─── */

export type CompanyStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

const COMPANY_PROJECTION: Record<WorkforceStatus, CompanyStatus> = {
  new: 'NEW',
  reviewing: 'NEW',
  sourcing: 'IN_PROGRESS',
  candidates_proposed: 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  on_hold: 'ON_HOLD',
  cancelled: 'CANCELLED',
};

const COMPANY_STATUS_LABELS: Record<CompanyStatus, { label: string; color: string }> = {
  NEW: { label: 'New', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  ON_HOLD: { label: 'On Hold', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

/**
 * The simplified view a company is allowed to see. Internal granularity
 * (sourcing vs candidates_proposed) collapses into IN PROGRESS.
 */
export function getCompanyStatusConfig(raw: string | null | undefined): {
  value: string;
  label: string;
  color: string;
} {
  if (isArchivedStatus(raw)) {
    return { value: 'archived', label: 'Archived', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600' };
  }
  const canonical = normalizeStatus(raw);
  if (!canonical) {
    return {
      value: raw || 'unknown',
      label: raw ? raw.replace(/_/g, ' ') : 'Unknown',
      color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600',
    };
  }
  const projected = COMPANY_PROJECTION[canonical];
  return { value: projected, ...COMPANY_STATUS_LABELS[projected] };
}

/** Groups used by the company summary tiles. */
export function isPendingForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'NEW';
}
export function isActiveForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'IN_PROGRESS';
}
export function isFulfilledForCompany(raw: string | null | undefined): boolean {
  return getCompanyStatusConfig(raw).value === 'COMPLETED';
}

/* ─── Coverage (real values only — DEC-33) ─── */

export interface WorkforceCoverage {
  requested: number;
  assigned: number;
  percentage: number;
}

/**
 * Coverage derived strictly from stored values. No synthetic sub-buckets:
 * the platform only knows how many workers were requested and how many were
 * assigned, so that is all it may display.
 */
export function computeCoverage(req: {
  workers_requested?: number | null;
  workers_assigned?: number | null;
  coverage_percentage?: number | null;
}): WorkforceCoverage {
  const requested = Math.max(0, Number(req.workers_requested) || 0);
  const assigned = Math.max(0, Number(req.workers_assigned) || 0);
  const stored = Number(req.coverage_percentage);
  const percentage =
    Number.isFinite(stored) && stored > 0
      ? Math.min(100, Math.round(stored))
      : requested > 0
        ? Math.min(100, Math.round((assigned / requested) * 100))
        : 0;
  return { requested, assigned, percentage };
}

export function getCoverageTone(percentage: number): { text: string; bar: string } {
  if (percentage >= 100) return { text: 'text-emerald-400', bar: '#10b981' };
  if (percentage >= 50) return { text: 'text-amber-400', bar: '#f59e0b' };
  return { text: 'text-red-400', bar: '#ef4444' };
}

/* ─── Candidate pipeline ─── */

/**
 * Stages stored in app_14da0f1941_workforce_assignments.status.
 * The table exists with 0 rows, so this vocabulary is defined without any
 * migration of existing data.
 *
 * 2026-09-02: added `invited` and `interested` to model recruiter outreach
 * before a formal proposal. `rejected` is the terminal, non-destructive
 * withdrawal state.
 */
export const CANDIDATE_STAGES = [
  { value: 'shortlisted', label: 'Shortlisted', color: 'bg-zinc-500/10 text-zinc-300 border-zinc-600' },
  { value: 'invited', label: 'Invited', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { value: 'interested', label: 'Interested', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: 'proposed', label: 'Proposed', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { value: 'deployed', label: 'Deployed', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number]['value'];

/** Stages that count towards `workers_assigned`. */
export const COVERAGE_COUNTING_STAGES: CandidateStage[] = ['accepted', 'deployed'];

export function getCandidateStageConfig(raw: string | null | undefined) {
  return CANDIDATE_STAGES.find((s) => s.value === raw) ?? CANDIDATE_STAGES[0];
}

/* ─── Worker profile search for the candidate pipeline ─── */

export interface WorkerProfileFilters {
  keyword?: string;
  location?: string;
  workerType?: string;
  availability?: string;
  experience?: string;
  certification?: string;
  language?: string;
}

export interface WorkerProfileSearchResult {
  user_id: string;
  full_name: string | null;
  username: string | null;
  title: string | null;
  position: string | null;
  location: string | null;
  phone: string | null;
  worker_type: string | null;
  availability_status: string | null;
  years_experience: number | null;
  languages: string[] | null;
  skills: string[] | null;
  profile_completion: number | null;
}

const CANDIDATE_SEARCH_PAGE_SIZE = 20;

/**
 * Search worker profiles for the candidate pipeline.
 *
 * The query is defensive: it builds only the filters that map to columns known
 * to exist (or that PostgREST tolerates), and it always wraps the network call
 * so a runtime exception cannot leave the UI stuck in `searching` state.
 *
 * No match score is fabricated. Any ranking is left to the database order
 * (`created_at DESC`) until a real scoring model exists.
 */
export async function searchWorkerProfiles(
  filters: WorkerProfileFilters,
  page = 0,
): Promise<{ data: WorkerProfileSearchResult[]; error: Error | null; hasMore: boolean }> {
  try {
    let query = supabase
      .from(TABLES.profiles)
      .select(
        'user_id, full_name, username, title, position, location, phone, worker_type, availability_status, years_experience, languages, skills, profile_completion'
      )
      .in('role', ['worker', 'user'])
      .not('full_name', 'is', null);

    const keyword = filters.keyword?.trim();
    if (keyword && keyword.length >= 2) {
      query = query.or(
        `full_name.ilike.%${keyword}%,username.ilike.%${keyword}%,title.ilike.%${keyword}%,position.ilike.%${keyword}%,location.ilike.%${keyword}%`
      );
    }

    if (filters.location?.trim()) {
      query = query.ilike('location', `%${filters.location.trim()}%`);
    }

    if (filters.workerType?.trim()) {
      const wt = filters.workerType.trim();
      query = query.or(`worker_type.ilike.%${wt}%,title.ilike.%${wt}%,position.ilike.%${wt}%`);
    }

    if (filters.availability?.trim()) {
      query = query.eq('availability_status', filters.availability.trim());
    }

    if (filters.experience?.trim()) {
      const exp = filters.experience.trim();
      switch (exp) {
        case '0-2':
          query = query.lte('years_experience', 2);
          break;
        case '3-5':
          query = query.gte('years_experience', 3).lte('years_experience', 5);
          break;
        case '5-10':
          query = query.gte('years_experience', 5).lte('years_experience', 10);
          break;
        case '10+':
          query = query.gt('years_experience', 10);
          break;
      }
    }

    let certUserIds: string[] | null = null;
    if (filters.certification?.trim()) {
      const cert = filters.certification.trim().toLowerCase();
      const { data: certData, error: certErr } = await supabase
        .from(TABLES.workerCertifications)
        .select('user_id')
        .ilike('name', `%${cert}%`);
      if (certErr) {
        console.warn('[searchWorkerProfiles] Cert subquery failed:', certErr.message);
      } else {
        certUserIds = Array.from(new Set((certData || []).map((c: { user_id: string }) => c.user_id)));
        if (certUserIds.length === 0) {
          return { data: [], error: null, hasMore: false };
        }
        query = query.in('user_id', certUserIds);
      }
    }

    const from = page * CANDIDATE_SEARCH_PAGE_SIZE;
    const to = from + CANDIDATE_SEARCH_PAGE_SIZE - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return { data: [], error: new Error(error.message), hasMore: false };
    }

    let rows = (data || []) as WorkerProfileSearchResult[];

    // Language is filtered client-side because the exact column/shape is not
    // guaranteed across environments. This keeps the UI useful without risking
    // a 42703 column-does-not-exist error in production.
    if (filters.language?.trim()) {
      const lang = filters.language.trim().toLowerCase();
      rows = rows.filter((r) =>
        (r.languages || []).some((l) => l.toLowerCase().includes(lang))
      );
    }

    return { data: rows, error: null, hasMore: rows.length === CANDIDATE_SEARCH_PAGE_SIZE };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected worker search error';
    return { data: [], error: new Error(message), hasMore: false };
  }
}

/**
 * Build a WhatsApp deep-link for inviting a candidate.
 *
 * No WhatsApp Business API is used — this is just a pre-filled message link.
 * The recruiter still has to press Send, so no message leaves the device
 * without human confirmation.
 */
export function buildWhatsAppInviteUrl(
  phone: string,
  candidateName: string,
  requestSummary: { company?: string | null; workerType?: string | null; location?: string | null },
): string {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  const company = requestSummary.company || 'your company';
  const role = requestSummary.workerType || 'the open position';
  const location = requestSummary.location ? ` in ${requestSummary.location}` : '';
  const message = `Hi ${candidateName || 'there'}, I'm reaching out from PipingBox on behalf of ${company} regarding ${role}${location}. Would you be interested in learning more?`;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

/**
 * SECURITY GATE — PB-SEC-RLS-ASSIGNMENTS-001 + PB-SEC-RLS-AUDITLOG-001.
 *
 * Verified against production on 2026-08-31:
 *
 *   workforce_assignments — 0 rows, RLS enabled, but carrying legacy permissive
 *   policies (`public` SELECT/INSERT/UPDATE/DELETE with `true`, plus
 *   `authenticated` equivalents). No effective Data API grants exist today, so
 *   the exposure is *dormant*, not absent: the policies are wide open and only
 *   the missing grant is holding the door shut.
 *
 * That distinction is the whole reason this flag exists. Grants are the door;
 * policies are the filter, and they are only evaluated once the door opens.
 * Granting Data API access before rewriting the policies would publish worker
 * names, positions and internal notes to anonymous callers in the same instant.
 *
 * Order of operations, no shortcuts:
 *   1. apply `sql/PB-SEC-RLS-AUDITLOG-001-rls.sql`
 *   2. apply `sql/PB-SEC-RLS-ASSIGNMENTS-001-rls.sql`  (policies, then grants)
 *   3. apply `sql/PB-SEC-INTERNAL-DATA-001-internal-store.sql`
 *   4. apply `sql/PB-ADMIN-WORKFORCE-001-schema.sql`
 *   5. run   `sql/PB-ADMIN-WORKFORCE-001-verification.sql` — all checks PASS
 *   6. only then flip this to `true`
 *
 * ─── GATE CLEARED — 2026-09-01 ───
 *
 * All four files applied to production (`pipingbox` / `mwdauubztjxkbrefirbg`),
 * plus `pb_sec_workforce_acl_exact_fix_v491`, which revoked the legacy
 * `authenticated` grants the first pass had missed — TRUNCATE among them, and
 * RLS does not apply to TRUNCATE.
 *
 * Harness as versioned in PIPINGBOX-BRAIN@cc48517: **31 PASS / 0 FAIL**,
 * ROLLBACK confirmed, no residue (0 assignments, 0 internal rows, 0 audit
 * probes), 43 requests intact at 24 `new` / 19 `cancelled`. No dangerous
 * policies and no dangerous client-role ACLs remain.
 *
 * The dormant exposure described above is closed: the policies are admin-only
 * and the grants are exact. The gate was cleared on 2026-09-01 and the pipeline
 * was briefly enabled, but it is deliberately returned to `false` while
 * PB-MATCHING-NOTIFICATIONS-001 DDL/Edge Functions are staged and verified.
 * Re-enabling requires an explicit operational decision after E2E validation.
 */
export const CANDIDATE_PIPELINE_ENABLED = false;

export const CANDIDATE_PIPELINE_BLOCKED_REASON =
  'Candidate pipeline is temporarily disabled while PB-MATCHING-NOTIFICATIONS-001 (matching engine + notification queue) is staged and verified. It was previously cleared by PB-SEC-RLS-ASSIGNMENTS-001; re-enabling requires an explicit operational decision after E2E validation.';

/* ─── Column allow-lists ─── */

/**
 * Columns the company view is allowed to pull.
 *
 * `wr_auth_select_own_or_admin` grants SELECT on the whole row, so `select('*')`
 * ships every administrative column to the browser even when the UI does not
 * render it. Any internal field must be kept out of this list — and internal
 * notes must not live on this table at all (see `logWorkforceNote`).
 *
 * Be honest about what this list does and does not buy: it shrinks the payload
 * the app requests, it does NOT make the excluded columns unreadable. RLS has no
 * column masking, so a company can still ask the Data API for any column on its
 * own row. That is why the list is not the control — the control is that the
 * internal columns are never written. `notes` is deprecated at the schema level,
 * and recruiter ownership was moved out entirely to the admin-only store
 * (PB-SEC-INTERNAL-DATA-001), because a frontend allow-list is not a security
 * boundary.
 */
export const COMPANY_REQUEST_COLUMNS = [
  'id',
  'company_name',
  'contact_person',
  'country',
  'worker_type',
  'workers_requested',
  'workers_assigned',
  'coverage_percentage',
  'estimated_start_date',
  'project_duration',
  'priority',
  'status',
  // `recruiter_assigned` is deprecated and never written; ownership lives in
  // `workforceRequestInternal`. Never add it, or `notes`, here.
  'documentation_progress',
  'created_at',
].join(', ');

/* ─── Postgres error helpers ─── */

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** 42703 — undefined_column. Used by the capability probe. */
export function isMissingColumnError(error: PostgrestLikeError | null | undefined): boolean {
  return error?.code === '42703';
}

/** 42P01 — undefined_table. Used by the internal-store capability probe. */
export function isMissingTableError(error: PostgrestLikeError | null | undefined): boolean {
  return error?.code === '42P01' || /does not exist/i.test(error?.message ?? '');
}

/** 23514 — check_violation. Surfaces a CHECK constraint rejecting a new token. */
export function isCheckViolation(error: PostgrestLikeError | null | undefined): boolean {
  return error?.code === '23514';
}

/**
 * Turn an opaque Postgres failure into something an operator can act on.
 * A silent "update failed" is what hides schema drift for months.
 */
export function describeWorkforceError(error: PostgrestLikeError | null | undefined): string {
  if (!error) return 'Unknown error';
  if (isCheckViolation(error)) {
    return `Database rejected the value: ${error.message ?? 'check constraint violation'}. The status CHECK constraint needs widening — see brain/03-ENGINEERING/sql/PB-ADMIN-WORKFORCE-001-schema.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Column does not exist yet: ${error.message ?? 'undefined column'}. See brain/03-ENGINEERING/sql/PB-ADMIN-WORKFORCE-001-schema.sql.`;
  }
  return error.message ?? 'Unknown error';
}

/* ─── Schema capability probe ─── */

export interface WorkforceCapabilities {
  /** `archived` boolean column present on workforce_requests. */
  archived: boolean;
  /** Admin-only internal store present — see PB-SEC-INTERNAL-DATA-001. */
  internalStore: boolean;
}

let capabilitiesPromise: Promise<WorkforceCapabilities> | null = null;

/**
 * Two cheap probes per session, cached.
 *
 * Lets each control degrade honestly — disabled, with the reason on screen —
 * instead of failing silently when the schema is not there yet. A control that
 * pretends to work is worse than one that admits it cannot.
 */
export function detectWorkforceCapabilities(): Promise<WorkforceCapabilities> {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      const [archivedProbe, internalProbe] = await Promise.all([
        supabase.from(TABLES.workforceRequests).select('archived').limit(1),
        supabase.from(TABLES.workforceRequestInternal).select('request_id').limit(1),
      ]);
      return {
        archived: !isMissingColumnError(archivedProbe.error) && !archivedProbe.error,
        internalStore: !internalProbe.error,
      };
    })();
  }
  return capabilitiesPromise;
}

/* ─── Audit vocabulary & event emission ─── */

export const WORKFORCE_TARGET_TYPE = 'workforce_request';

export const WORKFORCE_AUDIT_ACTIONS = {
  statusChange: 'workforce_status_change',
  priorityChange: 'workforce_priority_change',
  recruiterAssigned: 'workforce_recruiter_assigned',
  note: 'workforce_note',
  candidateAdded: 'workforce_candidate_added',
  candidateInvited: 'workforce_candidate_invited',
  candidateInterested: 'workforce_candidate_interested',
  candidateStage: 'workforce_candidate_stage',
  candidateRemoved: 'workforce_candidate_removed',
  coverageUpdate: 'workforce_coverage_update',
  archived: 'workforce_archived',
} as const;

export type WorkforceAuditAction =
  (typeof WORKFORCE_AUDIT_ACTIONS)[keyof typeof WORKFORCE_AUDIT_ACTIONS];

export const WORKFORCE_ACTION_LABELS: { value: string; label: string; color: string }[] = [
  { value: WORKFORCE_AUDIT_ACTIONS.statusChange, label: 'WF Status', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.priorityChange, label: 'WF Priority', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.recruiterAssigned, label: 'WF Recruiter', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.note, label: 'WF Note', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateAdded, label: 'WF Candidate Added', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateInvited, label: 'WF Candidate Invited', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateInterested, label: 'WF Candidate Interested', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateStage, label: 'WF Candidate Stage', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.candidateRemoved, label: 'WF Candidate Removed', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.coverageUpdate, label: 'WF Coverage', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  { value: WORKFORCE_AUDIT_ACTIONS.archived, label: 'WF Archived', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
];

export interface WorkforceTimelineEntry {
  id: string;
  created_at: string;
  actor_email: string | null;
  action_type: string;
  details: string | null;
}

/**
 * Timeline for one request: the audit trail plus a synthesised "created" event,
 * since the original submission predates any audit logging.
 */
export async function fetchWorkforceTimeline(
  requestId: string,
  createdAt?: string | null,
): Promise<WorkforceTimelineEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.auditLogs)
    .select('id, created_at, actor_email, action_type, details')
    .eq('target_type', WORKFORCE_TARGET_TYPE)
    .eq('target_id', requestId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[WorkforceAdmin] Timeline fetch failed:', error.message);
  }

  const entries = ((data || []) as WorkforceTimelineEntry[]).slice();

  if (createdAt) {
    entries.push({
      id: `synthetic-created-${requestId}`,
      created_at: createdAt,
      actor_email: null,
      action_type: 'workforce_request_created',
      details: 'Request submitted through the public workforce form.',
    });
  }

  return entries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * Append-only internal note.
 *
 * Notes go to the audit log rather than to a column on workforce_requests: the
 * company holds SELECT on its own rows, so anything stored there travels to the
 * client. The audit table is never queried by company-facing code.
 */
export async function logWorkforceNote(requestId: string, note: string): Promise<boolean> {
  return emitWorkforceEvent({
    action: WORKFORCE_AUDIT_ACTIONS.note,
    requestId,
    details: note,
  });
}

/**
 * Fase D event surface. Every operational event funnels through here so future
 * fan-out (in-app notification, digest, webhook) has one insertion point.
 * No new mail provider: the existing SMTP alert stays untouched.
 */
export async function emitWorkforceEvent(params: {
  action: WorkforceAuditAction | string;
  requestId: string;
  details: string;
  /** Optional actor id, recorded so `recruiter_user_id` can be backfilled later. */
  actorUserId?: string | null;
}): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;

    // `al_admin_insert` enforces `actor_email = auth.jwt() ->> 'email'` so the
    // audit trail actually proves who did what. A placeholder like 'unknown'
    // would be rejected by the policy anyway; failing here gives a readable
    // reason instead of an opaque RLS violation.
    if (!email) {
      console.error('[WorkforceAdmin] Event emit aborted: no authenticated session email.');
      return false;
    }

    const suffix = params.actorUserId ? ` [user_id:${params.actorUserId}]` : '';

    const { error } = await supabase.from(TABLES.auditLogs).insert({
      actor_email: email,
      action_type: params.action,
      target_type: WORKFORCE_TARGET_TYPE,
      target_id: params.requestId,
      details: `${params.details}${suffix}`,
    });

    if (error) {
      console.error('[WorkforceAdmin] Event emit failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WorkforceAdmin] Event emit crashed:', err);
    return false;
  }
}

/* ─── Recruiter directory ─── */

export interface RecruiterOption {
  user_id: string;
  name: string;
}

/**
 * Internal staff eligible to own a request.
 *
 * Queries both roles even though `jobs_moderator` has zero members today, so
 * the selector fills itself once recruiters exist — no code change required.
 *
 * Emails are never stored on the assignment: the internal store keeps the
 * `user_id` as the stable reference plus a name snapshot, so the case file
 * still reads correctly if the person is renamed or leaves.
 */
export async function fetchRecruiterOptions(): Promise<RecruiterOption[]> {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('user_id, full_name, username, role')
    .in('role', ['admin', 'jobs_moderator'])
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[WorkforceAdmin] Recruiter fetch failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: Record<string, unknown>) => ({
      user_id: String(row.user_id ?? ''),
      name: String(row.full_name || row.username || '').trim(),
    }))
    .filter((r) => r.user_id && r.name);
}

/* ─── Internal case-file store (admin-only) ─── */

/**
 * Internal, admin-only state of a request.
 *
 * Lives in its own table rather than on `workforce_requests` because **RLS
 * filters rows, not columns**. A company that can SELECT its own request row can
 * ask the Data API for any column on that row, regardless of what the UI
 * renders — so an allow-list in the frontend shrinks the payload but is not a
 * security boundary. The frontend never is. See PB-SEC-INTERNAL-DATA-001.
 */
export interface WorkforceInternalState {
  request_id: string;
  recruiter_user_id: string | null;
  recruiter_name: string | null;
  updated_at?: string | null;
}

/**
 * Load internal state for a page of requests, keyed by request id.
 *
 * Deliberately a second round-trip instead of a PostgREST embed: embedding
 * depends on the foreign key being present in the schema cache, which would make
 * the whole admin list fail while the migration is still pending. Fetching
 * separately means a missing table costs one disabled control, not a blank page.
 */
export async function fetchInternalStates(
  requestIds: string[],
): Promise<Map<string, WorkforceInternalState>> {
  const result = new Map<string, WorkforceInternalState>();
  if (requestIds.length === 0) return result;

  const { data, error } = await supabase
    .from(TABLES.workforceRequestInternal)
    .select('request_id, recruiter_user_id, recruiter_name, updated_at')
    .in('request_id', requestIds);

  if (error) {
    // A missing table is the expected state until the migration is applied, and
    // the capability probe already reports it. Anything else is worth surfacing.
    if (!isMissingTableError(error)) {
      console.error('[WorkforceAdmin] Internal state fetch failed:', error.message);
    }
    return result;
  }

  for (const row of data || []) {
    const state = row as WorkforceInternalState;
    result.set(state.request_id, state);
  }
  return result;
}

/**
 * Assign or clear the recruiter who owns a request.
 *
 * Upsert on the primary key: one case file has exactly one internal state, and
 * the database is what guarantees that, not a read-then-write in the client.
 *
 * Clearing sets both fields to NULL rather than deleting the row, so the record
 * that the case file was once assigned survives. No client role holds DELETE on
 * this table.
 */
export async function saveInternalRecruiter(
  requestId: string,
  recruiter: RecruiterOption | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();

  const { error } = await supabase
    .from(TABLES.workforceRequestInternal)
    .upsert(
      {
        request_id: requestId,
        recruiter_user_id: recruiter?.user_id ?? null,
        recruiter_name: recruiter?.name ?? null,
        updated_by: sessionData?.session?.user?.id ?? null,
      },
      { onConflict: 'request_id' },
    );

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: INTERNAL_STORE_BLOCKED_REASON };
    }
    return { ok: false, error: describeWorkforceError(error) };
  }
  return { ok: true };
}

export const INTERNAL_STORE_BLOCKED_REASON =
  'Recruiter assignment is unavailable until PB-SEC-INTERNAL-DATA-001 (admin-only internal store) is applied in production. It is deliberately not stored on the request row, which the company can read.';

/* ─── Documentation progress ─── */

export const DEFAULT_DOCUMENTATION_KEYS = [
  'contracts',
  'certifications',
  'onboarding',
  'compliance',
  'medical',
  'payroll',
] as const;

export function normalizeDocumentationProgress(
  raw: unknown,
): Record<string, boolean> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > 0) {
      return Object.fromEntries(entries.map(([k, v]) => [k, Boolean(v)]));
    }
  }
  return Object.fromEntries(DEFAULT_DOCUMENTATION_KEYS.map((k) => [k, false]));
}

export function getDocumentationStats(progress: Record<string, boolean>): {
  done: number;
  total: number;
  percentage: number;
} {
  const values = Object.values(progress);
  const done = values.filter(Boolean).length;
  const total = values.length;
  return { done, total, percentage: total > 0 ? Math.round((done / total) * 100) : 0 };
}
